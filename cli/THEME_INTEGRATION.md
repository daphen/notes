# Theme Integration for Go TUI Apps

This documents how to integrate your centralized theme system (`~/.dotfiles/themes/colors.json`) into any Go terminal UI application.

## Quick Start

The notes CLI uses your theme system automatically! Just set an environment variable:

```bash
# Use dark theme (default)
export THEME=dark
notes-cli

# Use light theme
export THEME=light
notes-cli
```

## How It Works

Unlike other apps (nvim, fish, spotify-player) that need **templates** and **generation**, Go apps read your `colors.json` **directly**:

```
~/.dotfiles/themes/colors.json
         ↓
    (Go reads JSON)
         ↓
  Bubble Tea TUI with your colors
```

No build step. No generation. Instant theme switching.

## Using in New Go Apps

### 1. Copy the theme package

Copy the entire `internal/theme/` directory to your new Go project:

```bash
cp -r /home/daphen/personal/notes-cli/internal/theme /path/to/your-project/internal/
```

### 2. Load the theme in your code

```go
import "yourproject/internal/theme"

func NewModel() Model {
    // Load theme from ~/.dotfiles/themes/colors.json
    themeObj, _ := theme.Load()

    return Model{
        theme: themeObj,
        // ... other fields
    }
}
```

### 3. Use theme styles instead of hardcoded colors

**❌ Don't do this (hardcoded pink):**
```go
lipgloss.NewStyle().
    Foreground(lipgloss.Color("205")).  // Pink - not from your theme!
    Bold(true)
```

**✅ Do this (uses your theme):**
```go
m.theme.HeaderStyle()  // Uses accent.blue from your colors.json
```

### 4. Available style helpers

The theme package provides these ready-to-use styles:

```go
theme.HeaderStyle()         // Blue, bold - for titles
theme.SearchLabelStyle()    // Blue, bold - for search labels
theme.MutedStyle()          // Muted gray - for hints/secondary text
theme.SelectedStyle()       // Primary fg + selection bg - for selected items
theme.NormalStyle()         // Secondary fg - for normal text
theme.SuccessStyle()        // Green - for success messages
theme.ErrorStyle()          // Red, bold - for errors
theme.AccentStyle()         // Cyan - for highlights
theme.BorderStyle()         // Blue border - for inactive borders
theme.ActiveBorderStyle()   // Green border - for focused elements
```

### 5. Access raw colors

If you need custom styles:

```go
// Access any color from your theme
lipgloss.NewStyle().
    Foreground(lipgloss.Color(m.theme.Colors.Accent.Blue)).
    Background(lipgloss.Color(m.theme.Colors.Background.Selection))
```

## Environment Variable

The theme package checks `THEME` environment variable:

```bash
# Dark mode
export THEME=dark

# Light mode
export THEME=light

# Not set = defaults to dark
unset THEME
```

### Setting globally

Add to your `~/.config/fish/config.fish`:

```fish
# Always use dark theme for Go TUIs
set -gx THEME dark
```

Or create a toggle function:

```fish
function toggle_go_theme
    if test "$THEME" = "light"
        set -gx THEME dark
        echo "Switched to dark theme"
    else
        set -gx THEME light
        echo "Switched to light theme"
    end
end
```

## Color Mappings

Here's how your `colors.json` maps to the Go theme:

### Dark Theme
```
colors.json                 → Go TUI
─────────────────────────────────────
background.primary          → #181818 (main bg)
background.selection        → #282F38 (selected item bg)
foreground.primary          → #EDEDED (main text)
foreground.secondary        → #C3C8C6 (normal text)
foreground.muted            → #707B84 (hints, paths)
accent.blue                 → #CCD5E4 (headers, borders)
accent.green                → #97B5A6 (success, active)
accent.red                  → #FF7B72 (errors, warnings)
accent.cyan                 → #8A9AA6 (accents)
accent.yellow               → #ff8a31 (highlights)
```

