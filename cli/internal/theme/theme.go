package theme

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/charmbracelet/lipgloss"
)

// 🔵 GO CONCEPT: Nested structs
// Go uses composition - structs within structs - to model hierarchical data

type ColorTheme struct {
	Background struct {
		Primary   string `json:"primary"`
		Secondary string `json:"secondary"`
		Selection string `json:"selection"`
	} `json:"background"`
	Foreground struct {
		Primary   string `json:"primary"`
		Secondary string `json:"secondary"`
		Muted     string `json:"muted"`
	} `json:"foreground"`
	Accent struct {
		Red    string `json:"red"`
		Orange string `json:"orange"`
		Yellow string `json:"yellow"`
		Green  string `json:"green"`
		Cyan   string `json:"cyan"`
		Blue   string `json:"blue"`
		Purple string `json:"purple"`
	} `json:"accent"`
}

type ThemeFile struct {
	Themes struct {
		Dark  ColorTheme `json:"dark"`
		Light ColorTheme `json:"light"`
	} `json:"themes"`
}

type Theme struct {
	Colors ColorTheme
	IsDark bool
}

// Load reads the theme from ~/.dotfiles/themes/colors.json
func Load() (*Theme, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return defaultTheme(), nil // Fallback to default
	}

	themePath := filepath.Join(home, ".dotfiles", "themes", "colors.json")
	data, err := os.ReadFile(themePath)
	if err != nil {
		return defaultTheme(), nil // Fallback to default
	}

	var themeFile ThemeFile
	if err := json.Unmarshal(data, &themeFile); err != nil {
		return defaultTheme(), nil // Fallback to default
	}

	// Detect dark/light mode
	// 🔵 GO CONCEPT: Environment variables
	// Check THEME env var or terminal background
	isDark := true
	if themeEnv := os.Getenv("THEME"); themeEnv == "light" {
		isDark = false
	}

	theme := &Theme{IsDark: isDark}
	if isDark {
		theme.Colors = themeFile.Themes.Dark
	} else {
		theme.Colors = themeFile.Themes.Light
	}

	return theme, nil
}

// defaultTheme returns a fallback theme if loading fails
func defaultTheme() *Theme {
	return &Theme{
		IsDark: true,
		Colors: ColorTheme{
			Background: struct {
				Primary   string `json:"primary"`
				Secondary string `json:"secondary"`
				Selection string `json:"selection"`
			}{
				Primary:   "#181818",
				Secondary: "#1B1B1B",
				Selection: "#282F38",
			},
			Foreground: struct {
				Primary   string `json:"primary"`
				Secondary string `json:"secondary"`
				Muted     string `json:"muted"`
			}{
				Primary:   "#EDEDED",
				Secondary: "#C3C8C6",
				Muted:     "#707B84",
			},
			Accent: struct {
				Red    string `json:"red"`
				Orange string `json:"orange"`
				Yellow string `json:"yellow"`
				Green  string `json:"green"`
				Cyan   string `json:"cyan"`
				Blue   string `json:"blue"`
				Purple string `json:"purple"`
			}{
				Blue:   "#CCD5E4",
				Green:  "#97B5A6",
				Cyan:   "#8A9AA6",
				Orange: "#FF570D",
				Red:    "#FF7B72",
			},
		},
	}
}

// Style helpers that use theme colors

func (t *Theme) HeaderStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color(t.Colors.Accent.Blue))
}

func (t *Theme) SearchLabelStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color(t.Colors.Accent.Blue)).
		Bold(true)
}

func (t *Theme) MutedStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color(t.Colors.Foreground.Muted)).
		Italic(true)
}

func (t *Theme) SelectedStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color(t.Colors.Foreground.Primary)).
		Background(lipgloss.Color(t.Colors.Background.Selection)).
		Bold(true)
}

func (t *Theme) NormalStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color(t.Colors.Foreground.Secondary))
}

func (t *Theme) SuccessStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color(t.Colors.Accent.Green))
}

func (t *Theme) ErrorStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color(t.Colors.Accent.Red)).
		Bold(true)
}

func (t *Theme) AccentStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color(t.Colors.Accent.Orange))
}

func (t *Theme) BorderStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		BorderForeground(lipgloss.Color(t.Colors.Accent.Blue))
}

func (t *Theme) ActiveBorderStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		BorderForeground(lipgloss.Color(t.Colors.Accent.Green))
}
