# Markdown Notes Sync

A self-hosted note-taking system with seamless sync between Linux and iOS via a Progressive Web App.

## Problem Statement

Existing solutions for syncing notes between Linux and iPhone are either:
- **Expensive** (Obsidian Sync, iCloud requires macOS)
- **Limited** (Simplenote lacks markdown support)
- **Cumbersome** (Git + Working Copy requires manual push/pull)

We need a simple, self-hosted solution that:
1. Stores notes as plain markdown files
2. Syncs automatically between devices
3. Integrates with iOS Share Sheet for quick capture
4. Works with local tools like Neovim on Linux

## Solution Overview

A Next.js application that serves as both the sync backend and the mobile interface, with a lightweight CLI/daemon for Linux that watches a local folder and syncs changes.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Architecture                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Linux Workstation              Cloud (Vercel/VPS)             │
│  ┌─────────────────┐           ┌─────────────────────┐          │
│  │  ~/notes/       │           │     Next.js App     │          │
│  │  ├── todo.md    │◀─────────▶│  ┌───────────────┐  │          │
│  │  ├── ideas.md   │   sync    │  │   API Routes  │  │          │
│  │  └── work/      │  (REST)   │  ├───────────────┤  │          │
│  │      └── ...    │           │  │   Database    │  │          │
│  └─────────────────┘           │  │  (Postgres)   │  │          │
│          ▲                     │  └───────────────┘  │          │
│          │                     └──────────▲──────────┘          │
│          │                                │                     │
│  ┌───────┴───────┐                        │                     │
│  │  notes-sync   │               ┌────────┴────────┐            │
│  │   (daemon)    │               │   iPhone PWA    │            │
│  └───────────────┘               │  (Share Target) │            │
│                                  └─────────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Core Features

### 1. Web Application (Next.js)

- **Note Management**
  - List all notes with search and filtering
  - Create, edit, delete notes
  - Markdown editor with live preview
  - Folder/tag organization

- **PWA Capabilities**
  - Installable on iOS home screen
  - Offline support with service worker
  - Web Share Target API for iOS share sheet integration

- **API Endpoints**
  ```
  GET    /api/notes          - List all notes
  GET    /api/notes/:id      - Get single note
  POST   /api/notes          - Create note
  PUT    /api/notes/:id      - Update note
  DELETE /api/notes/:id      - Delete note
  POST   /api/share          - Receive from share sheet
  GET    /api/sync           - Get changes since timestamp
  POST   /api/sync           - Push local changes
  ```

### 2. iOS Share Sheet Integration

When the PWA is installed, it appears in the iOS share sheet. Users can share:
- Plain text → creates new note
- URLs → creates note with link
- Text selections from any app

**Implementation:**
```json
// manifest.json
{
  "name": "Notes",
  "short_name": "Notes",
  "start_url": "/",
  "display": "standalone",
  "share_target": {
    "action": "/api/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

### 3. Linux Sync Daemon

A lightweight CLI tool that:
- Watches a local directory for changes
- Syncs bidirectionally with the server
- Handles conflict resolution (last-write-wins or prompt)
- Runs as a systemd service

**Commands:**
```bash
notes-sync init              # Initialize and authenticate
notes-sync watch             # Start watching (foreground)
notes-sync daemon            # Start as background service
notes-sync push              # Manual push
notes-sync pull              # Manual pull
notes-sync status            # Show sync status
```

### 4. Authentication

Simple but secure:
- Single-user focus (personal notes)
- JWT tokens with refresh
- API key option for CLI daemon
- Optional: passkey/WebAuthn for mobile

## Technical Stack

| Component        | Technology                    |
|------------------|-------------------------------|
| Framework        | Next.js 15 (App Router)       |
| Database         | PostgreSQL (Vercel Postgres)  |
| ORM              | Drizzle ORM                   |
| Styling          | Tailwind CSS                  |
| UI Components    | shadcn/ui                     |
| Markdown         | MDX / react-markdown          |
| Editor           | CodeMirror or Monaco          |
| Auth             | JWT + secure cookies          |
| Linux Daemon     | Rust or Node.js               |
| File Watching    | chokidar (Node) / notify (Rust) |

## Data Model

```sql
-- Notes table
CREATE TABLE notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  path          TEXT UNIQUE NOT NULL,  -- e.g., "work/project-x.md"
  checksum      TEXT NOT NULL,          -- For sync conflict detection
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  deleted_at    TIMESTAMP               -- Soft delete for sync
);

-- Sync log for tracking changes
CREATE TABLE sync_log (
  id            SERIAL PRIMARY KEY,
  note_id       UUID REFERENCES notes(id),
  action        TEXT NOT NULL,          -- 'create', 'update', 'delete'
  timestamp     TIMESTAMP DEFAULT NOW(),
  client_id     TEXT NOT NULL           -- Which device made the change
);
```

## Sync Protocol

### Pull (Client → Server)
```
GET /api/sync?since=<timestamp>&client_id=<id>

