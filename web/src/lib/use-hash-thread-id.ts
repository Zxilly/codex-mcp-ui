import { useCallback, useEffect, useState } from "react"

const PREFIX = "#thread="

function readHash(): string | null {
  if (typeof window === "undefined")
    return null
  const raw = window.location.hash
  if (!raw.startsWith(PREFIX))
    return null
  const value = decodeURIComponent(raw.slice(PREFIX.length))
  return value || null
}

/**
 * Keeps the currently selected thread id mirrored in `location.hash` so deep
 * links and reloads restore context without persisting to localStorage.
 */
export function useHashThreadId(): [string | null, (next: string | null) => void] {
  const [value, setValue] = useState<string | null>(() => readHash())

  useEffect(() => {
    const onHashChange = () => setValue(readHash())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  const set = useCallback((next: string | null) => {
    if (typeof window === "undefined")
      return
    if (next) {
      window.location.hash = `${PREFIX}${encodeURIComponent(next)}`
    }
    else {
      history.replaceState(null, "", window.location.pathname + window.location.search)
    }
    setValue(next)
  }, [])

  return [value, set]
}
