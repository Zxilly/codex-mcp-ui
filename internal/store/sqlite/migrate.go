package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/pressly/goose/v3"

	"github.com/codex/codex-mcp-ui/internal/store/schema"
)

func runMigrations(db *sql.DB) error {
	goose.SetBaseFS(schema.FS)
	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("set dialect: %w", err)
	}
	if err := goose.Up(db, "."); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}
