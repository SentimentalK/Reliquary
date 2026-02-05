// Package network provides WebSocket streaming client for audio transcription.
package network

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// Timeout settings
const (
	ConnectTimeout    = 10 * time.Second
	WriteTimeout      = 5 * time.Second
	ReadTimeout       = 120 * time.Second // Long timeout for Groq processing
	HeartbeatInterval = 30 * time.Second  // Ping interval to keep connection alive
)

// Identity holds device and auth information for the session.
// User identity is determined server-side from auth_token.
type Identity struct {
	DeviceID  string
	AuthToken string // sk-vortex-xxx format (v1.5 Multi-User)
	ApiKey    string // Optional BYOK for Groq API
	Language  string // Config persistence
	Pipeline  string // Config persistence
	KeyCode   int    // Config persistence
}

// StreamClient handles WebSocket streaming to the transcription server.
type StreamClient struct {
	wsURL    string
	httpURL  string
	conn     *websocket.Conn
	identity Identity
}

// TranscriptionResult contains the server response.
type TranscriptionResult struct {
	Text   string `json:"text"`
	ID     string `json:"id"`
	Status string `json:"status,omitempty"`
	Error  string `json:"error,omitempty"`
}

// NewStreamClient creates a new WebSocket streaming client.
func NewStreamClient(serverURL string, identity Identity) *StreamClient {
	// Convert HTTP URL to WebSocket URL
	wsURL := serverURL
	if strings.HasPrefix(wsURL, "http://") {
		wsURL = "ws://" + strings.TrimPrefix(wsURL, "http://")
	} else if strings.HasPrefix(wsURL, "https://") {
		wsURL = "wss://" + strings.TrimPrefix(wsURL, "https://")
	}

	return &StreamClient{
		wsURL:    wsURL + "/ws/audio",
		httpURL:  serverURL,
		identity: identity,
	}
}

// Connect establishes a WebSocket connection to the server.
func (c *StreamClient) Connect() error {
	dialer := websocket.Dialer{
		HandshakeTimeout: ConnectTimeout,
	}

	conn, _, err := dialer.Dial(c.wsURL, http.Header{})
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", c.wsURL, err)
	}

	// Set ping handler to respond to server pings
	conn.SetPingHandler(func(data string) error {
		return conn.WriteControl(websocket.PongMessage, []byte(data), time.Now().Add(WriteTimeout))
	})

	c.conn = conn
	return nil
}

// SendConfig sends the audio configuration and identity to the server.
// This is the WebSocket handshake that includes device_id and auth credentials.
// User identity is determined server-side from auth_token.
func (c *StreamClient) SendConfig(sampleRate int) error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	// Set write deadline
	c.conn.SetWriteDeadline(time.Now().Add(WriteTimeout))

	// Handshake payload with device and auth (v1.5)
	config := map[string]interface{}{
		"sample_rate": sampleRate,
		"client":      "go_vortex_v1.5",
		"device_id":   c.identity.DeviceID,
	}

	// Add auth token if present (v1.5 Multi-User)
	if c.identity.AuthToken != "" {
		config["auth_token"] = c.identity.AuthToken
	}

	// Add API key if present (BYOK)
	if c.identity.ApiKey != "" {
		config["api_key"] = c.identity.ApiKey
	}

	// Add other config fields (Client as Source of Truth)
	if c.identity.KeyCode != 0 {
		config["keycode"] = c.identity.KeyCode
	}
	if c.identity.Language != "" {
		config["language"] = c.identity.Language
	}
	if c.identity.Pipeline != "" {
		config["pipeline"] = c.identity.Pipeline
	}

	data, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	return c.conn.WriteMessage(websocket.TextMessage, data)
}

