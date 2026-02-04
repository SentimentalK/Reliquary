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
// This is the WebSocket handshake that includes user_id and device_id.
func (c *StreamClient) SendConfig(sampleRate int) error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	// Set write deadline
	c.conn.SetWriteDeadline(time.Now().Add(WriteTimeout))

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

	chunkCount := 0
	totalBytes := 0
	
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
		
		// Log progress every 50 chunks
		if chunkCount%50 == 0 {
			fmt.Printf("[Stream] Sent %d chunks (%d bytes)\n", chunkCount, totalBytes)
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
