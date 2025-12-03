package search

import (
	"strings"
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
	Path  string
	Title string
	Score int
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