// StreamAudio reads from the audio channel and sends chunks to the server.
// This should be run in a goroutine. It returns when the channel is closed.
func (c *StreamClient) StreamAudio(audioChan <-chan []byte) error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	chunkCount := 0
	totalBytes := 0
	lastLoggedAt := 0

	fmt.Println("[Stream] Starting audio streaming...")

	for chunk := range audioChan {
		chunkCount++
		totalBytes += len(chunk)

		// Set write deadline for each chunk
		c.conn.SetWriteDeadline(time.Now().Add(WriteTimeout))

		if err := c.conn.WriteMessage(websocket.BinaryMessage, chunk); err != nil {
			fmt.Printf("[Stream] Failed at chunk %d (%d total bytes): %v\n", chunkCount, totalBytes, err)
			return fmt.Errorf("failed to send audio chunk: %w", err)
		}

		// Adaptive logging frequency to avoid spam:
		// - First 500 chunks: log every 100
		// - 500-2000 chunks: log every 500
		// - 2000+ chunks: log every 1000
		logInterval := 100
		if chunkCount > 2000 {
			logInterval = 1000
		} else if chunkCount > 500 {
			logInterval = 500
		}

		if chunkCount-lastLoggedAt >= logInterval {
			fmt.Printf("[Stream] Sent %d chunks (%d bytes)\n", chunkCount, totalBytes)
			lastLoggedAt = chunkCount
		}
	}

	fmt.Printf("[Stream] Completed: %d chunks, %d bytes\n", chunkCount, totalBytes)
	return nil
}

// SendEOF signals the end of audio stream.
func (c *StreamClient) SendEOF() error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	c.conn.SetWriteDeadline(time.Now().Add(WriteTimeout))
	return c.conn.WriteMessage(websocket.TextMessage, []byte("EOF"))
}

// ReceiveResult waits for and returns the transcription result.
// It handles heartbeat/processing status messages and waits for final result.
func (c *StreamClient) ReceiveResult() (*TranscriptionResult, error) {
	if c.conn == nil {
		return nil, fmt.Errorf("not connected")
	}

	// Set initial read deadline (long timeout for Groq processing)
	c.conn.SetReadDeadline(time.Now().Add(ReadTimeout))

	var lastResult *TranscriptionResult
	gotHeartbeat := false

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			// Check if we have a result to return despite connection close
			if lastResult != nil && lastResult.Text != "" {
				if gotHeartbeat {
					fmt.Println() // Newline after dots
				}
				return lastResult, nil
			}

			// Check for normal close (server sent result and closed)
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				if gotHeartbeat {
					fmt.Println()
				}
				// Normal close but no result - might have been processed on server
				return &TranscriptionResult{Text: "", ID: ""}, nil
			}

			return nil, fmt.Errorf("failed to receive result: %w", err)
		}

		var result TranscriptionResult
		if err := json.Unmarshal(message, &result); err != nil {
			return nil, fmt.Errorf("failed to parse result: %w", err)
		}

		// Handle heartbeat/processing status messages
		if result.Status == "processing" {
			// Print dot to show activity
			fmt.Print(".")
			gotHeartbeat = true
			// Reset read deadline on each heartbeat
			c.conn.SetReadDeadline(time.Now().Add(ReadTimeout))
			continue
		}

		// Got actual result - save it
		if result.Text != "" || result.ID != "" {
			lastResult = &result
		}

		// Check for error
		if result.Error != "" {
			if gotHeartbeat {
				fmt.Println()
			}
			return nil, fmt.Errorf("server error: %s", result.Error)
		}

		// Got final result
		if result.Text != "" {
			if gotHeartbeat {
				fmt.Println()
			}
			return &result, nil
		}
	}
}

// Close closes the WebSocket connection.
func (c *StreamClient) Close() {
	if c.conn != nil {
		// Send close message gracefully
		c.conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
			time.Now().Add(time.Second),
		)
		c.conn.Close()
		c.conn = nil
	}
}

// --------- Legacy HTTP Client (kept for backwards compatibility) ---------

// Client handles HTTP communication with the transcription server.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new HTTP API client.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Transcribe sends audio bytes to the server via HTTP POST (legacy).
func (c *Client) Transcribe(audioData []byte) (string, error) {
	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add audio file
	part, err := writer.CreateFormFile("file", "recording.wav")
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %w", err)
	}

	if _, err := part.Write(audioData); err != nil {
		return "", fmt.Errorf("failed to write audio data: %w", err)
	}

	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("failed to close writer: %w", err)
	}

	// Create request
	reqURL := fmt.Sprintf("%s/transcribe", c.baseURL)
	req, err := http.NewRequest("POST", reqURL, body)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Send request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("server error (%d): %s", resp.StatusCode, string(respBody))
	}

	return string(respBody), nil
}

