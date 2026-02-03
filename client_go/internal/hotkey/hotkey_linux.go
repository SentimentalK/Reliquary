//go:build linux
// +build linux

package hotkey

import (
	"context"
	"fmt"
)

// updateHotkeyKeyCode updates the key code (placeholder on Linux).
func updateHotkeyKeyCode(keyCode int) {
	// Linux implementation would update the key code here
}

// Start begins listening for the configured key.
func (h *Handler) Start(ctx context.Context) error {
	h.running = true

	ctx, cancel := context.WithCancel(ctx)
	h.cancel = cancel

	return fmt.Errorf("Linux support requires X11 setup. Key code: %d", h.KeyCode)
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