### Light Theme
```
colors.json                 → Go TUI
─────────────────────────────────────
background.primary          → #FDF6E3 (main bg)
background.selection        → #f4eeee (selected item bg)
foreground.primary          → #2D4A3D (main text)
foreground.secondary        → #575279 (normal text)
foreground.muted            → #9893a5 (hints, paths)
accent.blue                 → #286983 (headers, borders)
accent.green                → #5E7270 (success, active)
accent.red                  → #ED333B (errors, warnings)
accent.cyan                 → #4A7C59 (accents)
```

## Why This Approach?

### Advantages over templates:

1. **No generation step** - Just read JSON directly
2. **Instant switching** - Change `THEME` and restart
3. **Type-safe** - Go structs catch errors at compile time
4. **Reusable** - Copy/paste to any Go project
5. **Single source of truth** - Same colors.json as everything else

### When to use templates:

Templates are for apps with **custom config formats**:
- Neovim (Lua)
- Fish shell (set commands)
- Spotify-player (TOML)
- Ghostty (custom format)

Go can read JSON natively, so **no template needed**!

## Example: Full Integration

```go
package ui

import (
    tea "github.com/charmbracelet/bubbletea"
    "yourproject/internal/theme"
)

type Model struct {
    theme *theme.Theme
    items []string
    cursor int
}

func NewModel() Model {
    themeObj, _ := theme.Load()

    return Model{
        theme: themeObj,
        items: []string{"Item 1", "Item 2"},
        cursor: 0,
    }
}

func (m Model) View() string {
    var s string

    // Header with your theme's blue
    s += m.theme.HeaderStyle().Render("My App")
    s += "\n\n"

    // List with selection highlighting
    for i, item := range m.items {
        if i == m.cursor {
            s += m.theme.SelectedStyle().Render("▶ " + item)
        } else {
            s += m.theme.NormalStyle().Render("  " + item)
        }
        s += "\n"
    }

    // Footer with muted hint text
    s += "\n"
    s += m.theme.MutedStyle().Render("Ctrl+Q to quit")

    return s
}
```

## Troubleshooting

### Colors look wrong

1. Check `THEME` is set: `echo $THEME`
2. Verify colors.json exists: `cat ~/.dotfiles/themes/colors.json`
3. Check if you're using hardcoded colors instead of theme styles

### Theme not updating

The theme is loaded **once at startup**. Restart your app after changing `THEME`:

```bash
# Change theme
export THEME=light

# Restart app (won't pick up change if already running)
notes-cli
```

### Want to force dark/light

Remove the `THEME` check and hardcode it:

```go
func Load() (*Theme, error) {
    // ... load colors.json ...

    // Force dark theme
    theme := &Theme{
        IsDark: true,
        Colors: themeFile.Themes.Dark,
    }

    return theme, nil
}
```

## Extending the Theme

### Add new color mappings

Edit `/home/daphen/personal/notes-cli/internal/theme/theme.go`:

```go
// Add new style helper
func (t *Theme) WarningStyle() lipgloss.Style {
    return lipgloss.NewStyle().
        Foreground(lipgloss.Color(t.Colors.Accent.Orange)).
        Bold(true)
}
```

### Use semantic colors

Your colors.json has semantic meanings - use them:

```go
// ✅ Good - semantic meaning
theme.SuccessStyle()  // For success messages
theme.ErrorStyle()    // For errors

// ❌ Bad - no semantic meaning
theme.GreenStyle()    // What does green mean here?
```

## Integration with Niri

Your niri keybinding already works:

```kdl
// Super+N launches with your theme
bind "Mod+N" { spawn "/home/daphen/personal/notes-cli/notes-cli"; }
```

To switch themes, you could:

1. **Set THEME in the spawn script:**
   ```bash
   #!/bin/bash
   # ~/.config/niri/scripts/spawn-notes
   THEME=dark wezterm start -- /home/daphen/personal/notes-cli/notes-cli
   ```

2. **Or set globally in fish config:**
   ```fish
   # ~/.config/fish/config.fish
   set -gx THEME dark
   ```

## Summary

**For Go TUIs:**
1. Copy `internal/theme/` folder
2. Call `theme.Load()`
3. Use `.HeaderStyle()`, `.SuccessStyle()`, etc.
4. Set `THEME=light` or `THEME=dark`
5. That's it!

**No templates. No generation. Just works.** 🎨
