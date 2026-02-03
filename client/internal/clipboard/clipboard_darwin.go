//go:build darwin
// +build darwin

package clipboard

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework Carbon

#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>

static void clipboardSimulateCmdV() {
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    
    CGEventRef cmdDown = CGEventCreateKeyboardEvent(source, kVK_Command, true);
    CGEventRef vDown = CGEventCreateKeyboardEvent(source, kVK_ANSI_V, true);
    CGEventRef vUp = CGEventCreateKeyboardEvent(source, kVK_ANSI_V, false);
    CGEventRef cmdUp = CGEventCreateKeyboardEvent(source, kVK_Command, false);
    
    CGEventSetFlags(vDown, kCGEventFlagMaskCommand);
    CGEventSetFlags(vUp, kCGEventFlagMaskCommand);
    
    CGEventPost(kCGHIDEventTap, cmdDown);
    CGEventPost(kCGHIDEventTap, vDown);
    CGEventPost(kCGHIDEventTap, vUp);
    CGEventPost(kCGHIDEventTap, cmdUp);
    
    CFRelease(cmdDown);
    CFRelease(vDown);
    CFRelease(vUp);
    CFRelease(cmdUp);
    CFRelease(source);
}
*/
import "C"

func (m *Manager) pasteMacOS() error {
	C.clipboardSimulateCmdV()
	return nil
}

func (m *Manager) pasteWindows() error {
	// Not applicable on macOS build
	return nil
}

func (m *Manager) pasteLinux() error {
	// Not applicable on macOS build
	return nil
}
