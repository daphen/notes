package watcher

import (
	"crypto/md5"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
)

// FileChange represents a change to a file
type FileChange struct {
	Path     string
	FullPath string
	Content  string
	Action   string // "update" or "delete"
}

// Watcher watches a directory for file changes
type Watcher struct {
	dir        string
	fsWatcher  *fsnotify.Watcher
	debounce   map[string]time.Time
	// 🔵 GO CONCEPT: Maps
	// map[keyType]valueType - maps must be initialized with make() before use.
	// This map tracks when files were last changed for debouncing.
}

// New creates a new file watcher
func New(dir string) (*Watcher, error) {
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("failed to create watcher: %w", err)
	}

	w := &Watcher{
		dir:       dir,
		fsWatcher: fsWatcher,
		debounce:  make(map[string]time.Time),
		// 🔵 GO CONCEPT: make()
		// make() initializes maps, slices, and channels.
		// Without this, debounce would be nil and cause a panic on access.
	}

	// Add the directory to watch (recursively)
	if err := w.addDirRecursive(dir); err != nil {
		return nil, err
	}

	return w, nil
}

// addDirRecursive adds a directory and all subdirectories to the watcher
func (w *Watcher) addDirRecursive(dir string) error {
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		// 🔵 GO CONCEPT: filepath.Walk
		// Walk traverses a directory tree, calling a function for each file.
		// The function signature is defined by filepath.WalkFunc.

		if err != nil {
			return err
		}
		if info.IsDir() {
			if err := w.fsWatcher.Add(path); err != nil {
				return fmt.Errorf("failed to watch %s: %w", path, err)
			}
		}
		return nil
	})
}

// Watch starts watching for file changes and sends them on the returned channel
func (w *Watcher) Watch() <-chan FileChange {
	// 🔵 GO CONCEPT: Channels
	// Channels are Go's way of communicating between goroutines (threads).
	// <-chan means "receive-only channel" - callers can only read from it.
	// This is type-safe: you can't accidentally write to a read-only channel.

	changes := make(chan FileChange)
	// 🔵 GO CONCEPT: Unbuffered channels
	// make(chan T) creates an unbuffered channel - sends block until received.
	// You can also do make(chan T, n) for a buffered channel with n slots.

	go func() {
		// 🔵 GO CONCEPT: Goroutines
		// go func() starts a new lightweight thread (goroutine).
		// It runs concurrently with the main code.
		// Goroutines are cheap - you can have thousands of them.

		defer close(changes)
		// Close the channel when this goroutine exits

		for {
			// 🔵 GO CONCEPT: Infinite loops
			// for { } is an infinite loop (like while(true))
			// We'll break out of it on error or when done

			select {
			// 🔵 GO CONCEPT: select statement
			// select is like switch but for channels.
			// It waits for whichever channel operation can proceed.
			// This is how Go does non-blocking I/O.

			case event, ok := <-w.fsWatcher.Events:
				// 🔵 GO CONCEPT: Channel receive with ok check
				// val, ok := <-ch checks if the channel is closed.
				// ok is false if the channel is closed and empty.

				if !ok {
					return // Channel closed, exit goroutine
				}

				// Only process .md files
				if !strings.HasSuffix(event.Name, ".md") {
					continue
				}

				// Debounce: ignore events within 500ms of the last one
				if lastChange, exists := w.debounce[event.Name]; exists {
					if time.Since(lastChange) < 500*time.Millisecond {
						continue
					}
				}
				w.debounce[event.Name] = time.Now()

				// Handle different event types
				var change FileChange
				if event.Op&fsnotify.Write == fsnotify.Write {
					// 🔵 GO CONCEPT: Bitwise operations
					// fsnotify uses bit flags. & is bitwise AND.
					// This checks if the Write flag is set in event.Op.

					content, err := os.ReadFile(event.Name)
					if err != nil {
						continue // Skip if we can't read
					}

					relPath, _ := filepath.Rel(w.dir, event.Name)
					change = FileChange{
						Path:     relPath,
						FullPath: event.Name,
						Content:  string(content),
						Action:   "update",
					}
					changes <- change
					// 🔵 GO CONCEPT: Channel send
					// <- sends a value into a channel.
					// This will block until someone receives it (unless buffered).
				}

			case err, ok := <-w.fsWatcher.Errors:
				if !ok {
					return
				}
				fmt.Printf("Watcher error: %v\n", err)
			}
		}
	}()

	return changes
	// 🔵 GO CONCEPT: Returning before goroutine completes
	// We return immediately, but the goroutine keeps running.
	// The channel connects them - the goroutine writes, the caller reads.
}

// Close stops the watcher
func (w *Watcher) Close() error {
	return w.fsWatcher.Close()
}

// ReadAllNotes reads all .md files in the directory
func (w *Watcher) ReadAllNotes() ([]FileChange, error) {
	// 🔵 GO CONCEPT: Slices
	// []T is a slice - a dynamically-sized array.
	// Unlike arrays, slices can grow with append().

	var notes []FileChange
	// Zero value of a slice is nil, which is fine - we can append to it.

	err := filepath.Walk(w.dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() && strings.HasSuffix(path, ".md") {
			content, err := os.ReadFile(path)
			if err != nil {
				return err
			}

			relPath, _ := filepath.Rel(w.dir, path)
			notes = append(notes, FileChange{
				// 🔵 GO CONCEPT: append()
				// append() adds elements to a slice.
				// It might reallocate the underlying array if needed.
				// Always assign the result: notes = append(notes, item)

				Path:     relPath,
				FullPath: path,
				Content:  string(content),
				Action:   "update",
			})
		}

		return nil
	})

	return notes, err
}

// CalculateChecksum computes MD5 hash of a file
func CalculateChecksum(content string) string {
	// 🔵 GO CONCEPT: Type conversion
	// []byte(content) converts string to byte slice.
	// In Go, strings are immutable, []byte is mutable.

	hash := md5.Sum([]byte(content))
	// 🔵 GO CONCEPT: Arrays vs Slices
	// md5.Sum returns [16]byte (fixed-size array).
	// We convert it to a slice with [:] to use fmt.Sprintf.

	return fmt.Sprintf("%x", hash[:])
	// %x formats bytes as lowercase hex
}
