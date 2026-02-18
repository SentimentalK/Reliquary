// Package hotkey provides global hotkey detection for configurable keys.
package hotkey

import (
	"context"
	"runtime"
	"sync"
)

// Common key codes for reference (macOS):
// 61 = Right Option
// 58 = Left Option
// 60 = Right Shift
// 56 = Left Shift
// 59 = Left Control
// 62 = Right Control
// 55 = Left Command
// 54 = Right Command
// 49 = Space

// KeyEvent represents a hotkey press or release.
type KeyEvent int

const (
	KeyDown KeyEvent = iota
	KeyUp
)

// DefaultKeyCode is Right Option on macOS (61), Right Alt on Windows (0xA5)
var DefaultKeyCode = 61

// Handler manages global hotkey detection.
// Detects the configured key press and release.
//
// Thread Safety:
// - Uses RWMutex for concurrent access to KeyCode and listeningMode
// - listeningMode takes priority over trigger key detection
type Handler struct {
	Events  chan KeyEvent
	KeyCode int
	running bool
	cancel  context.CancelFunc

	// Thread safety: RWMutex protects KeyCode and learning mode state
	mu sync.RWMutex

	// Key Learning Mode
	// When true, next key press triggers OnKeyDetected instead of recording
	listeningMode bool
	// Callback invoked when a key is detected during learning mode
	OnKeyDetected func(int)
}

// NewHandler creates a new hotkey handler with the specified key code.
// Note: On macOS, Input Monitoring permission is required.
func NewHandler(keyCode int) (*Handler, error) {
	return &Handler{
		Events:  make(chan KeyEvent, 32),
		KeyCode: keyCode,
	}, nil
}

// SetTriggerKey safely updates the trigger key code.
// This takes effect immediately without restart.
// Thread-safe for use from Control Plane.
func (h *Handler) SetTriggerKey(keyCode int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.KeyCode == keyCode {
		return
	}

	h.KeyCode = keyCode
	updateHotkeyKeyCode(keyCode)
}

// UpdateKeyCode changes the hotkey to a new key code.
// Alias for SetTriggerKey for backwards compatibility.
func (h *Handler) UpdateKeyCode(newKeyCode int) {
	h.SetTriggerKey(newKeyCode)
}

// NOTE: EnableListeningMode is implemented in platform-specific files
// (hotkey_darwin.go, hotkey_windows.go, hotkey_linux.go) because it
// requires integration with the native event loop.

// DisableListeningMode manually disables key learning mode.
func (h *Handler) DisableListeningMode() {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.listeningMode = false
	h.OnKeyDetected = nil
}

// IsListening returns whether learning mode is active.
func (h *Handler) IsListening() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.listeningMode
}

// CheckAndHandle is called by OS-specific hooks when any key event occurs.
// Returns true if event was consumed (learning mode), false otherwise.
//
// Priority order:
// 1. If listeningMode: capture key, call OnKeyDetected, consume event
// 2. If keyCode == triggerKey: emit KeyDown/KeyUp event
func (h *Handler) CheckAndHandle(keyCode int, isDown bool) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Priority 1: Learning Mode (only on key down to avoid double-fire)
	if h.listeningMode && isDown {
		h.listeningMode = false
		callback := h.OnKeyDetected
		h.OnKeyDetected = nil

		if callback != nil {
			// Call async to avoid blocking the event loop
			go callback(keyCode)
		}

		return true // Consume event, don't trigger recording
	}

	// Priority 2: Trigger Key Detection
	// Note: This is handled in platform-specific code for now
	// This method is for future extension or alternative implementations
	return false
}

// GetKeyName returns a human-readable name for common key codes.
func GetKeyName(keyCode int) string {
	if runtime.GOOS == "darwin" {
		switch keyCode {
		case 61:
			return "Right Option"
		case 58:
			return "Left Option"
		case 60:
			return "Right Shift"
		case 56:
			return "Left Shift"
		case 59:
			return "Left Control"
		case 62:
			return "Right Control"
		case 55:
			return "Left Command"
		case 54:
			return "Right Command"
		case 49:
			return "Space"
		default:
			return "Unknown"
		}
	}
	// Windows key codes
	switch keyCode {
	case 0xA5:
		return "Right Alt"
	case 0xA4:
		return "Left Alt"
	case 0xA1:
		return "Right Shift"
	case 0xA0:
		return "Left Shift"
	case 0xA3:
		return "Right Control"
	case 0xA2:
		return "Left Control"
	default:
		return "Unknown"
	}
}
