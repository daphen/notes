package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/daphen/notes-cli/internal/client"
	"github.com/daphen/notes-cli/internal/config"
	"github.com/daphen/notes-cli/internal/note"
	"github.com/daphen/notes-cli/internal/ui"
	"github.com/daphen/notes-cli/internal/watcher"
)

func main() {
	var (
		configPath = flag.String("config", "", "Path to config file")
		initCmd    = flag.Bool("init", false, "Initialize config file")
		pushCmd    = flag.Bool("push", false, "Push all notes to server")
		pullCmd    = flag.Bool("pull", false, "Pull notes from server")
		createCmd  = flag.Bool("create", false, "Quick note creation mode")
		watchMode  = flag.Bool("watch", false, "Watch mode without TUI (background)")
	)

	flag.Parse()

	// Handle init command
	if *initCmd {
		if err := initConfig(); err != nil {
			log.Fatal(err)
		}
		return
	}

	// Load config
	cfgPath := *configPath
	if cfgPath == "" {
		var err error
		cfgPath, err = config.DefaultConfigPath()
		if err != nil {
			log.Fatalf("Failed to get config path: %v", err)
		}
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v\nRun 'notes-cli -init' to create a config file.", err)
	}

	// Create API client
	apiClient := client.New(cfg.APIURL, cfg.AuthPassword)

	// Authenticate
	if err := apiClient.Authenticate(); err != nil {
		log.Fatalf("Authentication failed: %v", err)
	}

	// Handle commands
	if *pushCmd {
		if err := pushNotes(cfg, apiClient); err != nil {
			log.Fatalf("Push failed: %v", err)
		}
		return
	}

	if *pullCmd {
		if err := pullNotes(cfg, apiClient); err != nil {
			log.Fatalf("Pull failed: %v", err)
		}
		return
	}

	if *createCmd {
		// Quick create mode - start TUI in create view
		if err := quickCreate(cfg, apiClient); err != nil {
			log.Fatalf("Create failed: %v", err)
		}
		return
	}

	if *watchMode {
		// Background watch (no TUI)
		if err := watchBackground(cfg, apiClient); err != nil {
			log.Fatalf("Watch failed: %v", err)
		}
		return
	}

	// Default: Start browse mode with TUI + background sync
	if err := browseWithSync(cfg, apiClient); err != nil {
		log.Fatalf("Browse failed: %v", err)
	}
}

