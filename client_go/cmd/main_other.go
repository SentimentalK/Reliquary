//go:build !darwin
// +build !darwin

package main

import "context"

// runMainLoop is a no-op on non-macOS platforms.
func runMainLoop(ctx context.Context) {
	<-ctx.Done()
}
