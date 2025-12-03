package ui

import (
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/daphen/notes-cli/internal/note"
	"github.com/daphen/notes-cli/internal/theme"
)

// CreateModel handles quick note creation
type CreateModel struct {
	titleInput   string
	contentInput string
	focusTitle   bool // true = editing title, false = editing content
	width        int
	height       int
	theme        *theme.Theme
}

// NewCreateModel creates a new note creation model
func NewCreateModel(t *theme.Theme) CreateModel {
	return CreateModel{
		titleInput:   "",
		contentInput: "",
		focusTitle:   true, // Start with title focused
		theme:        t,
	}
}

// Reset clears the form
func (m *CreateModel) Reset() {
	m.titleInput = ""
	m.contentInput = ""
	m.focusTitle = true
}

// Update handles messages for the create view
func (m CreateModel) Update(msg tea.Msg) (CreateModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "tab":
			// 🔵 GO CONCEPT: Boolean toggle
			// ! is the NOT operator
			m.focusTitle = !m.focusTitle

		case "backspace":
			if m.focusTitle && len(m.titleInput) > 0 {
				m.titleInput = m.titleInput[:len(m.titleInput)-1]
			} else if !m.focusTitle && len(m.contentInput) > 0 {
				m.contentInput = m.contentInput[:len(m.contentInput)-1]
			}

		case "ctrl+u":
			// Clear current input
			if m.focusTitle {
				m.titleInput = ""
			} else {
				m.contentInput = ""
			}

		default:
			// Add character to current input
			if len(msg.Runes) == 1 {
				r := msg.Runes[0]
				if r >= 32 && r != 127 {
					if m.focusTitle {
						m.titleInput += string(r)
					} else {
						m.contentInput += string(r)
					}
				}
			}
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	}

	return m, nil
}

// View renders the create view
func (m CreateModel) View() string {
	var b strings.Builder

	b.WriteString(m.theme.HeaderStyle().Render("✏️  Quick Note"))
	b.WriteString("\n\n")

	// Title input
	titleLabel := "Title:"
	if m.focusTitle {
		titleLabel = "Title: (focused)"
		b.WriteString(m.theme.SuccessStyle().Bold(true).Render(titleLabel))
	} else {
		b.WriteString(m.theme.MutedStyle().Render(titleLabel))
	}
	b.WriteString("\n")

	titleBoxStyle := m.theme.BorderStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(0, 1).
		Width(m.width - 4)

	if m.focusTitle {
		titleBoxStyle = m.theme.ActiveBorderStyle().
			Border(lipgloss.RoundedBorder()).
			Padding(0, 1).
			Width(m.width - 4)
	}

	titleDisplay := m.titleInput
	if titleDisplay == "" {
		titleDisplay = "(empty - will use timestamp)"
	}
	if m.focusTitle {
		titleDisplay += m.theme.MutedStyle().Render("█")
	}

	b.WriteString(titleBoxStyle.Render(titleDisplay))
	b.WriteString("\n\n")

	// Content input
	contentLabel := "Content:"
	if !m.focusTitle {
		contentLabel = "Content: (focused)"
		b.WriteString(m.theme.SuccessStyle().Bold(true).Render(contentLabel))
	} else {
		b.WriteString(m.theme.MutedStyle().Render(contentLabel))
	}
	b.WriteString("\n")

	contentBoxStyle := m.theme.BorderStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(0, 1).
		Width(m.width - 4).
		Height(10)

	if !m.focusTitle {
		contentBoxStyle = m.theme.ActiveBorderStyle().
			Border(lipgloss.RoundedBorder()).
			Padding(0, 1).
			Width(m.width - 4).
			Height(10)
	}

	contentDisplay := m.contentInput
	if contentDisplay == "" {
		contentDisplay = "(optional - can edit in $EDITOR after)"
	}
	if !m.focusTitle {
		contentDisplay += m.theme.MutedStyle().Render("█")
	}

	b.WriteString(contentBoxStyle.Render(contentDisplay))
	b.WriteString("\n\n")

	// Help text
	b.WriteString(m.theme.MutedStyle().Render("Tab to switch fields • Enter to save • Esc to cancel"))

	return b.String()
}

// GetTitle returns the title (or generates one from timestamp)
func (m CreateModel) GetTitle() string {
	if m.titleInput == "" {
		// Generate timestamp-based title
		return time.Now().Format("2006-01-02-1504")
		// 🔵 GO CONCEPT: Time formatting
		// Go uses a reference time (Jan 2, 2006, 3:04 PM) for formatting.
		// This is unique to Go - instead of "YYYY-MM-DD", you use "2006-01-02".
	}
	return m.titleInput
}

// GetContent returns the content
func (m CreateModel) GetContent() string {
	if m.contentInput == "" {
		return ""
	}
	return m.contentInput
}

// GetFilename returns the filename for this note
func (m CreateModel) GetFilename() string {
	title := m.GetTitle()

	// If no title, use timestamp-based filename
	if title == "" || title == "Untitled" {
		return note.GenerateFilename()
	}

	// Otherwise, use title-based filename
	filename := strings.ReplaceAll(title, " ", "-")
	filename = strings.ToLower(filename)
	if !strings.HasSuffix(filename, ".md") {
		filename += ".md"
	}
	return filename
}
