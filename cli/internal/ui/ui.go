package ui

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/daphen/notes-cli/internal/note"
	"github.com/daphen/notes-cli/internal/theme"
)

// ViewMode represents which view is currently active
type ViewMode int

const (
	ViewBrowse ViewMode = iota // Browse/search notes
	ViewCreate                  // Quick note creation
	ViewSync                    // Sync status (background)
)

// 🔵 GO CONCEPT: iota
// iota is a special identifier for creating enumerated constants.
// It starts at 0 and increments for each const in the block.
// So ViewBrowse=0, ViewCreate=1, ViewSync=2

// Model is the main application state
type Model struct {
	currentView ViewMode
	browse      BrowseModel
	create      CreateModel

	// Sync state (runs in background)
	syncStatus   string
	syncMessages []string
	watching     bool
	lastSync     time.Time
	loading      bool

	// Config
	notesDir   string
	editorPath string

	// Terminal size
	width  int
	height int

	// Error state
	err error

	// Theme
	theme *theme.Theme

	// Channels for communication
	// 🔵 BUBBLE TEA CONCEPT: Program reference
	// We'll store the tea.Program to send messages from goroutines
	program *tea.Program
}

// NewModel creates the initial model
func NewModel(notesDir string) Model {
	// Get editor from environment
	editor := os.Getenv("EDITOR")
	if editor == "" {
		editor = "nvim" // Default to nvim
	}

	// Load theme
	themeObj, _ := theme.Load()

	return Model{
		currentView:  ViewBrowse,
		browse:       NewBrowseModel(themeObj),
		create:       NewCreateModel(themeObj),
		syncStatus:   "Ready",
		syncMessages: []string{},
		watching:     false,
		lastSync:     time.Now(),
		loading:      true, // Start in loading state
		notesDir:     notesDir,
		editorPath:   editor,
		theme:        themeObj,
	}
}

// SetProgram stores a reference to the tea.Program
func (m *Model) SetProgram(p *tea.Program) {
	m.program = p
}

// Custom messages

type notesLoadedMsg struct {
	notes []NoteItem
}

type noteCreatedMsg struct {
	path string
}

type editorFinishedMsg struct {
	err error
}

type syncStatusMsg string

type syncSuccessMsg struct {
	file string
}

type syncErrorMsg struct {
	err error
}

// Init is called once when the program starts
func (m Model) Init() tea.Cmd {
	return tea.Batch(
		loadNotes(m.notesDir),
		tickEverySecond(),
	)
}

// Update handles messages and updates the model
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// 🔵 BUBBLE TEA CONCEPT: Delegating updates
	// We handle global keys here, then delegate to sub-views

	switch msg := msg.(type) {
	case tea.KeyMsg:
		// Global keys (work in any view)
		switch msg.String() {
		case "ctrl+c", "ctrl+q":
			if m.currentView == ViewBrowse {
				return m, tea.Quit
			} else {
				// In other views, go back to browse
				m.currentView = ViewBrowse
				return m, nil
			}

		case "esc":
			// Always go back to browse
			m.currentView = ViewBrowse
			return m, nil

		case "ctrl+n":
			// Create new note
			if m.currentView == ViewBrowse {
				m.currentView = ViewCreate
				m.create.Reset()
				return m, nil
			}

		case "enter":
			if m.currentView == ViewBrowse {
				// Open selected note in editor
				selected := m.browse.GetSelectedNote()
				if selected != nil {
					return m, openInEditor(m.notesDir, selected.Path, m.editorPath)
				}
			} else if m.currentView == ViewCreate {
				// Save the new note
				return m, createNote(m.notesDir, m.create.GetFilename(), m.create.GetTitle(), m.create.GetContent())
			}
		}

		// Delegate to current view
		switch m.currentView {
		case ViewBrowse:
			var cmd tea.Cmd
			m.browse, cmd = m.browse.Update(msg)
			return m, cmd

		case ViewCreate:
			var cmd tea.Cmd
			m.create, cmd = m.create.Update(msg)
			return m, cmd
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.browse, _ = m.browse.Update(msg)
		m.create, _ = m.create.Update(msg)

	case notesLoadedMsg:
		m.loading = false
		m.browse.SetNotes(msg.notes)

	case noteCreatedMsg:
		m.syncMessages = append(m.syncMessages, fmt.Sprintf("✓ Created: %s", msg.path))
		m.currentView = ViewBrowse
		return m, tea.Batch(
			loadNotes(m.notesDir), // Reload list
			openInEditor(m.notesDir, msg.path, m.editorPath), // Open in editor
		)

	case editorFinishedMsg:
		if msg.err != nil {
			m.err = msg.err
		}
		// Reload notes after editing
		return m, loadNotes(m.notesDir)

	case syncStatusMsg:
		m.syncStatus = string(msg)

	case syncSuccessMsg:
		m.syncMessages = append(m.syncMessages, fmt.Sprintf("✓ Synced: %s", msg.file))
		m.lastSync = time.Now()
		// Keep only last 10 messages
		if len(m.syncMessages) > 10 {
			m.syncMessages = m.syncMessages[len(m.syncMessages)-10:]
		}

	case syncErrorMsg:
		m.err = msg.err
		m.syncMessages = append(m.syncMessages, fmt.Sprintf("✗ Error: %s", msg.err))

	case tickMsg:
		// If loading, request faster ticks for spinner animation
		if m.loading {
			return m, tea.Tick(100*time.Millisecond, func(t time.Time) tea.Msg {
				return tickMsg(t)
			})
		}
		return m, tickEverySecond()
	}

	return m, nil
}

