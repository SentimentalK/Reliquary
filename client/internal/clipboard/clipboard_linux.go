//go:build linux
// +build linux

package clipboard

import (
	"os/exec"
)

func (m *Manager) pasteMacOS() error {
	// Not applicable on Linux build
	return nil
}

func (m *Manager) pasteWindows() error {
	// Not applicable on Linux build
	return nil
}

func (m *Manager) pasteLinux() error {
	// Use xdotool for X11 environments
	// For Wayland, wtype could be used instead
	cmd := exec.Command("xdotool", "key", "ctrl+v")
	return cmd.Run()
}
