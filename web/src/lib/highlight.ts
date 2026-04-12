import bash from "highlight.js/lib/languages/bash"
import diff from "highlight.js/lib/languages/diff"
import go from "highlight.js/lib/languages/go"
import json from "highlight.js/lib/languages/json"
import ts from "highlight.js/lib/languages/typescript"

// Register only the languages we expect to see in agent output and
// inspected payloads. Keeping this list small keeps the shipped bundle
// well under the cost of bundling all of highlight.js. rehype-highlight
// accepts this object directly via its `languages` option.
export const HIGHLIGHT_LANGUAGES = {
  json,
  bash,
  sh: bash,
  diff,
  go,
  typescript: ts,
  ts,
}