// View renders the UI
func (m Model) View() string {
	var b strings.Builder

	// Header
	title := "NOTES"
	if m.watching {
		title += " (watching)"
	}
	b.WriteString(m.theme.HeaderStyle().MarginBottom(1).Render(title))
	b.WriteString("\n")

	// Show loading spinner if loading
	if m.loading {
		b.WriteString("\n")
		spinner := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
		frame := int(time.Now().UnixNano()/100000000) % len(spinner)
		b.WriteString(m.theme.AccentStyle().Render(spinner[frame] + " Loading notes..."))
		b.WriteString("\n")
	} else {
		// Render current view
		switch m.currentView {
		case ViewBrowse:
			b.WriteString(m.browse.View())

		case ViewCreate:
			b.WriteString(m.create.View())
		}
	}

	// Footer with sync status
	b.WriteString("\n")
	timeSince := time.Since(m.lastSync)
	syncInfo := fmt.Sprintf("Last sync: %s ago", formatDuration(timeSince))

	if m.currentView == ViewBrowse {
		b.WriteString(m.theme.MutedStyle().Render(syncInfo + " • Ctrl+N: create • Ctrl+Q: quit"))
	} else if m.currentView == ViewCreate {
		b.WriteString(m.theme.MutedStyle().Render("Esc to cancel"))
	}

	// Show error if any
	if m.err != nil {
		b.WriteString("\n")
		b.WriteString(m.theme.ErrorStyle().Render(fmt.Sprintf("Error: %v", m.err)))
	}

	return b.String()
}

// Helper commands

func loadNotes(notesDir string) tea.Cmd {
	return func() tea.Msg {
		var notes []NoteItem

		err := filepath.Walk(notesDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil // Skip errors
			}
			if !info.IsDir() && strings.HasSuffix(path, ".md") {
				relPath, _ := filepath.Rel(notesDir, path)

				// Read file content to extract proper title
				content, err := os.ReadFile(path)
				if err != nil {
					// Fallback to filename-based title on error
					title := strings.TrimSuffix(filepath.Base(path), ".md")
					title = strings.ReplaceAll(title, "-", " ")
					if len(title) > 0 {
						title = strings.ToUpper(string(title[0])) + title[1:]
					}
					notes = append(notes, NoteItem{
						Path:  relPath,
						Title: title,
					})
					return nil
				}

				// Extract title from markdown content
				title := note.ExtractTitle(string(content), relPath)

				notes = append(notes, NoteItem{
					Path:  relPath,
					Title: title,
				})
			}
			return nil
		})

		if err != nil {
			return syncErrorMsg{err: err}
		}

		return notesLoadedMsg{notes: notes}
	}
}

func createNote(notesDir, filename, title, content string) tea.Cmd {
	return func() tea.Msg {
		fullPath := filepath.Join(notesDir, filename)

		// Check if file exists - avoid overwriting
		if _, err := os.Stat(fullPath); err == nil {
			// File exists! Add timestamp suffix
			ext := filepath.Ext(filename)
			base := strings.TrimSuffix(filename, ext)
			timestamp := time.Now().Format("20060102-1504")
			filename = fmt.Sprintf("%s-%s%s", base, timestamp, ext)
			fullPath = filepath.Join(notesDir, filename)
		}

		// Create initial content
		noteContent := "# " + title + "\n\n" + content

		if err := os.WriteFile(fullPath, []byte(noteContent), 0644); err != nil {
			return syncErrorMsg{err: err}
		}

		return noteCreatedMsg{path: filename}
	}
}

func openInEditor(notesDir, notePath, editor string) tea.Cmd {
	fullPath := filepath.Join(notesDir, notePath)

	return tea.ExecProcess(exec.Command(editor, fullPath), func(err error) tea.Msg {
		// 🔵 BUBBLE TEA CONCEPT: tea.ExecProcess
		// This suspends the Bubble Tea UI, runs an external command,
		// then restores the UI when the command finishes.
		// Perfect for opening $EDITOR!

		return editorFinishedMsg{err: err}
	})
}

type tickMsg time.Time

func tickEverySecond() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%dh", int(d.Hours()))
}

// SendSyncSuccess sends a sync success message
func SendSyncSuccess(file string) tea.Msg {
	return syncSuccessMsg{file: file}
}

// SendSyncError sends a sync error message
func SendSyncError(err error) tea.Msg {
	return syncErrorMsg{err: err}
}

// SendSyncStatus sends a status update
func SendSyncStatus(status string) tea.Msg {
	return syncStatusMsg(status)
}
