-- +goose Up
ALTER TABLE sessions ADD COLUMN title TEXT;

-- +goose Down
ALTER TABLE sessions DROP COLUMN title;