// ============== Control Plane Client ==============

// ControlPlaneConfig holds configuration for the control plane connection.
type ControlPlaneConfig struct {
	ServerURL string
	Identity  Identity
}

// ControlMessage represents a message from the server on the control channel.
type ControlMessage struct {
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload"`
}

// ConfigUpdate represents a config update payload from the server.
type ConfigUpdate struct {
	KeyCode   *int    `json:"keycode,omitempty"`
	ServerURL *string `json:"server_url,omitempty"`
	Language  *string `json:"language,omitempty"`
	ApiKey    *string `json:"api_key,omitempty"` // BYOK from server
	Pipeline  *string `json:"pipeline,omitempty"`
}

// ControlPlaneClient handles the persistent control channel connection.
type ControlPlaneClient struct {
	wsURL    string
	identity Identity
	conn     *websocket.Conn

	// Callbacks
	onConfigUpdate  func(ConfigUpdate)
	onStartLearning func()
	onConnected     func()
	onDisconnected  func()
	onAuthFailed    func(reason string) // Called on 401 (no retry)

	// State
	connected  bool
	authFailed bool // Set to true on 401, prevents retry
	stopChan   chan struct{}
}

// NewControlPlaneClient creates a new control plane client.
func NewControlPlaneClient(serverURL string, identity Identity) *ControlPlaneClient {
	// Convert HTTP URL to WebSocket URL
	wsURL := serverURL
	if strings.HasPrefix(wsURL, "http://") {
		wsURL = "ws://" + strings.TrimPrefix(wsURL, "http://")
	} else if strings.HasPrefix(wsURL, "https://") {
		wsURL = "wss://" + strings.TrimPrefix(wsURL, "https://")
	}

	return &ControlPlaneClient{
		wsURL:    wsURL + "/ws/control",
		identity: identity,
		stopChan: make(chan struct{}),
	}
}

// OnConfigUpdate sets the callback for config updates from server.
func (c *ControlPlaneClient) OnConfigUpdate(fn func(ConfigUpdate)) {
	c.onConfigUpdate = fn
}

// OnStartLearning sets the callback for key learning mode initiation.
func (c *ControlPlaneClient) OnStartLearning(fn func()) {
	c.onStartLearning = fn
}

// OnConnected sets the callback for successful connection.
func (c *ControlPlaneClient) OnConnected(fn func()) {
	c.onConnected = fn
}

// OnDisconnected sets the callback for disconnection.
func (c *ControlPlaneClient) OnDisconnected(fn func()) {
	c.onDisconnected = fn
}

// OnAuthFailed sets the callback for authentication failure (401).
// When auth fails, the client will NOT retry.
func (c *ControlPlaneClient) OnAuthFailed(fn func(reason string)) {
	c.onAuthFailed = fn
}

// IsAuthFailed returns true if authentication has failed.
func (c *ControlPlaneClient) IsAuthFailed() bool {
	return c.authFailed
}

// ConnectWithRetry connects to the control plane with automatic reconnection.
// This blocks forever, reconnecting on failures. Run in a goroutine.
// IMPORTANT: Does NOT retry on 401 (authentication failure).
func (c *ControlPlaneClient) ConnectWithRetry() {
	reconnectDelay := 5 * time.Second
	maxDelay := 60 * time.Second

	for {
		select {
		case <-c.stopChan:
			fmt.Println("[Control] Stopped")
			return
		default:
		}

		// Don't retry if auth failed
		if c.authFailed {
			fmt.Println("[Control] Auth failed, not retrying. Please update your auth_token.")
			return
		}

		err := c.connect()
		if err != nil {
			// Check if it's an auth error (don't retry)
			if c.authFailed {
				fmt.Println("[Control] Authentication failed. Check your auth_token and restart.")
				if c.onAuthFailed != nil {
					c.onAuthFailed(err.Error())
				}
				return
			}

			fmt.Printf("[Control] Connection failed: %v (retrying in %v)\n", err, reconnectDelay)
			time.Sleep(reconnectDelay)

			// Exponential backoff with cap
			reconnectDelay = reconnectDelay * 2
			if reconnectDelay > maxDelay {
				reconnectDelay = maxDelay
			}
			continue
		}

		// Reset delay on successful connection
		reconnectDelay = 5 * time.Second

		// Run message loop (blocks until disconnect)
		c.messageLoop()

		// Check if we should stop retrying due to auth failure
		if c.authFailed {
			return
		}
	}
}

