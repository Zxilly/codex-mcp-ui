package web

import (
	"embed"
	"io/fs"
)

//go:embed dist dist/*
var Dist embed.FS

// DistFS returns the embedded dist directory rooted at its top level so that
// assets are served from the path "index.html" rather than "dist/index.html".
func DistFS() (fs.FS, error) {
	return fs.Sub(Dist, "dist")
}
