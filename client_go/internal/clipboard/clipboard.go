// Package clipboard provides clipboard and paste simulation.
package clipboard

import (
	"fmt"
	"runtime"
	"time"

	"golang.design/x/clipboard"
)

// Manager handles clipboard operations and paste simulation.
type Manager struct {
	initialized bool
}

// NewManager creates a new clipboard manager.
func NewManager() (*Manager, error) {
	// Initialize clipboard (required for golang.design/x/clipboard)
	if err := clipboard.Init(); err != nil {
		return nil, fmt.Errorf("failed to init clipboard: %w", err)
	}
	
	return &Manager{initialized: true}, nil
}

// SetTextAndPaste writes text to clipboard and simulates paste keystroke.
func (m *Manager) SetTextAndPaste(text string) error {
	if !m.initialized {
		return fmt.Errorf("clipboard not initialized")
	}

	// Write text to clipboard
	clipboard.Write(clipboard.FmtText, []byte(text))
	
	// Small delay to ensure clipboard is updated
	time.Sleep(50 * time.Millisecond)
	
	// Simulate paste keystroke
	return m.simulatePaste()
}

// simulatePaste triggers the paste keyboard shortcut.
// This uses CGO or system commands as golang.design/x/clipboard
// doesn't provide keystroke simulation.
func (m *Manager) simulatePaste() error {
	switch runtime.GOOS {
	case "darwin":
		return m.pasteMacOS()
	case "windows":
		return m.pasteWindows()
	case "linux":
		return m.pasteLinux()
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

// Platform-specific paste implementations are in separate files
// with build tags. See clipboard_darwin.go, clipboard_windows.go, etc.
