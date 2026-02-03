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
				// Get current key code (may be updated at runtime)
				h.mu.Lock()
				keyCode := h.KeyCode
				h.mu.Unlock()

				// Check key state using the current key code
				ret, _, _ := getAsyncKeyState.Call(uintptr(keyCode))
				isPressed := (ret & 0x8000) != 0

				if isPressed && !wasPressed {
					h.Events <- KeyDown
				} else if !isPressed && wasPressed {
					h.Events <- KeyUp
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
