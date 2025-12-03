# Notes CLI - Bubble Tea Sync Tool

A beautiful terminal UI for syncing your notes, built with Go and Bubble Tea!

## What This Is

This replaces the bash `notes-sync.sh` script with a proper Go application that:
- ✅ Watches your notes directory for changes
- ✅ Automatically syncs to your API server
- ✅ Shows real-time sync status in a beautiful TUI
- ✅ Handles push/pull operations
- ✅ Won't corrupt your files like the bash script did!

## Installation

```bash
cd /home/daphen/personal/notes-cli
go build -o notes-cli ./cmd/notes-cli

# Optional: Install system-wide
sudo cp notes-cli /usr/local/bin/
```

## Configuration

First time setup - interactive prompts:

```bash
notes-cli -init
```

This will interactively ask you for:
- **API URL** - Your notes API endpoint (default: http://localhost:3000)
- **Auth password** - Your authentication password
- **Notes directory** - Where your markdown files are stored
- **Client ID** - Identifier for this client (default: notes-cli-go)

The config is saved to `~/.config/notes-cli/config.toml` with secure permissions (0600).

## Usage

### Watch Mode (Default)
Start the interactive TUI that watches for changes:

```bash
notes-cli
```

**Keybindings:**
- `r` - Manual refresh
- `q` or `Ctrl+C` - Quit

### Push All Notes
Manually push all local notes to the server:

```bash
notes-cli -push
```

### Pull Notes
Pull all notes from the server:

```bash
notes-cli -pull
```

## Project Structure

```
notes-cli/
├── cmd/
│   └── notes-cli/
│       └── main.go          # Entry point, CLI commands
├── internal/
│   ├── config/
│   │   └── config.go        # TOML configuration loading
│   ├── client/
│   │   └── client.go        # HTTP API client
│   ├── watcher/
│   │   └── watcher.go       # File system watcher (fsnotify)
│   └── ui/
│       └── ui.go            # Bubble Tea TUI
├── go.mod
└── README.md
```

## Key Go Concepts Used

This is a great first Go project because it demonstrates:

### 🔵 Basic Go Concepts
- **Packages & Imports** - How Go organizes code
- **Structs** - Go's data structures (like classes without methods inheritance)
- **Pointers** (`*T`, `&var`) - References to data
- **Error Handling** - Explicit error returns, no exceptions
- **Methods** (`func (r *Receiver) Method()`) - Functions attached to types
- **Multiple Return Values** - Common pattern: `(result, error)`
- **defer** - Cleanup code that runs at function end
- **Slices** - Dynamic arrays
- **Maps** - Key-value stores
- **Interfaces** - Implicit contracts (we use `tea.Model`)

### 🔵 Concurrency
- **Goroutines** (`go func()`) - Lightweight threads
- **Channels** (`chan T`, `<-chan T`) - Communication between goroutines
- **select** - Multiplexing channel operations
- **Range over channels** - Processing streams of events

### 🔵 Bubble Tea Concepts
- **The Elm Architecture (TEA)**
  - **Model** - Your application state
  - **Update** - How state changes (like a reducer)
  - **View** - How to render state
- **Commands** (`tea.Cmd`) - Async operations that return messages
- **Messages** (`tea.Msg`) - Events that trigger updates
- **Batching** (`tea.Batch`) - Running multiple commands
- **tea.Send()** - Sending messages from goroutines

## How It Works

1. **Main** (`cmd/notes-cli/main.go`)
   - Parses command-line flags
   - Loads config from TOML
   - Authenticates with API
   - Starts watch mode with TUI

2. **File Watcher** (`internal/watcher/watcher.go`)
   - Uses `fsnotify` to watch directory recursively
   - Debounces rapid changes (500ms)
   - Sends file changes through a channel
   - Only watches `.md` files

3. **API Client** (`internal/client/client.go`)
   - Authenticates and stores cookie
   - Push: sends local changes to server
   - Pull: fetches server changes
   - Handles JSON serialization

4. **Bubble Tea UI** (`internal/ui/ui.go`)
   - Shows sync status in real-time
   - Displays recent activity log
   - Updates every second to show "last sync" time
   - Receives sync results from watcher goroutine

## Architecture Flow

```
User edits note.md
        ↓
fsnotify detects change
        ↓
Watcher debounces (500ms)
        ↓
Sends FileChange through channel
        ↓
Main goroutine receives it
        ↓
API Client pushes to server
        ↓
Success/error sent to TUI via p.Send()
        ↓
TUI updates to show result
```

## Comparison to Bash Script

**Bash Script (`notes-sync.sh`):**
- ❌ Can corrupt files (as you experienced!)
- ❌ No visual feedback
- ❌ Basic error handling
- ❌ Fragile parsing
- ✅ Simple to read

**Go CLI (this!):**
- ✅ Type-safe, catches errors at compile time
- ✅ Beautiful real-time UI
- ✅ Proper file watching with debouncing
- ✅ Structured error handling
- ✅ Concurrent sync operations
- ✅ Your first Go project!

## Learning Resources

- [Go Tour](https://go.dev/tour/) - Interactive Go tutorial
- [Bubble Tea Tutorial](https://github.com/charmbracelet/bubbletea/tree/master/tutorials)
- [Effective Go](https://go.dev/doc/effective_go) - Go best practices

## Next Steps

Some ideas for improvements:
- Add conflict resolution UI
- Search notes from the TUI
- Fuzzy find with fzf-like interface
- Note preview in the TUI
- Systemd service file for auto-start
- Better error recovery
- Progress bars for bulk operations
