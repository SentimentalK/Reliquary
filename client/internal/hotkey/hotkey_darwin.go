//go:build darwin
// +build darwin

package hotkey

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework ApplicationServices -framework Carbon

#include <ApplicationServices/ApplicationServices.h>
#include <Carbon/Carbon.h>
#include <stdio.h>

// Forward declaration for Go callback
extern void goKeyEventCallback(int eventType);

// Static variables
static CFMachPortRef hotkeyEventTap = NULL;
static CFRunLoopSourceRef hotkeyRunLoopSource = NULL;
static int hotkeyLastState = 0;
static int hotkeyTargetKeyCode = 61; // Default: Right Option

// Update key code at runtime
static void hotkeyUpdateKeyCode(int keyCode) {
    printf("[Hotkey] Updating key code: %d -> %d\n", hotkeyTargetKeyCode, keyCode);
    hotkeyTargetKeyCode = keyCode;
    hotkeyLastState = 0; // Reset state to avoid stuck key
}

// Static event tap callback
static CGEventRef hotkeyEventCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (hotkeyEventTap != NULL) {
            CGEventTapEnable(hotkeyEventTap, true);
        }
        return event;
    }

    // Get the key code
    CGKeyCode keyCode = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);

    // Check if it's our target key on flags changed
    if (type == kCGEventFlagsChanged && keyCode == hotkeyTargetKeyCode) {
        CGEventFlags flags = CGEventGetFlags(event);
        
        // Check the appropriate modifier based on key code
        int isPressed = 0;
        if (hotkeyTargetKeyCode == 61 || hotkeyTargetKeyCode == 58) {
            // Option keys
            isPressed = (flags & kCGEventFlagMaskAlternate) != 0;
        } else if (hotkeyTargetKeyCode == 60 || hotkeyTargetKeyCode == 56) {
            // Shift keys
            isPressed = (flags & kCGEventFlagMaskShift) != 0;
        } else if (hotkeyTargetKeyCode == 59 || hotkeyTargetKeyCode == 62) {
            // Control keys
            isPressed = (flags & kCGEventFlagMaskControl) != 0;
        } else if (hotkeyTargetKeyCode == 55 || hotkeyTargetKeyCode == 54) {
            // Command keys
            isPressed = (flags & kCGEventFlagMaskCommand) != 0;
        }

        if (isPressed && !hotkeyLastState) {
            hotkeyLastState = 1;
            goKeyEventCallback(0);
        } else if (!isPressed && hotkeyLastState) {
            hotkeyLastState = 0;
            goKeyEventCallback(1);
        }
    }

    return event;
}

static int hotkeyStartEventTap(int keyCode) {
    hotkeyLastState = 0;
    hotkeyTargetKeyCode = keyCode;

    printf("[Hotkey] Starting with key code: %d\n", keyCode);

    // Create event tap for modifier flags changes
    CGEventMask eventMask = CGEventMaskBit(kCGEventFlagsChanged);

    hotkeyEventTap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionDefault,
        eventMask,
        hotkeyEventCallback,
        NULL
    );

    if (hotkeyEventTap == NULL) {
        printf("[Hotkey] ERROR: Failed to create event tap!\n");
        return -1;
    }

    CGEventTapEnable(hotkeyEventTap, true);

    hotkeyRunLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, hotkeyEventTap, 0);
    if (hotkeyRunLoopSource == NULL) {
        return -2;
    }

    CFRunLoopAddSource(CFRunLoopGetMain(), hotkeyRunLoopSource, kCFRunLoopCommonModes);
    return 0;
}

static void hotkeyStopEventTap() {
    if (hotkeyEventTap != NULL) {
        CGEventTapEnable(hotkeyEventTap, false);
        CFRelease(hotkeyEventTap);
        hotkeyEventTap = NULL;
    }
    if (hotkeyRunLoopSource != NULL) {
        CFRelease(hotkeyRunLoopSource);
        hotkeyRunLoopSource = NULL;
    }
    hotkeyLastState = 0;
}
*/
import "C"

import (
	"context"
	"fmt"
)

var globalHandler *Handler

//export goKeyEventCallback
func goKeyEventCallback(eventType C.int) {
	if globalHandler == nil {
		return
	}
	if eventType == 0 {
		select {
		case globalHandler.Events <- KeyDown:
		default:
		}
	} else {
		select {
		case globalHandler.Events <- KeyUp:
		default:
		}
	}
}

// updateHotkeyKeyCode updates the key code in the C layer.
func updateHotkeyKeyCode(keyCode int) {
	C.hotkeyUpdateKeyCode(C.int(keyCode))
}

// Start begins listening for the configured key.
func (h *Handler) Start(ctx context.Context) error {
	globalHandler = h
	h.running = true

	_, cancel := context.WithCancel(ctx)
	h.cancel = cancel

	// Start event tap with the configured key code
	result := C.hotkeyStartEventTap(C.int(h.KeyCode))
	if result != 0 {
		return fmt.Errorf("failed to create event tap (code %d). Grant Input Monitoring permission", result)
	}

	go func() {
		<-ctx.Done()
		h.Stop()
	}()

	return nil
}

// Stop unregisters the hotkey.
func (h *Handler) Stop() error {
	if h.running {
		h.running = false
		C.hotkeyStopEventTap()
		globalHandler = nil
	}
	return nil
}
