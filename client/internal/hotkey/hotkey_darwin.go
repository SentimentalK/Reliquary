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
// Now receives: eventType (0=down, 1=up), keyCode (the actual key)
extern void goKeyEventCallback(int eventType, int keyCode);

// Static variables
static CFMachPortRef hotkeyEventTap = NULL;
static CFRunLoopSourceRef hotkeyRunLoopSource = NULL;
static int hotkeyLastState = 0;
static int hotkeyTargetKeyCode = 61; // Default: Right Option
static int hotkeyListeningMode = 0;  // When 1, report all modifier key presses

// Update key code at runtime
static void hotkeyUpdateKeyCode(int keyCode) {
    printf("[Hotkey] Updating key code: %d -> %d\n", hotkeyTargetKeyCode, keyCode);
    hotkeyTargetKeyCode = keyCode;
    hotkeyLastState = 0; // Reset state to avoid stuck key
}

// Enable/disable listening mode (for key learning)
static void hotkeySetListeningMode(int enabled) {
    printf("[Hotkey] Listening mode: %s\n", enabled ? "ON" : "OFF");
    hotkeyListeningMode = enabled;
}

// Check if a modifier key is pressed based on its key code
static int isModifierPressed(CGEventFlags flags, int keyCode) {
    switch (keyCode) {
        case 61: case 58: // Option keys
            return (flags & kCGEventFlagMaskAlternate) != 0;
        case 60: case 56: // Shift keys
            return (flags & kCGEventFlagMaskShift) != 0;
        case 59: case 62: // Control keys
            return (flags & kCGEventFlagMaskControl) != 0;
        case 55: case 54: // Command keys
            return (flags & kCGEventFlagMaskCommand) != 0;
        default:
            return 0;
    }
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
    CGEventFlags flags = CGEventGetFlags(event);

    // Learning Mode: Report any modifier key press
    if (hotkeyListeningMode && type == kCGEventFlagsChanged) {
        // Check if this is a known modifier key being pressed
        int isPressed = isModifierPressed(flags, keyCode);
        if (isPressed) {
            // Report the detected key and auto-disable listening mode
            hotkeyListeningMode = 0;
            goKeyEventCallback(2, keyCode);  // eventType 2 = learning mode detection
            return event;
        }
    }

    // Normal mode: Check if it's our target key
    if (type == kCGEventFlagsChanged && keyCode == hotkeyTargetKeyCode) {
        int isPressed = isModifierPressed(flags, keyCode);

        if (isPressed && !hotkeyLastState) {
            hotkeyLastState = 1;
            goKeyEventCallback(0, keyCode);  // KeyDown
        } else if (!isPressed && hotkeyLastState) {
            hotkeyLastState = 0;
            goKeyEventCallback(1, keyCode);  // KeyUp
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
    hotkeyListeningMode = 0;
}
*/
import "C"

import (
	"context"
	"fmt"
)

var globalHandler *Handler

//export goKeyEventCallback
func goKeyEventCallback(eventType C.int, keyCode C.int) {
	if globalHandler == nil {
		return
	}

	switch eventType {
	case 0: // KeyDown
		select {
		case globalHandler.Events <- KeyDown:
		default:
		}
	case 1: // KeyUp
		select {
		case globalHandler.Events <- KeyUp:
		default:
		}
	case 2: // Learning Mode - Key Detected
		globalHandler.mu.Lock()
		callback := globalHandler.OnKeyDetected
		globalHandler.listeningMode = false
		globalHandler.OnKeyDetected = nil
		globalHandler.mu.Unlock()

		if callback != nil {
			// Call async to not block the event loop
			go callback(int(keyCode))
		}
		fmt.Printf("[Hotkey] Learning mode: detected key code %d\n", int(keyCode))
	}
}

// updateHotkeyKeyCode updates the key code in the C layer.
func updateHotkeyKeyCode(keyCode int) {
	C.hotkeyUpdateKeyCode(C.int(keyCode))
}

// setListeningMode enables or disables listening mode in the C layer.
func setListeningMode(enabled bool) {
	if enabled {
		C.hotkeySetListeningMode(C.int(1))
	} else {
		C.hotkeySetListeningMode(C.int(0))
	}
}

// EnableListeningModeDarwin activates key learning in the C event tap.
// This overrides the generic hotkey.go version for macOS.
func (h *Handler) EnableListeningMode(callback func(int)) {
	h.mu.Lock()
	h.listeningMode = true
	h.OnKeyDetected = callback
	h.mu.Unlock()

	// Also enable in C layer so it handles the event
	setListeningMode(true)
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
