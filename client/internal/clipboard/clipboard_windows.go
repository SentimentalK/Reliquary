//go:build windows
// +build windows

package clipboard

import (
	"syscall"
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	keybd_event = user32.NewProc("keybd_event")
)

const (
	VK_CONTROL      = 0x11
	VK_V            = 0x56
	KEYEVENTF_KEYUP = 0x0002
)

func (m *Manager) pasteMacOS() error {
	// Not applicable on Windows build
	return nil
}

func (m *Manager) pasteWindows() error {
	// Press Ctrl
	keybd_event.Call(uintptr(VK_CONTROL), 0, 0, 0)
	// Press V
	keybd_event.Call(uintptr(VK_V), 0, 0, 0)
	// Release V
	keybd_event.Call(uintptr(VK_V), 0, uintptr(KEYEVENTF_KEYUP), 0)
	// Release Ctrl
	keybd_event.Call(uintptr(VK_CONTROL), 0, uintptr(KEYEVENTF_KEYUP), 0)

	return nil
}

func (m *Manager) pasteLinux() error {
	// Not applicable on Windows build
	return nil
}