// connect establishes a connection to the control plane.
func (c *ControlPlaneClient) connect() error {
	fmt.Printf("[Control] Connecting to %s...\n", c.wsURL)

	dialer := websocket.Dialer{
		HandshakeTimeout: ConnectTimeout,
	}

	conn, _, err := dialer.Dial(c.wsURL, http.Header{})
	if err != nil {
		return fmt.Errorf("dial failed: %w", err)
	}

	// Send handshake with device and auth (v1.5)
	// User identity is determined server-side from auth_token
	handshake := map[string]interface{}{
		"device_id": c.identity.DeviceID,
	}

	// Add auth token if present (v1.5 Multi-User)
	if c.identity.AuthToken != "" {
		handshake["auth_token"] = c.identity.AuthToken
	}

	// Add persistent config fields (Client is Source of Truth)
	if c.identity.ApiKey != "" {
		handshake["api_key"] = c.identity.ApiKey
	}
	if c.identity.Language != "" {
		handshake["language"] = c.identity.Language
	}
	if c.identity.Pipeline != "" {
		handshake["pipeline"] = c.identity.Pipeline
	}
	if c.identity.KeyCode != 0 {
		handshake["keycode"] = c.identity.KeyCode
	}

	conn.SetWriteDeadline(time.Now().Add(WriteTimeout))
	if err := conn.WriteJSON(handshake); err != nil {
		conn.Close()
		return fmt.Errorf("handshake failed: %w", err)
	}

	c.conn = conn
	c.connected = true

	authStatus := "unauthenticated"
	if c.identity.AuthToken != "" {
		authStatus = "authenticated"
	}
	fmt.Printf("[Control] Connected (device: %s, %s)\n", c.identity.DeviceID, authStatus)

	if c.onConnected != nil {
		c.onConnected()
	}

	return nil
}

// messageLoop reads messages from the server.
func (c *ControlPlaneClient) messageLoop() {
	defer func() {
		c.connected = false
		if c.conn != nil {
			c.conn.Close()
			c.conn = nil
		}
		if c.onDisconnected != nil {
			c.onDisconnected()
		}
		fmt.Println("[Control] Disconnected")
	}()

	// Set ping handler
	c.conn.SetPingHandler(func(data string) error {
		return c.conn.WriteControl(websocket.PongMessage, []byte(data), time.Now().Add(WriteTimeout))
	})

	for {
		select {
		case <-c.stopChan:
			return
		default:
		}

		// Set read deadline (5 minute timeout, will get pings to keep alive)
		c.conn.SetReadDeadline(time.Now().Add(5 * time.Minute))

		_, message, err := c.conn.ReadMessage()
		if err != nil {
			// Check for authentication failure (4001 = auth required)
			if websocket.IsCloseError(err, 4001) {
				fmt.Println("[Control] ❌ Authentication required (401)")
				c.authFailed = true
				if c.onAuthFailed != nil {
					c.onAuthFailed("Server requires authentication. Please set auth_token in your config.")
				}
				return
			}
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				return
			}
			// Check error message for auth-related keywords
			errStr := err.Error()
			if strings.Contains(errStr, "4001") || strings.Contains(errStr, "Authentication") {
				fmt.Println("[Control] ❌ Authentication failed")
				c.authFailed = true
				if c.onAuthFailed != nil {
					c.onAuthFailed(errStr)
				}
				return
			}
			fmt.Printf("[Control] Read error: %v\n", err)
			return
		}

		var msg ControlMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			fmt.Printf("[Control] Invalid message: %v\n", err)
			continue
		}

		c.handleMessage(msg)
	}
}

