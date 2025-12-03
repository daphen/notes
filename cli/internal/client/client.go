package client

// 🔵 GO CONCEPT: Imports
// Standard library packages (encoding/json, net/http) come first,
// then a blank line, then third-party imports.
// Go's formatter (gofmt) does this automatically.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client handles API communication with the notes server
type Client struct {
	baseURL    string
	password   string
	httpClient *http.Client
	authToken  string
}

// 🔵 GO CONCEPT: Constructor pattern
// Go doesn't have constructors. By convention, we create New* functions.
// This returns a pointer to a Client with the http client configured.
func New(baseURL, password string) *Client {
	return &Client{
		baseURL:  baseURL,
		password: password,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			// 🔵 GO CONCEPT: Duration literals
			// Go has built-in duration types. 30 * time.Second = 30 seconds.
		},
	}
}

// Authenticate gets an auth token from the server
func (c *Client) Authenticate() error {
	// 🔵 GO CONCEPT: Methods (receivers)
	// (c *Client) is a method receiver - like 'this' or 'self' in other languages.
	// The * means we receive a pointer, so we can modify the Client.
	// Convention: use short names like 'c' for the receiver.

	reqBody := map[string]string{
		"password": c.password,
	}
	// 🔵 GO CONCEPT: Map literals
	// map[keyType]valueType{key: value} creates a map (like a dictionary/hash).

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal auth request: %w", err)
		// 🔵 GO CONCEPT: Error wrapping
		// fmt.Errorf with %w wraps the error, preserving the error chain.
		// This is like Error.cause in JavaScript.
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/api/auth",
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return fmt.Errorf("auth request failed: %w", err)
	}
	defer resp.Body.Close()
	// 🔵 GO CONCEPT: defer
	// defer schedules a function to run when the surrounding function returns.
	// This ensures resp.Body.Close() always runs, even if we return early.
	// Similar to try/finally but more concise.

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("auth failed: %s - %s", resp.Status, string(body))
	}

	// Extract cookie
	for _, cookie := range resp.Cookies() {
		if cookie.Name == "notes-auth" {
			c.authToken = cookie.Value
			return nil
		}
	}

	return fmt.Errorf("no auth token received")
}

// Note represents a note in the system
type Note struct {
	Path     string `json:"path"`
	Title    string `json:"title"`
	Content  string `json:"content"`
	Checksum string `json:"checksum"`
	Action   string `json:"action"` // "create", "update", "delete"
}

// SyncRequest is the payload we send to /api/sync
type SyncRequest struct {
	ClientID string `json:"clientId"`
	Changes  []Note `json:"changes"`
}

// SyncResponse is what we get back from /api/sync
type SyncResponse struct {
	Accepted  []string `json:"accepted"`
	Conflicts []string `json:"conflicts"`
	Changes   []Note   `json:"changes"`
}

// Push sends local changes to the server
func (c *Client) Push(notes []Note) (*SyncResponse, error) {
	reqBody := SyncRequest{
		ClientID: "notes-cli",
		Changes:  notes,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal sync request: %w", err)
	}

	req, err := http.NewRequest("POST", c.baseURL+"/api/sync", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "notes-auth="+c.authToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sync request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("sync failed: %s - %s", resp.Status, string(body))
	}

	var syncResp SyncResponse
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &syncResp, nil
}

// Pull fetches changes from the server
func (c *Client) Pull() (*SyncResponse, error) {
	req, err := http.NewRequest("GET", c.baseURL+"/api/sync", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Cookie", "notes-auth="+c.authToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("pull request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pull failed: %s - %s", resp.Status, string(body))
	}

	var syncResp SyncResponse
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &syncResp, nil
}
