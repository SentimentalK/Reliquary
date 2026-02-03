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
type Handler struct {
	Events  chan KeyEvent
	KeyCode int
	running bool
	cancel  context.CancelFunc
	mu      sync.Mutex
}

// NewHandler creates a new hotkey handler with the specified key code.
// Note: On macOS, Input Monitoring permission is required.
func NewHandler(keyCode int) (*Handler, error) {
	return &Handler{
		Events:  make(chan KeyEvent, 10),
		KeyCode: keyCode,
	}, nil
}

// UpdateKeyCode changes the hotkey to a new key code.
// This takes effect immediately without restart.
func (h *Handler) UpdateKeyCode(newKeyCode int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	if h.KeyCode == newKeyCode {
		return
	}
	
	h.KeyCode = newKeyCode
	updateHotkeyKeyCode(newKeyCode)
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
