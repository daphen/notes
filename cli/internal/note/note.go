package note

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// Note represents a processed note with all metadata
type Note struct {
	Path     string
	Title    string
	Content  string
	Checksum string
	Action   string
}

// ExtractTitle extracts the title from markdown content
// It looks for the first # heading, otherwise uses the filename
func ExtractTitle(content, path string) string {
	// Try to extract from first line if it's a heading
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#") {
			// Remove # symbols and trim
			heading := strings.TrimPrefix(trimmed, "#")
			heading = strings.TrimSpace(heading)
			if heading != "" {
				return LimitTitle(heading)
			}
		}
		// Stop at first non-empty line that's not a heading
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			break
		}
	}

	// Fallback to filename (without .md extension)
	filename := filepath.Base(path)
	title := strings.TrimSuffix(filename, ".md")

	// Clean up filename: replace hyphens/underscores with spaces
	title = strings.ReplaceAll(title, "-", " ")
	title = strings.ReplaceAll(title, "_", " ")

	// Capitalize first letter of each word
	words := strings.Fields(title)
	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(string(word[0])) + word[1:]
		}
	}
	title = strings.Join(words, " ")

	if title == "" {
		title = "Untitled"
	}

	return LimitTitle(title)
}

// LimitTitle limits title to 50 characters with "..." suffix
func LimitTitle(title string) string {
	const maxLength = 50
	if len(title) > maxLength {
		return title[:47] + "..."
	}
	return title
}

// CalculateChecksum calculates MD5 checksum of content
func CalculateChecksum(content string) string {
	hash := md5.Sum([]byte(content))
	return hex.EncodeToString(hash[:])
}

// GenerateFilename generates a timestamp-based filename
// Format: YYYY-MM-DD-HHmm.md
func GenerateFilename() string {
	now := time.Now()
	return fmt.Sprintf("%04d-%02d-%02d-%02d%02d.md",
		now.Year(),
		now.Month(),
		now.Day(),
		now.Hour(),
		now.Minute(),
	)
}

// ProcessNote processes a note file and extracts all metadata
func ProcessNote(path, content, action string) Note {
	return Note{
		Path:     path,
		Title:    ExtractTitle(content, path),
		Content:  content,
		Checksum: CalculateChecksum(content),
		Action:   action,
	}
}
