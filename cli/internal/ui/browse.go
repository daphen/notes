package ui

import (
	"fmt"
	"sort"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/daphen/notes-cli/internal/search"
	"github.com/daphen/notes-cli/internal/theme"
)

// 🔵 BUBBLE TEA CONCEPT: View Components
// In Bubble Tea, you can break your UI into separate components.
// Each component has its own Model, Update, and View.
// The parent model composes them together.

// BrowseModel handles the note browsing/search view
type BrowseModel struct {
	notes          []NoteItem
	filteredNotes  []search.NoteMatch
	searchQuery    string
	cursorPosition int
	width          int
	height         int
	theme          *theme.Theme
}

// NoteItem represents a note in the list
type NoteItem struct {
	Path  string
	Title string
}

// NewBrowseModel creates a new browse model
func NewBrowseModel(t *theme.Theme) BrowseModel {
	return BrowseModel{
		notes:          []NoteItem{},
		filteredNotes:  []search.NoteMatch{},
		searchQuery:    "",
		cursorPosition: 0,
		theme:          t,
	}
}

// SetNotes updates the note list
func (m *BrowseModel) SetNotes(notes []NoteItem) {
	m.notes = notes
	m.updateFilter()
}

// updateFilter applies the search query and sorts results
func (m *BrowseModel) updateFilter() {
	// 🔵 GO CONCEPT: Clearing a slice
	// Set length to 0 but keep capacity
	m.filteredNotes = m.filteredNotes[:0]

	for _, note := range m.notes {
		// Create search target from title and path
		searchTarget := note.Title + " " + note.Path

		if search.Match(m.searchQuery, searchTarget) {
			score := search.Score(m.searchQuery, searchTarget)
			m.filteredNotes = append(m.filteredNotes, search.NoteMatch{
				Path:  note.Path,
				Title: note.Title,
				Score: score,
			})
		}
	}

	// Sort by score
	sort.Sort(search.ByScore(m.filteredNotes))

	// Reset cursor if out of bounds
	if m.cursorPosition >= len(m.filteredNotes) {
		m.cursorPosition = 0
	}
}

// Update handles messages for the browse view
func (m BrowseModel) Update(msg tea.Msg) (BrowseModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "ctrl+k":
			// 🔵 GO CONCEPT: Math operations
			// Go requires explicit type conversions, no implicit coercion
			if m.cursorPosition > 0 {
				m.cursorPosition--
			}

		case "down", "ctrl+j":
			if m.cursorPosition < len(m.filteredNotes)-1 {
				m.cursorPosition++
			}

		case "home", "ctrl+g":
			m.cursorPosition = 0

		case "end", "ctrl+shift+g":
			m.cursorPosition = len(m.filteredNotes) - 1

		case "backspace":
			if len(m.searchQuery) > 0 {
				// 🔵 GO CONCEPT: String slicing
				// Strings are immutable, so we create a new one
				m.searchQuery = m.searchQuery[:len(m.searchQuery)-1]
				m.updateFilter()
			}

		case "ctrl+u":
			// Clear search
			m.searchQuery = ""
			m.updateFilter()

		default:
			// 🔵 GO CONCEPT: Rune literals
			// Check if it's a printable character to add to search
			if len(msg.Runes) == 1 {
				r := msg.Runes[0]
				// Only add printable characters
				if r >= 32 && r != 127 {
					m.searchQuery += string(r)
					m.updateFilter()
				}
			}
		}

	case tea.WindowSizeMsg:
		// 🔵 BUBBLE TEA CONCEPT: Window size messages
		// The terminal can be resized - we get this message when it happens
		m.width = msg.Width
		m.height = msg.Height
	}

	return m, nil
}

// View renders the browse view
func (m BrowseModel) View() string {
	var contentBuilder strings.Builder

	// Note list content
	visibleHeight := m.height - 10 // Leave room for header/footer
	if visibleHeight < 1 {
		visibleHeight = 10
	}

	// Calculate visible range (simple scrolling)
	start := 0
	end := len(m.filteredNotes)

	if end > visibleHeight {
		// Center cursor in viewport
		start = m.cursorPosition - visibleHeight/2
		if start < 0 {
			start = 0
		}
		end = start + visibleHeight
		if end > len(m.filteredNotes) {
			end = len(m.filteredNotes)
			start = end - visibleHeight
			if start < 0 {
				start = 0
			}
		}
	}

	// Render visible notes
	for i := start; i < end; i++ {
		note := m.filteredNotes[i]

		// Style for selected item
		var line string
		if i == m.cursorPosition {
			cursor := "▶ "
			line = m.theme.SelectedStyle().Render(cursor + note.Title)
		} else {
			line = m.theme.NormalStyle().Render("  " + note.Title)
		}

		// Show only the title (path is implementation detail)
		contentBuilder.WriteString(line)
		contentBuilder.WriteString("\n")
	}

	// Empty state
	if len(m.filteredNotes) == 0 {
		if m.searchQuery == "" {
			contentBuilder.WriteString(m.theme.MutedStyle().Render("  No notes found. Create one with Ctrl+N!"))
		} else {
			contentBuilder.WriteString(m.theme.MutedStyle().Render("  No notes match your search."))
		}
		contentBuilder.WriteString("\n")
	}

	// Wrap content in a border
	borderStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(m.theme.Colors.Accent.Blue)).
		Padding(1, 2).
		Width(m.width - 4)

	borderedContent := borderStyle.Render(contentBuilder.String())

	// Build final output with search bar above the border
	var finalBuilder strings.Builder

	// Search input (left-aligned, outside border)
	searchLine := m.theme.SearchLabelStyle().Render("Search: ") + m.searchQuery
	cursorStyle := m.theme.AccentStyle().Blink(true)
	searchLine += cursorStyle.Render("█")
	finalBuilder.WriteString(searchLine)
	finalBuilder.WriteString("\n\n")

	// Results count (left-aligned)
	countLine := m.theme.MutedStyle().Render(fmt.Sprintf("%d notes", len(m.filteredNotes)))
	finalBuilder.WriteString(countLine)
	finalBuilder.WriteString("\n\n")

	// Bordered notes list
	finalBuilder.WriteString(borderedContent)

	return finalBuilder.String()
}

// GetSelectedNote returns the currently selected note
func (m BrowseModel) GetSelectedNote() *search.NoteMatch {
	if len(m.filteredNotes) == 0 {
		return nil
	}
	if m.cursorPosition >= len(m.filteredNotes) {
		return nil
	}
	return &m.filteredNotes[m.cursorPosition]
}
