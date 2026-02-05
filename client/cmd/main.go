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
	recorder      *audio.Recorder
	clipboardMgr  *clipboard.Manager
	hotkeyHandler *hotkey.Handler
	configMgr     *config.Manager
	controlPlane  *network.ControlPlaneClient

	// Current config values (may change via hot-reload)
	serverURL string
	deviceID  string
	authToken string // v1.5 Multi-User authentication
	apiKey    string // v1.5 BYOK (Bring Your Own Key)
	language  string // Config persistence
	pipeline  string // Config persistence
	keyCode   int    // Config persistence

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

func (a *App) getIdentity() network.Identity {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return network.Identity{
		DeviceID:  a.deviceID,
		AuthToken: a.authToken,
		ApiKey:    a.apiKey,
		Language:  a.language,
		Pipeline:  a.pipeline,
		KeyCode:   a.keyCode,
	}
}

func main() {
	// Parse flags
	configPath := flag.String("config", config.GetConfigPath(), "Path to config file")
	useHTTP := flag.Bool("http", false, "Use legacy HTTP mode instead of WebSocket streaming")
	flag.Parse()

	// Load configuration (interactive setup if first time)
	configMgr := config.NewManager(*configPath)
	isNewUser, err := configMgr.LoadOrSetup()
	if err != nil {
		log.Fatalf("Configuration error: %v", err)
	}
	cfg := configMgr.Get()

	keyName := hotkey.GetKeyName(cfg.KeyCode)
	authStatus := "🔓 No Auth"
	if cfg.HasAuthToken() {
		authStatus = "🔐 Authenticated"
	}

	fmt.Println("╔═══════════════════════════════════════════╗")
	fmt.Println("║      Vortex Voice Client v1.5.0           ║")
	fmt.Println("║        (Multi-User + BYOK)                ║")
	fmt.Println("╠═══════════════════════════════════════════╣")
	fmt.Printf("║  Hotkey: %-33s║\n", fmt.Sprintf("%s (code %d)", keyName, cfg.KeyCode))
	fmt.Printf("║  Server: %-33s║\n", cfg.ServerURL)
	fmt.Printf("║  Auth:   %-33s║\n", authStatus)
	if *useHTTP {
		fmt.Println("║  Mode:   HTTP (legacy)                    ║")
	} else {
		fmt.Println("║  Mode:   WebSocket (streaming)            ║")
	}
	fmt.Println("╚═══════════════════════════════════════════╝")
	fmt.Println()

	if isNewUser {
		fmt.Println("🆕 First-time setup complete! Starting client...")
		fmt.Println()
	}

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
		deviceID:      cfg.DeviceID,
		authToken:     cfg.AuthToken,
		apiKey:        cfg.ApiKey,
		language:      cfg.Language,
		pipeline:      cfg.Pipeline,
		keyCode:       cfg.KeyCode,
	}

	// Setup config hot-reload (from local file changes)
	configMgr.OnChange(func(newCfg config.Config) {
		hotkeyHandler.UpdateKeyCode(newCfg.KeyCode)
		fmt.Printf("✓ Hotkey updated to: %s (code %d)\n",
			hotkey.GetKeyName(newCfg.KeyCode), newCfg.KeyCode)

		app.setServerURL(newCfg.ServerURL)

		app.mu.Lock()
		app.authToken = newCfg.AuthToken
		app.apiKey = newCfg.ApiKey
		app.language = newCfg.Language
		app.pipeline = newCfg.Pipeline
		app.keyCode = newCfg.KeyCode
		app.mu.Unlock()

		fmt.Printf("✓ Config reloaded from file\n")

		// Push update to server (Client -> Server Sync)
		if app.controlPlane != nil && app.controlPlane.IsConnected() {
			update := network.ConfigUpdate{
				KeyCode:   &newCfg.KeyCode,
				ServerURL: &newCfg.ServerURL,
				Language:  &newCfg.Language,
				ApiKey:    &newCfg.ApiKey,
				Pipeline:  &newCfg.Pipeline,
			}
			fmt.Println("[Control] Pushing config update to server...")
			if err := app.controlPlane.SendConfigUpdate(update); err != nil {
				fmt.Printf("⚠️  Failed to push config update: %v\n", err)
			}
		}
	})
	configMgr.StartWatching()
	defer configMgr.StopWatching()

	// Setup Control Plane (real-time server push)
	controlPlane := network.NewControlPlaneClient(cfg.ServerURL, network.Identity{
		DeviceID:  cfg.DeviceID,
		AuthToken: cfg.AuthToken,
		ApiKey:    cfg.ApiKey,
		Language:  cfg.Language,
		Pipeline:  cfg.Pipeline,
		KeyCode:   cfg.KeyCode,
	})
	app.controlPlane = controlPlane

	// Handle config updates from server (Config as Cache philosophy)
	controlPlane.OnConfigUpdate(func(update network.ConfigUpdate) {
		app.mu.Lock()
		defer app.mu.Unlock()

		if update.KeyCode != nil {
			hotkeyHandler.SetTriggerKey(*update.KeyCode)
			// Persist to cache (voice_config.json)
			if err := configMgr.SetKeyCode(*update.KeyCode); err != nil {
				fmt.Printf("⚠️  Failed to save config: %v\n", err)
			}
			fmt.Printf("✓ [Server] Hotkey updated to: %s (code %d)\n",
				hotkey.GetKeyName(*update.KeyCode), *update.KeyCode)
		}
		if update.ServerURL != nil {
			app.serverURL = *update.ServerURL
			if err := configMgr.Update(nil, update.ServerURL); err != nil {
				fmt.Printf("⚠️  Failed to save server URL: %v\n", err)
			}
			fmt.Printf("✓ [Server] Server URL updated to: %s\n", *update.ServerURL)
		}
		if update.ApiKey != nil {
			app.apiKey = *update.ApiKey
			if err := configMgr.SetApiKey(*update.ApiKey); err != nil {
				fmt.Printf("⚠️  Failed to save API key: %v\n", err)
			}
			fmt.Println("✓ [Server] API key updated (cached locally)")
		}
		if update.Language != nil {
			app.language = *update.Language
			if err := configMgr.SetLanguage(*update.Language); err != nil {
				fmt.Printf("⚠️  Failed to save language: %v\n", err)
			}
			fmt.Printf("✓ [Server] Language updated to: %s\n", *update.Language)
		}
		if update.Pipeline != nil {
			app.pipeline = *update.Pipeline
			if err := configMgr.SetPipeline(*update.Pipeline); err != nil {
				fmt.Printf("⚠️  Failed to save pipeline: %v\n", err)
			}
			fmt.Printf("✓ [Server] Pipeline updated to: %s\n", *update.Pipeline)
		}
	})

	// Handle key learning mode from server
	controlPlane.OnStartLearning(func() {
		fmt.Println("🔑 Key Learning Mode: Press the modifier key you want to use...")
		hotkeyHandler.EnableListeningMode(func(keyCode int) {
			fmt.Printf("🔑 Detected: %s (code %d)\n", hotkey.GetKeyName(keyCode), keyCode)
			// Report back to server
			fmt.Println("[Control] Sending key_detected to server...")
			if err := controlPlane.SendKeyDetected(keyCode); err != nil {
				fmt.Printf("⚠️  Failed to report key: %v\n", err)
			} else {
				fmt.Println("[Control] key_detected sent successfully")
			}
		})
	})

	// Handle authentication failures (401) - delete cache and exit
	controlPlane.OnAuthFailed(func(reason string) {
		fmt.Println()
		fmt.Println("❌ Authentication Failed!")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Printf("   Reason: %s\n", reason)
		fmt.Println()

		// Delete the cache file so user can reconfigure
		if err := os.Remove(*configPath); err != nil {
			fmt.Printf("   ⚠️  Could not delete config: %v\n", err)
		} else {
			fmt.Printf("   🗑️  Deleted config cache: %s\n", *configPath)
		}

		fmt.Println()
		fmt.Println("   Please restart the client to reconfigure.")
		fmt.Println()

		// Exit the application
		os.Exit(1)
	})

	// Start Control Plane in background with auto-reconnect
	go controlPlane.ConnectWithRetry()
	defer controlPlane.Stop()

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
	var streamDone chan struct{}
	var streamError error // Track error from streaming goroutine
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
					streamError = nil // Reset error for new session

					// Start streaming
					var err error
					audioChan, err = app.recorder.StartStreaming()
					if err != nil {
						log.Printf("Failed to start recording: %v", err)
						sound.PlayError()
						continue
					}

					// Connect to server with identity
					streamClient = network.NewStreamClient(app.getServerURL(), app.getIdentity())
					if err := streamClient.Connect(); err != nil {
						log.Printf("Failed to connect to server: %v", err)
						app.recorder.StopStreaming()
						sound.PlayError()
						continue
					}

					// Send config (includes user_id and device_id)
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
							streamError = err // Capture error for main loop
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

					// Check if stream had an error (connection broke)
					if streamError != nil {
						fmt.Println("⚠️  Connection lost during recording (audio saved on server)")
						streamClient.Close()
						streamError = nil
						state = StateIdle
						sound.PlayError()
						fmt.Println("\nReady for next recording...")
						continue
					}

					// Check if recording was too short (accidental tap)
					if recordingDuration < minRecordingDuration {
						fmt.Printf("⚠️  Recording too short (%.1fs < 1s), skipped\n", recordingDuration.Seconds())
						sound.PlayError()
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
						fmt.Println("\nReady for next recording...")
						continue
					}

					// Receive result
					result, err := streamClient.ReceiveResult()
					streamClient.Close()

					if err != nil {
						log.Printf("Transcription failed: %v", err)
						sound.PlayError()
						state = StateIdle
						fmt.Println("\nReady for next recording...")
						continue
					}

					if result.Text == "" {
						fmt.Println("⚠️  No speech detected")
						state = StateIdle
						fmt.Println("\nReady for next recording...")
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