// handleMessage processes incoming control messages.
func (c *ControlPlaneClient) handleMessage(msg ControlMessage) {
	switch msg.Type {
	case "connected":
		fmt.Println("[Control] Server acknowledged connection")

	case "config_update":
		fmt.Println("[Control] Received config_update")
		if c.onConfigUpdate != nil {
			update := parseConfigUpdate(msg.Payload)
			c.onConfigUpdate(update)
		}

	case "start_learning":
		fmt.Println("[Control] Received start_learning command")
		if c.onStartLearning != nil {
			c.onStartLearning()
		}

	case "ping":
		// Respond with pong
		c.sendMessage("pong", nil)

	case "heartbeat":
		// Server-side heartbeat to keep connection alive
		// Respond with ack to confirm we're still here
		c.sendMessage("heartbeat_ack", nil)

	case "error":
		// Handle server error messages
		if errMsg, ok := msg.Payload["error"].(string); ok {
			fmt.Printf("[Control] Server error: %s\n", errMsg)
			// Check if it's an auth error
			if strings.Contains(errMsg, "auth_token") || strings.Contains(errMsg, "authentication") || strings.Contains(errMsg, "Invalid") {
				c.authFailed = true
				if c.onAuthFailed != nil {
					c.onAuthFailed(errMsg)
				}
			}
		}

	default:
		// Check if it's an inline error (server may send {"error": "..."} directly)
		if errMsg, ok := msg.Payload["error"].(string); ok {
			fmt.Printf("[Control] Server error: %s\n", errMsg)
			if strings.Contains(errMsg, "auth_token") || strings.Contains(errMsg, "authentication") || strings.Contains(errMsg, "Invalid") {
				c.authFailed = true
			}
		} else {
			fmt.Printf("[Control] Unknown message type: %s\n", msg.Type)
		}
	}
}

// parseConfigUpdate extracts config update fields from payload.
func parseConfigUpdate(payload map[string]interface{}) ConfigUpdate {
	update := ConfigUpdate{}

	if v, ok := payload["keycode"].(float64); ok {
		keyCode := int(v)
		update.KeyCode = &keyCode
	}
	if v, ok := payload["server_url"].(string); ok {
		update.ServerURL = &v
	}
	if v, ok := payload["language"].(string); ok {
		update.Language = &v
	}
	if v, ok := payload["api_key"].(string); ok {
		update.ApiKey = &v
	}
	if v, ok := payload["pipeline"].(string); ok {
		update.Pipeline = &v
	}

	return update
}

// sendMessage sends a message to the server.
func (c *ControlPlaneClient) sendMessage(msgType string, payload map[string]interface{}) error {
	if c.conn == nil || !c.connected {
		return fmt.Errorf("not connected")
	}

	msg := ControlMessage{
		Type:    msgType,
		Payload: payload,
	}

	c.conn.SetWriteDeadline(time.Now().Add(WriteTimeout))
	return c.conn.WriteJSON(msg)
}

// SendKeyDetected reports a detected key code to the server (for key learning).
func (c *ControlPlaneClient) SendKeyDetected(keyCode int) error {
	return c.sendMessage("key_detected", map[string]interface{}{
		"code": keyCode,
	})
}

// SendConfigUpdate reports local config changes to the server (Client is Source of Truth).
func (c *ControlPlaneClient) SendConfigUpdate(update ConfigUpdate) error {
	payload := make(map[string]interface{})

	if update.KeyCode != nil {
		payload["keycode"] = *update.KeyCode
	}
	if update.ServerURL != nil {
		payload["server_url"] = *update.ServerURL
	}
	if update.Language != nil {
		payload["language"] = *update.Language
	}
	if update.ApiKey != nil {
		payload["api_key"] = *update.ApiKey
	}
	if update.Pipeline != nil {
		payload["pipeline"] = *update.Pipeline
	}

	if len(payload) == 0 {
		return nil
	}

	return c.sendMessage("config_update", payload)
}

// IsConnected returns whether the control plane is connected.
func (c *ControlPlaneClient) IsConnected() bool {
	return c.connected
}

// Stop terminates the control plane connection.
func (c *ControlPlaneClient) Stop() {
	close(c.stopChan)
	if c.conn != nil {
		c.conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
			time.Now().Add(time.Second),
		)
		c.conn.Close()
	}
}
