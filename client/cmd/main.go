// Voice Typing Client - Main Entry Point (V0.2 with WebSocket Streaming)
//
// A lightweight native client that captures voice input and streams it
// via WebSocket to the Python backend for real-time transcription.
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
	"sync"
	"syscall"
	"time"

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

// App holds the application state and dependencies.
type App struct {
	recorder     *audio.Recorder
	clipboardMgr *clipboard.Manager
	hotkeyHandler *hotkey.Handler
	configMgr    *config.Manager
	
	// Current config values (may change via hot-reload)
	serverURL string
	deviceID  string
	
	mu sync.RWMutex
}

func (a *App) getServerURL() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.serverURL
}

func (a *App) setServerURL(url string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.serverURL = url
}

func main() {
	// Parse flags
	configPath := flag.String("config", config.GetConfigPath(), "Path to config file")
	deviceID := flag.String("device-id", getDefaultDeviceID(), "Device identifier for logging")
	useHTTP := flag.Bool("http", false, "Use legacy HTTP mode instead of WebSocket streaming")
	flag.Parse()

	// Load configuration
	configMgr := config.NewManager(*configPath)
	if err := configMgr.Load(); err != nil {
		log.Printf("Warning: %v, using defaults", err)
	}
	cfg := configMgr.Get()

	keyName := hotkey.GetKeyName(cfg.KeyCode)

	fmt.Println("╔═══════════════════════════════════════════╗")
	fmt.Println("║      Voice Typing Client v0.2.0           ║")
	fmt.Println("║        (WebSocket Streaming)              ║")
	fmt.Println("╠═══════════════════════════════════════════╣")
	fmt.Printf("║  Hotkey: %-33s║\n", fmt.Sprintf("%s (code %d)", keyName, cfg.KeyCode))
	fmt.Printf("║  Server: %-33s║\n", cfg.ServerURL)
	if *useHTTP {
		fmt.Println("║  Mode:   HTTP (legacy)                    ║")
	} else {
		fmt.Println("║  Mode:   WebSocket (streaming)            ║")
	}
	fmt.Println("╚═══════════════════════════════════════════╝")
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

	app := &App{
		recorder:      recorder,
		clipboardMgr:  clipboardMgr,
		hotkeyHandler: hotkeyHandler,
		configMgr:     configMgr,
		serverURL:     cfg.ServerURL,
		deviceID:      *deviceID,
	}

	// Setup config hot-reload
	configMgr.OnChange(func(newCfg config.Config) {
		hotkeyHandler.UpdateKeyCode(newCfg.KeyCode)
		fmt.Printf("✓ Hotkey updated to: %s (code %d)\n",
			hotkey.GetKeyName(newCfg.KeyCode), newCfg.KeyCode)

		app.setServerURL(newCfg.ServerURL)
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
		if *useHTTP {
			go runEventLoopHTTP(ctx, app)
		} else {
			go runEventLoopWebSocket(ctx, app)
		}
		runMainLoop(ctx)
	} else {
		if *useHTTP {
			runEventLoopHTTP(ctx, app)
		} else {
			runEventLoopWebSocket(ctx, app)
		}
	}
}

// runEventLoopWebSocket handles streaming mode with WebSocket.
func runEventLoopWebSocket(ctx context.Context, app *App) {
	state := StateIdle
	var audioChan <-chan []byte
	var streamClient *network.StreamClient
	var streamErr error
	var streamDone chan struct{}
	var recordingStartTime time.Time
	
	// Minimum recording duration to avoid accidental taps (1 second)
	const minRecordingDuration = 1 * time.Second

	for {
		select {
		case <-ctx.Done():
			return

		case event := <-app.hotkeyHandler.Events:
			switch event {
			case hotkey.KeyDown:
				if state == StateIdle {
					sound.PlayStart()
					fmt.Println("🎤 Recording... (release key to stop)")
					recordingStartTime = time.Now()

					// Start streaming
					audioChan, streamErr = app.recorder.StartStreaming()
					if streamErr != nil {
						log.Printf("Failed to start recording: %v", streamErr)
						sound.PlayError()
						continue
					}

					// Connect to server
					streamClient = network.NewStreamClient(app.getServerURL(), app.deviceID)
					if err := streamClient.Connect(); err != nil {
						log.Printf("Failed to connect to server: %v", err)
						app.recorder.StopStreaming()
						sound.PlayError()
						continue
					}

					// Send config
					if err := streamClient.SendConfig(int(app.recorder.GetSampleRate())); err != nil {
						log.Printf("Failed to send config: %v", err)
						streamClient.Close()
						app.recorder.StopStreaming()
						sound.PlayError()
						continue
					}

					// Start streaming audio in background
					streamDone = make(chan struct{})
					go func() {
						defer close(streamDone)
						if err := streamClient.StreamAudio(audioChan); err != nil {
							log.Printf("Stream error: %v", err)
						}
					}()

					state = StateRecording
				}

			case hotkey.KeyUp:
				if state == StateRecording {
					recordingDuration := time.Since(recordingStartTime)
					
					// Stop recording (closes audioChan)
					app.recorder.StopStreaming()

					// Wait for stream to finish
					<-streamDone

					// Check if recording was too short (accidental tap)
					if recordingDuration < minRecordingDuration {
						fmt.Printf("⚠️  Recording too short (%.1fs < 1s), skipped\n", recordingDuration.Seconds())
						streamClient.Close()
						state = StateIdle
						continue
					}

					state = StateProcessing
					fmt.Println("⏳ Processing...")

					// Send EOF
					if err := streamClient.SendEOF(); err != nil {
						log.Printf("Failed to send EOF: %v", err)
						streamClient.Close()
						sound.PlayError()
						state = StateIdle
						continue
					}

					// Receive result
					result, err := streamClient.ReceiveResult()
					streamClient.Close()

					if err != nil {
						log.Printf("Transcription failed: %v", err)
						sound.PlayError()
						state = StateIdle
						continue
					}

					if result.Text == "" {
						fmt.Println("⚠️  No speech detected")
						state = StateIdle
						continue
					}

					// Paste result
					fmt.Printf("✅ Transcribed: %s\n", result.Text)
					sound.PlaySuccess()
					if err := app.clipboardMgr.SetTextAndPaste(result.Text); err != nil {
						log.Printf("Failed to paste: %v", err)
					}

					state = StateIdle
					fmt.Println("\nReady for next recording...")
				}
			}
		}
	}
}

// runEventLoopHTTP handles legacy HTTP mode.
func runEventLoopHTTP(ctx context.Context, app *App) {
	state := StateIdle
	var recordingStartTime time.Time
	
	// Minimum recording duration to avoid accidental taps (1 second)
	const minRecordingDuration = 1 * time.Second

	for {
		select {
		case <-ctx.Done():
			return

		case event := <-app.hotkeyHandler.Events:
			switch event {
			case hotkey.KeyDown:
				if state == StateIdle {
					sound.PlayStart()
					fmt.Println("🎤 Recording... (release key to stop)")
					recordingStartTime = time.Now()
					if err := app.recorder.Start(); err != nil {
						log.Printf("Failed to start recording: %v", err)
						sound.PlayError()
						continue
					}
					state = StateRecording
				}

			case hotkey.KeyUp:
				if state == StateRecording {
					recordingDuration := time.Since(recordingStartTime)

					audioData, err := app.recorder.Stop()
					if err != nil {
						log.Printf("Failed to stop recording: %v", err)
						sound.PlayError()
						state = StateIdle
						continue
					}

					// Check if recording was too short (accidental tap)
					if recordingDuration < minRecordingDuration {
						fmt.Printf("⚠️  Recording too short (%.1fs < 1s), skipped\n", recordingDuration.Seconds())
						state = StateIdle
						continue
					}

					if len(audioData) < 100 {
						fmt.Println("⚠️  Recording too short, skipped")
						state = StateIdle
						continue
					}

					state = StateProcessing
					fmt.Println("⏳ Processing...")

					// Use HTTP client
					client := network.NewClient(app.getServerURL())
					text, err := client.Transcribe(audioData)
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

					fmt.Printf("✅ Transcribed: %s\n", text)
					sound.PlaySuccess()
					if err := app.clipboardMgr.SetTextAndPaste(text); err != nil {
						log.Printf("Failed to paste: %v", err)
					}

					state = StateIdle
					fmt.Println("\nReady for next recording...")
				}
			}
		}
	}
}

// getDefaultDeviceID generates a default device identifier.
func getDefaultDeviceID() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return hostname
}
