// Voice Typing Client - Main Entry Point
//
// A lightweight native client that captures voice input and transcribes it
// via the Python backend, then pastes the result to the active window.
//
// Configuration:
//   - Reads from voice_config.json in the same directory as executable
//   - Config changes are applied in real-time without restart
//
// Platform Notes:
//   - macOS: Requires Input Monitoring permission in System Settings
//   - Windows: May require running as Administrator

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"voice-typing-client/internal/audio"
	"voice-typing-client/internal/clipboard"
	"voice-typing-client/internal/config"
	"voice-typing-client/internal/hotkey"
	"voice-typing-client/internal/network"
	"voice-typing-client/internal/sound"
)

func init() {
	// Lock the main goroutine to the OS main thread.
	// This is required for macOS CGEventTap and CFRunLoop to work properly.
	runtime.LockOSThread()
}

// State represents the current application state.
type State int

const (
	StateIdle State = iota
	StateRecording
	StateProcessing
)

func (s State) String() string {
	switch s {
	case StateIdle:
		return "Idle"
	case StateRecording:
		return "Recording"
	case StateProcessing:
		return "Processing"
	default:
		return "Unknown"
	}
}

func main() {
	// Parse flags (for override or initial setup)
	configPath := flag.String("config", config.GetConfigPath(), "Path to config file")
	flag.Parse()

	// Load configuration
	configMgr := config.NewManager(*configPath)
	if err := configMgr.Load(); err != nil {
		log.Printf("Warning: %v, using defaults", err)
	}
	cfg := configMgr.Get()

	keyName := hotkey.GetKeyName(cfg.KeyCode)

	fmt.Println("╔═══════════════════════════════════════════╗")
	fmt.Println("║        Voice Typing Client v0.1.0         ║")
	fmt.Println("╠═══════════════════════════════════════════╣")
	fmt.Printf("║  Hotkey: %-33s║\n", fmt.Sprintf("%s (code %d)", keyName, cfg.KeyCode))
	fmt.Printf("║  Server: %-33s║\n", cfg.ServerURL)
	fmt.Printf("║  Config: %-33s║\n", *configPath)
	fmt.Println("╚═══════════════════════════════════════════╝")
	fmt.Println()
	fmt.Println("Config file is watched - changes apply in real-time!")
	fmt.Println()

	// Initialize components
	recorder, err := audio.NewRecorder()
	if err != nil {
		log.Fatalf("Failed to init audio: %v", err)
	}
	defer recorder.Close()

	clipboardMgr, err := clipboard.NewManager()
	if err != nil {
		log.Fatalf("Failed to init clipboard: %v", err)
	}

	hotkeyHandler, err := hotkey.NewHandler(cfg.KeyCode)
	if err != nil {
		log.Fatalf("Failed to init hotkey: %v", err)
	}

	apiClient := network.NewClient(cfg.ServerURL)

	// Setup config hot-reload
	configMgr.OnChange(func(newCfg config.Config) {
		// Update hotkey
		hotkeyHandler.UpdateKeyCode(newCfg.KeyCode)
		fmt.Printf("✓ Hotkey updated to: %s (code %d)\n", 
			hotkey.GetKeyName(newCfg.KeyCode), newCfg.KeyCode)
		
		// Update API client
		apiClient = network.NewClient(newCfg.ServerURL)
		fmt.Printf("✓ Server updated to: %s\n", newCfg.ServerURL)
	})
	configMgr.StartWatching()
	defer configMgr.StopWatching()

	// Setup context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\nShutting down...")
		cancel()
	}()

	// Start hotkey listener
	if err := hotkeyHandler.Start(ctx); err != nil {
		log.Fatalf("Failed to start hotkey listener: %v", err)
	}
	defer hotkeyHandler.Stop()

	fmt.Printf("Ready! Hold %s (code %d) to record.\n", keyName, cfg.KeyCode)
	fmt.Println("Press Ctrl+C to exit.")
	fmt.Println()

	// For macOS, we need to run the event loop on main thread
	if runtime.GOOS == "darwin" {
		go runEventLoop(ctx, hotkeyHandler, recorder, &apiClient, clipboardMgr)
		// Run NSApp on main thread (required for CGEventTap)
		runMainLoop(ctx)
	} else {
		runEventLoop(ctx, hotkeyHandler, recorder, &apiClient, clipboardMgr)
	}
}

// runEventLoop handles the main state machine logic.
func runEventLoop(ctx context.Context, hotkeyHandler *hotkey.Handler, recorder *audio.Recorder, apiClient **network.Client, clipboardMgr *clipboard.Manager) {
	state := StateIdle

	for {
		select {
		case <-ctx.Done():
			return

		case event := <-hotkeyHandler.Events:
			switch event {
			case hotkey.KeyDown:
				if state == StateIdle {
					// Start recording
					sound.PlayStart()
					fmt.Println("🎤 Recording... (release key to stop)")
					if err := recorder.Start(); err != nil {
						log.Printf("Failed to start recording: %v", err)
						sound.PlayError()
						continue
					}
					state = StateRecording
				}

			case hotkey.KeyUp:
				if state == StateRecording {
					// Stop recording and process
					sound.PlayStop()
					state = StateProcessing
					fmt.Println("⏳ Processing...")

					audioData, err := recorder.Stop()
					if err != nil {
						log.Printf("Failed to stop recording: %v", err)
						sound.PlayError()
						state = StateIdle
						continue
					}

					// Check if we got any audio
					if len(audioData) < 100 {
						fmt.Println("⚠️  Recording too short, skipped")
						state = StateIdle
						continue
					}

					// Send to server (use current client)
					text, err := (*apiClient).Transcribe(audioData)
					if err != nil {
						log.Printf("Transcription failed: %v", err)
						sound.PlayError()
						state = StateIdle
						continue
					}

					if text == "" {
						fmt.Println("⚠️  No speech detected")
						state = StateIdle
						continue
					}

					// Paste result
					fmt.Printf("✅ Transcribed: %s\n", text)
					sound.PlaySuccess()
					if err := clipboardMgr.SetTextAndPaste(text); err != nil {
						log.Printf("Failed to paste: %v", err)
					}

					state = StateIdle
					fmt.Println("\nReady for next recording...")
				}
			}
		}
	}
}