func initConfig() error {
	cfgPath, err := config.DefaultConfigPath()
	if err != nil {
		return err
	}

	// Check if config already exists
	if _, err := os.Stat(cfgPath); err == nil {
		fmt.Printf("Config file already exists at: %s\n", cfgPath)
		fmt.Print("Overwrite? (y/N): ")
		var response string
		fmt.Scanln(&response)

		if response != "y" && response != "Y" {
			fmt.Println("Keeping existing config.")
			return nil
		}
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(cfgPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Interactive prompts
	fmt.Println("\n📝 Notes CLI Configuration")
	fmt.Println("==========================\n")

	var apiURL, password, notesDir, clientID string

	fmt.Print("API URL [https://notes-sigma-tawny.vercel.app]: ")
	fmt.Scanln(&apiURL)
	if apiURL == "" {
		apiURL = "https://notes-sigma-tawny.vercel.app"
	}

	fmt.Print("Auth password: ")
	fmt.Scanln(&password)
	if password == "" {
		return fmt.Errorf("password is required")
	}

	fmt.Print("Notes directory [~/personal/notes/storage]: ")
	fmt.Scanln(&notesDir)
	if notesDir == "" {
		notesDir = "~/personal/notes/storage"
	}

	fmt.Print("Client ID [notes-cli-go]: ")
	fmt.Scanln(&clientID)
	if clientID == "" {
		clientID = "notes-cli-go"
	}

	// Generate config content
	configContent := fmt.Sprintf(`# Notes CLI Configuration
api_url = "%s"
auth_password = "%s"
notes_dir = "%s"
client_id = "%s"
`, apiURL, password, notesDir, clientID)

	// Write config file with secure permissions
	if err := os.WriteFile(cfgPath, []byte(configContent), 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	fmt.Printf("\n✓ Created config file at: %s\n", cfgPath)
	fmt.Println("✓ Ready to use! Run 'notes-cli' to start browsing.")
	return nil
}

func pushNotes(cfg *config.Config, apiClient *client.Client) error {
	w, err := watcher.New(cfg.NotesDir)
	if err != nil {
		return err
	}
	defer w.Close()

	fmt.Println("Reading all notes...")
	changes, err := w.ReadAllNotes()
	if err != nil {
		return err
	}

	fmt.Printf("Found %d notes to push\n", len(changes))

	// Process each note with business logic (title extraction, checksum, etc.)
	notes := make([]client.Note, len(changes))
	for i, change := range changes {
		processed := note.ProcessNote(change.Path, change.Content, "update")
		notes[i] = client.Note{
			Path:     processed.Path,
			Title:    processed.Title,
			Content:  processed.Content,
			Checksum: processed.Checksum,
			Action:   processed.Action,
		}
	}

	fmt.Println("Pushing to server...")
	resp, err := apiClient.Push(notes)
	if err != nil {
		return err
	}

	fmt.Printf("Sent %d notes, server accepted %d\n", len(notes), len(resp.Accepted))

	if len(resp.Accepted) > 0 {
		fmt.Println("\n✓ Accepted:")
		for _, path := range resp.Accepted {
			fmt.Printf("  • %s\n", path)
		}
	}

	if len(resp.Conflicts) > 0 {
		fmt.Println("\n⚠ Conflicts:")
		for _, path := range resp.Conflicts {
			fmt.Printf("  • %s\n", path)
		}
	}

	if len(resp.Accepted) != len(notes) {
		fmt.Printf("\n⚠ WARNING: Sent %d notes but only %d were accepted!\n", len(notes), len(resp.Accepted))
		return fmt.Errorf("incomplete sync: expected %d accepted, got %d", len(notes), len(resp.Accepted))
	}

	fmt.Printf("\n✓ Successfully synced all %d notes\n", len(notes))
	return nil
}

func pullNotes(cfg *config.Config, apiClient *client.Client) error {
	fmt.Println("Pulling notes from server...")
	resp, err := apiClient.Pull()
	if err != nil {
		return err
	}

	if len(resp.Changes) == 0 {
		fmt.Println("No changes to pull")
		return nil
	}

	fmt.Printf("Received %d notes\n", len(resp.Changes))

	for _, n := range resp.Changes {
		fullPath := filepath.Join(cfg.NotesDir, n.Path)

		dir := filepath.Dir(fullPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory: %w", err)
		}

		if err := os.WriteFile(fullPath, []byte(n.Content), 0644); err != nil {
			return fmt.Errorf("failed to write %s: %w", n.Path, err)
		}

		// Preserve server's modification time
		if n.UpdatedAt != "" {
			if modTime, err := time.Parse(time.RFC3339, n.UpdatedAt); err == nil {
				os.Chtimes(fullPath, modTime, modTime)
			}
		}

		fmt.Printf("  ✓ %s\n", n.Path)
	}

	return nil
}

func quickCreate(cfg *config.Config, apiClient *client.Client) error {
	// Start TUI in create mode
	model := ui.NewModel(cfg.NotesDir)
	model.SetCreateView() // Switch to create view immediately

	p := tea.NewProgram(model, tea.WithAltScreen())
	model.SetProgram(p)

	// Start background sync
	go backgroundSync(cfg, apiClient, p)

	if _, err := p.Run(); err != nil {
		return fmt.Errorf("TUI error: %w", err)
	}

	return nil
}

func browseWithSync(cfg *config.Config, apiClient *client.Client) error {
	// Create the TUI model
	model := ui.NewModel(cfg.NotesDir)

	// Create the program with alt screen (full terminal takeover)
	p := tea.NewProgram(model, tea.WithAltScreen())
	model.SetProgram(p)

	// Start initial sync + background watcher in goroutine
	go func() {
		// Signal sync starting
		p.Send(ui.SendSyncStart())

		// Pull from server first to get any remote changes
		resp, err := apiClient.Pull()
		if err != nil {
			p.Send(ui.SendSyncError(err))
		} else if len(resp.Changes) > 0 {
			// Apply remote changes to local files
			for _, n := range resp.Changes {
				fullPath := filepath.Join(cfg.NotesDir, n.Path)
				dir := filepath.Dir(fullPath)
				if err := os.MkdirAll(dir, 0755); err != nil {
					continue
				}
				if err := os.WriteFile(fullPath, []byte(n.Content), 0644); err != nil {
					continue
				}
				// Preserve server's modification time
				if n.UpdatedAt != "" {
					if modTime, err := time.Parse(time.RFC3339, n.UpdatedAt); err == nil {
						os.Chtimes(fullPath, modTime, modTime)
					}
				}
			}
			p.Send(ui.SendSyncSuccess(fmt.Sprintf("%d notes from server", len(resp.Changes))))
		}

		// Signal sync complete
		p.Send(ui.SendSyncEnd())

		// Now start watching for file changes
		backgroundSync(cfg, apiClient, p)
	}()

	// Run the TUI (blocks until quit)
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("TUI error: %w", err)
	}

	return nil
}

func watchBackground(cfg *config.Config, apiClient *client.Client) error {
	// Create file watcher
	w, err := watcher.New(cfg.NotesDir)
	if err != nil {
		return err
	}
	defer w.Close()

	fmt.Println("Watching for changes...")
	changes := w.Watch()

	for change := range changes {
		fmt.Printf("Detected change: %s\n", change.Path)

		// Process the note with business logic
		processed := note.ProcessNote(change.Path, change.Content, change.Action)

		notes := []client.Note{{
			Path:     processed.Path,
			Title:    processed.Title,
			Content:  processed.Content,
			Checksum: processed.Checksum,
			Action:   processed.Action,
		}}

		_, err := apiClient.Push(notes)
		if err != nil {
			fmt.Printf("Error syncing: %v\n", err)
		} else {
			fmt.Printf("✓ Synced: %s\n", change.Path)
		}

		time.Sleep(100 * time.Millisecond)
	}

	return nil
}

func backgroundSync(cfg *config.Config, apiClient *client.Client, p *tea.Program) {
	// Create file watcher
	w, err := watcher.New(cfg.NotesDir)
	if err != nil {
		p.Send(ui.SendSyncError(err))
		return
	}
	defer w.Close()

	p.Send(ui.SendSyncStatus("Watching for changes..."))

	changes := w.Watch()

	for change := range changes {
		// Signal sync starting
		p.Send(ui.SendSyncStart())

		// Process the note with business logic
		processed := note.ProcessNote(change.Path, change.Content, change.Action)

		// Sync this change to the server
		notes := []client.Note{{
			Path:     processed.Path,
			Title:    processed.Title,
			Content:  processed.Content,
			Checksum: processed.Checksum,
			Action:   processed.Action,
		}}

		_, err := apiClient.Push(notes)
		if err != nil {
			p.Send(ui.SendSyncError(err))
		} else {
			p.Send(ui.SendSyncSuccess(change.Path))
		}

		// Signal sync complete
		p.Send(ui.SendSyncEnd())

		time.Sleep(100 * time.Millisecond)
	}
}
