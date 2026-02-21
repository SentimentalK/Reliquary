//go:build linux
// +build linux

// Linux hotkey implementation using evdev (input event device).
//
// Reads raw input events from /dev/input/event* devices.
// Requires read permission on these devices:
//   - Add user to 'input' group: sudo usermod -aG input $USER
//   - Or run as root (not recommended)
//
// Key codes use Linux evdev codes (see linux/input-event-codes.h).
// Common modifier keys:
//   KEY_LEFTSHIFT=42, KEY_RIGHTSHIFT=54
//   KEY_LEFTCTRL=29,  KEY_RIGHTCTRL=97
//   KEY_LEFTALT=56,   KEY_RIGHTALT=100
//   KEY_LEFTMETA=125, KEY_RIGHTMETA=126

package hotkey

import (
	"context"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"unsafe"
)

// evdev constants
const (
	evKey      = 0x01 // EV_KEY event type
	keyRelease = 0    // Key released
	keyPress   = 1    // Key pressed
	// keyRepeat = 2  // Autorepeat (ignored)
)

var (
	// Track open device files so Stop() can close them to unblock reads
	deviceFilesMu sync.Mutex
	deviceFiles   []*os.File
)

// updateHotkeyKeyCode is a no-op on Linux.
// The polling goroutines read h.KeyCode directly under lock.
func updateHotkeyKeyCode(keyCode int) {}

// eviocgbit returns the ioctl request number for EVIOCGBIT(ev, len).
// Formula: _IOC(_IOC_READ, 'E', 0x20 + ev, len)
// This is the standard Linux ioctl encoding for x86/x86_64/ARM/ARM64.
func eviocgbit(ev, length int) uintptr {
	// _IOC_READ=2, type='E'=0x45, nr=0x20+ev, size=length
	return uintptr(2<<30 | 0x45<<8 | (0x20 + ev) | length<<16)
}

// findKeyboardDevices returns paths to /dev/input/event* that support EV_KEY.
func findKeyboardDevices() ([]string, error) {
	matches, err := filepath.Glob("/dev/input/event*")
	if err != nil {
		return nil, fmt.Errorf("failed to scan /dev/input/: %w", err)
	}

	if len(matches) == 0 {
		return nil, fmt.Errorf("no event devices found in /dev/input/")
	}

	var keyboards []string
	for _, path := range matches {
		f, err := os.Open(path)
		if err != nil {
			continue // Permission denied or device busy, skip
		}

		// Query supported event types via EVIOCGBIT(0, len)
		evBits := make([]byte, 4)
		_, _, errno := syscall.Syscall(
			syscall.SYS_IOCTL,
			f.Fd(),
			eviocgbit(0, len(evBits)),
			uintptr(unsafe.Pointer(&evBits[0])),
		)
		f.Close()

		if errno != 0 {
			continue
		}

		// Check if EV_KEY (bit 1) is supported
		if evBits[0]&(1<<evKey) != 0 {
			keyboards = append(keyboards, path)
		}
	}

	return keyboards, nil
}

// Start begins listening for the configured key using evdev.
// Opens all keyboard devices and monitors them in parallel goroutines.
func (h *Handler) Start(ctx context.Context) error {
	h.running = true

	ctx, cancel := context.WithCancel(ctx)
	h.cancel = cancel

	devices, err := findKeyboardDevices()
	if err != nil {
		return fmt.Errorf("keyboard detection failed: %w", err)
	}
	if len(devices) == 0 {
		return fmt.Errorf("no accessible keyboard devices found. " +
			"Add your user to the 'input' group: sudo usermod -aG input $USER " +
			"(then log out and back in)")
	}

	fmt.Printf("[Hotkey] Found %d input device(s) with key capability\n", len(devices))

	opened := 0
	for _, devPath := range devices {
		f, err := os.Open(devPath)
		if err != nil {
			fmt.Printf("[Hotkey] Skipping %s: %v\n", devPath, err)
			continue
		}

		deviceFilesMu.Lock()
		deviceFiles = append(deviceFiles, f)
		deviceFilesMu.Unlock()

		go h.monitorDevice(ctx, f, devPath)
		opened++
	}

	if opened == 0 {
		return fmt.Errorf("could not open any keyboard devices. " +
			"Add your user to the 'input' group: sudo usermod -aG input $USER")
	}

	fmt.Printf("[Hotkey] Monitoring %d keyboard device(s)\n", opened)
	return nil
}

