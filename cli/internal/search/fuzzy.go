package search

import (
	"strings"
	"time"
)

// 🔵 GO CONCEPT: Algorithm implementation
// This is a simple fuzzy search algorithm.
// We'll implement a basic "subsequence match" - all query chars must appear in order.

// Match checks if a query fuzzy-matches a target string
func Match(query, target string) bool {
	// 🔵 GO CONCEPT: strings package
	// ToLower makes search case-insensitive
	query = strings.ToLower(query)
	target = strings.ToLower(target)

	if query == "" {
		return true // Empty query matches everything
	}

	queryIdx := 0
	for _, char := range target {
		// 🔵 GO CONCEPT: Runes
		// range over a string gives you runes (Unicode code points), not bytes.
		// This properly handles multi-byte characters like emojis.

		if queryIdx < len(query) && rune(query[queryIdx]) == char {
			queryIdx++
		}
		if queryIdx == len(query) {
			return true
		}
	}

	return queryIdx == len(query)
}

// Score calculates a fuzzy match score (higher = better match)
// This helps sort results by relevance
func Score(query, target string) int {
	query = strings.ToLower(query)
	target = strings.ToLower(target)

	if query == "" {
		return 0
	}

	// Exact match gets highest score
	if strings.Contains(target, query) {
		return 1000
	}

	// Fuzzy match - score based on match positions
	score := 0
	queryIdx := 0
	lastMatchPos := -1

	for i, char := range target {
		if queryIdx < len(query) && rune(query[queryIdx]) == char {
			// Consecutive matches get bonus points
			if lastMatchPos == i-1 {
				score += 10
			} else {
				score += 5
			}
			lastMatchPos = i
			queryIdx++
		}
	}

	// Bonus for matching at start
	if queryIdx > 0 && strings.HasPrefix(target, string(query[0])) {
		score += 20
	}

	return score
}

// NoteMatch represents a note with its match score
type NoteMatch struct {
	Path         string
	Title        string
	Score        int
	ModTime      time.Time // File modification time
	MatchSnippet string    // Snippet showing where match was found in content
	MatchInTitle bool      // Whether the match was in the title
}

// ExtractSnippet finds the query in content and returns surrounding context
func ExtractSnippet(query, content string, maxLen int) string {
	if query == "" || content == "" {
		return ""
	}

	queryLower := strings.ToLower(query)
	contentLower := strings.ToLower(content)

	// Find the match position
	pos := strings.Index(contentLower, queryLower)
	if pos == -1 {
		return ""
	}

	// Calculate snippet bounds
	start := pos - 30
	if start < 0 {
		start = 0
	}

	end := pos + len(query) + 50
	if end > len(content) {
		end = len(content)
	}

	// Find word boundaries
	for start > 0 && content[start] != ' ' && content[start] != '\n' {
		start--
	}
	if start > 0 {
		start++ // Skip the space
	}

	for end < len(content) && content[end] != ' ' && content[end] != '\n' {
		end++
	}

	snippet := content[start:end]

	// Clean up newlines
	snippet = strings.ReplaceAll(snippet, "\n", " ")
	snippet = strings.TrimSpace(snippet)

	// Add ellipsis if truncated
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(content) {
		snippet = snippet + "..."
	}

	if len(snippet) > maxLen {
		snippet = snippet[:maxLen] + "..."
	}

	return snippet
}

// 🔵 GO CONCEPT: Sorting
// We need to implement sort.Interface to sort our results

// ByScore is a type for sorting NoteMatch by score
type ByScore []NoteMatch

func (a ByScore) Len() int {
	// 🔵 GO CONCEPT: Methods for interface implementation
	// sort.Interface requires Len(), Less(), and Swap() methods
	return len(a)
}

func (a ByScore) Less(i, j int) bool {
	// Higher score = better match, so reverse the comparison
	return a[i].Score > a[j].Score
}

func (a ByScore) Swap(i, j int) {
	// 🔵 GO CONCEPT: Tuple assignment
	// Go supports simultaneous assignment
	a[i], a[j] = a[j], a[i]
}

// ByModTime is a type for sorting NoteMatch by modification time (newest first)
type ByModTime []NoteMatch

func (a ByModTime) Len() int           { return len(a) }
func (a ByModTime) Less(i, j int) bool { return a[i].ModTime.After(a[j].ModTime) }
func (a ByModTime) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
