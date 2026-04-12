package sqlite

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// openDB opens the SQLite database at path with write-ahead logging and
// other pragmas suitable for a local write-heavy event store.
func openDB(path string) (*sql.DB, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(on)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return db, nil
}
