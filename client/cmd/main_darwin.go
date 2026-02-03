//go:build darwin
// +build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>

static void mainRunApp() {
    @autoreleasepool {
        // Create a minimal NSApplication and run its event loop
        // This is more reliable than CFRunLoopRun for CGEventTap
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [NSApp run];
    }
}

static void mainStopApp() {
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSApp stop:nil];
        // Post a dummy event to wake up the run loop
        NSEvent *event = [NSEvent otherEventWithType:NSEventTypeApplicationDefined
                                            location:NSMakePoint(0, 0)
                                       modifierFlags:0
                                           timestamp:0
                                        windowNumber:0
                                             context:nil
                                             subtype:0
                                               data1:0
                                               data2:0];
        [NSApp postEvent:event atStart:YES];
    });
}
*/
import "C"

import (
	"context"
	"fmt"
)

// runMainLoop runs the macOS NSApplication run loop (required for CGEventTap).
func runMainLoop(ctx context.Context) {
	fmt.Println("[Go] Starting NSApp run loop...")
	go func() {
		<-ctx.Done()
		fmt.Println("[Go] Context cancelled, stopping app...")
		C.mainStopApp()
	}()
	C.mainRunApp()
	fmt.Println("[Go] NSApp run loop exited")
}
