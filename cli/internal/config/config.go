package config

// 🔵 GO CONCEPT: Package declaration
// Every Go file starts with a package declaration. Files in the same directory
// must share the same package name. The 'internal' directory is special in Go -
// code inside it can only be imported by code within the parent module.

import (
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

// 🔵 GO CONCEPT: Struct definition
// Go uses structs (not classes) to define data structures.
// Fields that start with uppercase are "exported" (public), lowercase are private.
// The `toml:"..."` are struct tags - metadata used by the toml parser.
type Config struct {
	APIURL       string `toml:"api_url"`
	AuthPassword string `toml:"auth_password"`
	NotesDir     string `toml:"notes_dir"`
	ClientID     string `toml:"client_id"`
}

// 🔵 GO CONCEPT: Error handling
// Go doesn't have exceptions. Functions return errors as values.
// The pattern is: (result, error) where error is nil on success.
// This forces you to handle errors explicitly at each call site.

// Load reads the config file and returns a Config struct.
// It demonstrates Go's explicit error handling pattern.
func Load(configPath string) (*Config, error) {
	// 🔵 GO CONCEPT: Pointers
	// The * means we return a pointer to Config, not a copy.
	// Pointers are like references - they let us modify the original data
	// and avoid copying large structs around.

	var cfg Config
	// 🔵 GO CONCEPT: Variable declaration
	// 'var cfg Config' declares a variable of type Config.
	// Go automatically initializes it to the "zero value" (empty strings, 0 for numbers, etc.)

	// Read the file
	data, err := os.ReadFile(configPath)
	// 🔵 GO CONCEPT: Multiple return values
	// := is shorthand for declaring and assigning. It infers the type.
	// Functions often return (value, error) - this is the Go way.

	if err != nil {
		// 🔵 GO CONCEPT: Error checking
		// nil is like null in other languages. Always check if err != nil.
		return nil, err
		// Returning nil for the Config pointer and the error
	}

	// Parse TOML into our struct
	if err := toml.Unmarshal(data, &cfg); err != nil {
		// 🔵 GO CONCEPT: The & operator
		// & gets the address of a variable (makes a pointer).
		// toml.Unmarshal needs a pointer so it can modify cfg.
		return nil, err
	}

	// Expand ~ in the notes directory path
	if cfg.NotesDir != "" && cfg.NotesDir[0] == '~' {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		cfg.NotesDir = filepath.Join(home, cfg.NotesDir[1:])
		// 🔵 GO CONCEPT: String slicing
		// cfg.NotesDir[1:] means "from index 1 to the end" (removes the ~)
	}

	return &cfg, nil
	// 🔵 GO CONCEPT: Returning a pointer
	// &cfg creates a pointer to our cfg variable and returns it.
	// The memory won't be deallocated - Go's garbage collector handles this.
}

// DefaultConfigPath returns the default location for the config file
func DefaultConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "notes-cli", "config.toml"), nil
}

// Example config file content
const ExampleConfig = `# Notes CLI Configuration
api_url = "http://localhost:3000"
auth_password = "your-password-here"
notes_dir = "~/personal/notes/storage"
client_id = "linux-cli"
`
