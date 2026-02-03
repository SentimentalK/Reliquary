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

// Identity holds user and device information for the session.
type Identity struct {
	UserID   string
	DeviceID string
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
		HandshakeTimeout: 5 * time.Second,
	}

	conn, _, err := dialer.Dial(c.wsURL, http.Header{})
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", c.wsURL, err)
	}

	c.conn = conn
	return nil
}

// SendConfig sends the audio configuration and identity to the server.
// This is the WebSocket handshake that includes user_id and device_id.
func (c *StreamClient) SendConfig(sampleRate int) error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	// Handshake payload with identity
	config := map[string]interface{}{
		"sample_rate": sampleRate,
		"client":      "go_vortex_v0.2",
		"user_id":     c.identity.UserID,
		"device_id":   c.identity.DeviceID,
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

	for chunk := range audioChan {
		if err := c.conn.WriteMessage(websocket.BinaryMessage, chunk); err != nil {
			return fmt.Errorf("failed to send audio chunk: %w", err)
		}
	}

	return nil
}

// SendEOF signals the end of audio stream.
func (c *StreamClient) SendEOF() error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	return c.conn.WriteMessage(websocket.TextMessage, []byte("EOF"))
}

// ReceiveResult waits for and returns the transcription result.
// It ignores intermediate status messages (keep-alive) and waits for final result.
func (c *StreamClient) ReceiveResult() (*TranscriptionResult, error) {
	if c.conn == nil {
		return nil, fmt.Errorf("not connected")
	}

	// Set read deadline (longer to account for Groq processing)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			return nil, fmt.Errorf("failed to receive result: %w", err)
		}

		var result TranscriptionResult
		if err := json.Unmarshal(message, &result); err != nil {
			return nil, fmt.Errorf("failed to parse result: %w", err)
		}

		// Ignore keep-alive "processing" status messages
		if result.Status == "processing" {
			// Reset read deadline on each keep-alive
			c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			continue
		}

		// Got actual result or error
		if result.Error != "" {
			return nil, fmt.Errorf("server error: %s", result.Error)
		}

		return &result, nil
	}
}

// Close closes the WebSocket connection.
func (c *StreamClient) Close() {
	if c.conn != nil {
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