// monitorDevice reads evdev events from a single device file.
// Blocks on read; exits when the file is closed or context is cancelled.
func (h *Handler) monitorDevice(ctx context.Context, f *os.File, devPath string) {
	defer f.Close()

	// input_event struct layout:
	//   struct timeval time;   // sizeof(Timeval) bytes
	//   __u16 type;            // 2 bytes
	//   __u16 code;            // 2 bytes
	//   __s32 value;           // 4 bytes
	timevalSize := int(unsafe.Sizeof(syscall.Timeval{}))
	eventSize := timevalSize + 8 // type(2) + code(2) + value(4)

	buf := make([]byte, eventSize)

	for h.running {
		// Blocking read — unblocked by closing f in Stop()
		n, err := f.Read(buf)
		if err != nil {
			if h.running {
				// Device might have been removed or file closed for shutdown
				fmt.Printf("[Hotkey] Device %s read error: %v\n", devPath, err)
			}
			return
		}
		if n < eventSize {
			continue
		}

		// Parse event fields after the timeval
		evType := binary.LittleEndian.Uint16(buf[timevalSize:])
		evCode := binary.LittleEndian.Uint16(buf[timevalSize+2:])
		evValue := int32(binary.LittleEndian.Uint32(buf[timevalSize+4:]))

		// Only process key events (ignore EV_SYN, EV_MSC, etc.)
		if evType != evKey {
			continue
		}

		keyCode := int(evCode)
		isDown := evValue == keyPress
		isUp := evValue == keyRelease

		// Ignore autorepeat events (value == 2)
		if !isDown && !isUp {
			continue
		}

		// Priority 1: Learning Mode — capture any key press
		h.mu.Lock()
		listening := h.listeningMode
		targetKey := h.KeyCode

		if listening && isDown {
			h.listeningMode = false
			cb := h.OnKeyDetected
			h.OnKeyDetected = nil
			h.mu.Unlock()

			if cb != nil {
				go cb(keyCode)
			}
			fmt.Printf("[Hotkey] Learning mode: detected key code %d\n", keyCode)
			continue
		}
		h.mu.Unlock()

		// Skip trigger detection during learning mode
		if listening {
			continue
		}

		// Priority 2: Trigger Key Detection
		if keyCode == targetKey {
			if isDown {
				select {
				case h.Events <- KeyDown:
				default:
				}
			} else if isUp {
				select {
				case h.Events <- KeyUp:
				default:
					// KeyUp is critical — drain one stale event and retry
					select {
					case <-h.Events:
					default:
					}
					select {
					case h.Events <- KeyUp:
					default:
					}
				}
			}
		}
	}
}

// Stop closes all device files and stops monitoring.
func (h *Handler) Stop() error {
	if h.running {
		h.running = false
		if h.cancel != nil {
			h.cancel()
		}

		// Close all device files to unblock blocking reads
		deviceFilesMu.Lock()
		for _, f := range deviceFiles {
			f.Close()
		}
		deviceFiles = nil
		deviceFilesMu.Unlock()
	}
	return nil
}

// EnableListeningMode activates key learning mode on Linux.
// The monitorDevice goroutines check listeningMode on every event,
// so no separate detection goroutine is needed (unlike Windows).
func (h *Handler) EnableListeningMode(callback func(int)) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.listeningMode = true
	h.OnKeyDetected = callback
	fmt.Println("[Hotkey] Learning mode enabled (press any key)")
}
