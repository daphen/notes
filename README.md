# Notes Sync

A self-hosted markdown notes system with real-time sync between web and terminal.

## Quick Start

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/daphen/notes&root=webapp&env=DATABASE_URL,AUTH_PASSWORD&envDescription=Database%20connection%20and%20login%20password&envLink=https://github.com/daphen/notes%23environment-variables&project-name=notes)

Click the button above, then:

1. **Connect GitHub** (if prompted)
2. **Create repository** - name it whatever you want
3. **Configure environment variables:**
   - `DATABASE_URL` → Click **Add Integration** → Select **Neon** → This creates your database automatically
   - `AUTH_PASSWORD` → Choose any password for login
4. **Click Deploy** and wait for the build to complete
5. **Visit your app URL** and login with your password

### 2. Install the CLI

Click **CLI** in the top-right corner of your app (or go to `https://your-app.vercel.app/cli`).

Copy and run the install command. It will:
- Download the CLI for your system
- Connect to your server automatically
- Ask for your password

### 3. Start using it

```bash
notes-cli          # Browse notes in terminal
notes-cli -pull    # Pull notes from server
notes-cli -push    # Push local changes
notes-cli -watch   # Auto-sync on file changes
```

Your notes are stored as markdown files in `~/notes/` and sync automatically.

---

## Features

**Web App**
- PWA - install on your phone's home screen
- Offline support
- Dark mode

**CLI**
- Terminal UI with fuzzy search
- Real-time file watching
- Auto-sync

**Sync**
- Bidirectional sync
- Conflict detection
- Works offline

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_PASSWORD` | Yes | Password for login |
| `JWT_SECRET` | No | Auto-generated if not set |

---

## Building from Source

<details>
<summary>For contributors</summary>

### Prerequisites
- Node.js 20+
- Go 1.22+
- pnpm

### Local Development
```bash
./setup.sh
```

### Manual Setup

**Webapp:**
```bash
cd webapp
pnpm install
cp .env.example .env.local  # Edit with your values
pnpm db:push
pnpm dev
```

**CLI:**
```bash
cd cli
go build -o notes-cli ./cmd/notes-cli
./notes-cli -init
```

</details>

---

## Project Structure

```
notes-sync/
├── webapp/          # Next.js 15 web app
├── cli/             # Go CLI (Bubble Tea)
├── install.sh       # Standalone CLI installer
├── setup.sh         # Local dev setup
└── .github/         # CI for releases
```

## License

MIT
