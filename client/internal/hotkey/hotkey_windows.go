//go:build windows
// +build windows

package hotkey

import (
	"context"
	"syscall"
	"time"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	getAsyncKeyState = user32.NewProc("GetAsyncKeyState")
)

// updateHotkeyKeyCode updates the key code (no-op on Windows, handled by polling).
func updateHotkeyKeyCode(keyCode int) {
	// On Windows, the handler's KeyCode field is read directly in the polling loop
}

// Start begins listening for the configured key.
func (h *Handler) Start(ctx context.Context) error {
	h.running = true

	ctx, cancel := context.WithCancel(ctx)
	h.cancel = cancel

	go func() {
		wasPressed := false
		for h.running {
			select {
			case <-ctx.Done():
				return
			default:
				// Get current key code and listening mode state atomically
				h.mu.Lock()
				keyCode := h.KeyCode
				listening := h.listeningMode
				h.mu.Unlock()

				// If in learning mode, skip trigger key detection entirely.
				// The EnableListeningMode goroutine handles key detection.
				// Reset wasPressed so we don't generate a spurious KeyUp
				// when learning mode ends (possibly with a different key).
				if listening {
					wasPressed = false
					time.Sleep(10 * time.Millisecond)
					continue
				}

				// Check key state using the current key code
				ret, _, _ := getAsyncKeyState.Call(uintptr(keyCode))
				isPressed := (ret & 0x8000) != 0

				if isPressed && !wasPressed {
					select {
					case h.Events <- KeyDown:
					default:
					}
				} else if !isPressed && wasPressed {
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
				wasPressed = isPressed
				time.Sleep(10 * time.Millisecond)
			}
		}
	}()

	return nil
}

// Stop unregisters the hotkey.
func (h *Handler) Stop() error {
	if h.running {
		h.running = false
		if h.cancel != nil {
			h.cancel()
		}
	}
	return nil
}

// EnableListeningMode activates key learning mode on Windows.
// Uses polling to detect the next modifier key press.
func (h *Handler) EnableListeningMode(callback func(int)) {
	h.mu.Lock()
	h.listeningMode = true
	h.OnKeyDetected = callback
	h.mu.Unlock()

	// Start a goroutine to detect the next modifier key press
	go func() {
		// Windows modifier key codes
		modifierKeys := []int{
			0xA0, 0xA1, // Left/Right Shift
			0xA2, 0xA3, // Left/Right Control
			0xA4, 0xA5, // Left/Right Alt
			0x5B, 0x5C, // Left/Right Windows key
		}

		for {
			h.mu.RLock()
			listening := h.listeningMode
			h.mu.RUnlock()

			if !listening {
				return
			}

			for _, keyCode := range modifierKeys {
				ret, _, _ := getAsyncKeyState.Call(uintptr(keyCode))
				if (ret & 0x8000) != 0 {
					h.mu.Lock()
					h.listeningMode = false
					cb := h.OnKeyDetected
					h.OnKeyDetected = nil
					h.mu.Unlock()

					if cb != nil {
						cb(keyCode)
					}
					return
				}
			}
			time.Sleep(10 * time.Millisecond)
		}
	}()
}