Response:
{
  "changes": [
    { "id": "...", "path": "todo.md", "content": "...", "action": "update" },
    { "id": "...", "path": "old.md", "action": "delete" }
  ],
  "timestamp": "2025-11-28T12:00:00Z"
}
```

### Push (Client → Server)
```
POST /api/sync

Body:
{
  "client_id": "linux-workstation",
  "changes": [
    { "path": "new-note.md", "content": "...", "checksum": "abc123" }
  ]
}

Response:
{
  "accepted": ["new-note.md"],
  "conflicts": []
}
```

### Conflict Resolution

1. **Last-write-wins** (default): Most recent change takes precedence
2. **Manual merge**: On conflict, create `.conflict` file for user to resolve
3. **Server-wins**: For mobile (simpler UX)

## Project Structure

```
notes/
├── apps/
│   ├── web/                    # Next.js application
│   │   ├── app/
│   │   │   ├── (app)/          # Authenticated routes
│   │   │   │   ├── page.tsx    # Note list
│   │   │   │   ├── [id]/       # Single note view/edit
│   │   │   │   └── new/        # Create note
│   │   │   ├── api/
│   │   │   │   ├── notes/
│   │   │   │   ├── share/
│   │   │   │   └── sync/
│   │   │   ├── login/
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/             # shadcn components
│   │   │   ├── editor/
│   │   │   └── notes/
│   │   ├── lib/
│   │   │   ├── db/
│   │   │   ├── auth/
│   │   │   └── sync/
│   │   ├── public/
│   │   │   └── manifest.json
│   │   └── package.json
│   │
│   └── cli/                    # Linux sync daemon
│       ├── src/
│       │   ├── main.rs         # (or index.ts)
│       │   ├── sync.rs
│       │   ├── watch.rs
│       │   └── config.rs
│       └── Cargo.toml          # (or package.json)
│
├── packages/
│   └── shared/                 # Shared types/utilities
│       ├── types.ts
│       └── checksum.ts
│
├── PROJECT_PLAN.md
├── turbo.json                  # Monorepo config
└── package.json
```

## Implementation Phases

### Phase 1: Core Web App (10h)
- [ ] Next.js project setup with Tailwind + shadcn
- [ ] Database schema and Drizzle ORM setup
- [ ] Basic CRUD API routes for notes
- [ ] Note list and editor UI
- [ ] Markdown rendering with react-markdown

### Phase 2: PWA + Share Target (6h)
- [ ] PWA manifest with share_target
- [ ] Service worker for offline support
- [ ] Share API endpoint
- [ ] "Add to Home Screen" flow documentation
- [ ] Test on iOS Safari

### Phase 3: Authentication (4h)
- [ ] Login page
- [ ] JWT token generation and validation
- [ ] API key generation for CLI
- [ ] Secure cookie handling
- [ ] Middleware for protected routes

### Phase 4: Sync Protocol (8h)
- [ ] Sync log table and tracking
- [ ] GET /api/sync endpoint (pull)
- [ ] POST /api/sync endpoint (push)
- [ ] Checksum-based conflict detection
- [ ] Conflict resolution strategy

### Phase 5: Linux CLI Daemon (8h)
- [ ] CLI argument parsing
- [ ] Config file (~/.config/notes-sync/config.toml)
- [ ] File system watcher
- [ ] Sync client implementation
- [ ] Systemd service file

### Phase 6: Polish (4h)
- [ ] Search functionality
- [ ] Folder organization
- [ ] Dark mode
- [ ] Error handling and toasts
- [ ] Loading states

## Deployment

### Web App
- **Vercel** (recommended): Free tier includes Postgres
- **Railway**: Alternative with more control
- **Self-hosted**: Docker compose with Nginx

### Linux Daemon
- AUR package for Arch Linux
- Or simple `cargo install` / `npm install -g`

## Environment Variables

```env
# Database
DATABASE_URL=postgres://...

# Auth
JWT_SECRET=<random-string>
API_KEY_SALT=<random-string>

# App
NEXT_PUBLIC_APP_URL=https://notes.example.com
```

## Future Enhancements

- [ ] End-to-end encryption
- [ ] Note sharing with expiring links
- [ ] Attachments/images
- [ ] Tags and full-text search
- [ ] Vim keybindings in editor
- [ ] Neovim plugin for direct integration
- [ ] Android support (same PWA)

## Getting Started

```bash
# Clone and install
cd /home/daphen/personal/notes
pnpm install

# Set up database
pnpm db:push

# Start development
pnpm dev

# Build CLI
cd apps/cli
cargo build --release
```

---

*Estimated total: ~40h for full implementation*
*MVP (web + share): ~16h*
