import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncate(s: string, max = 400): string {
  if (!s)
    return ""
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export function prettyPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2)
  }
  catch {
    return String(payload)
  }
}

export function compactPayloadPreview(payload: unknown, max = 120): string {
  let s: string
  try {
    s = typeof payload === "string" ? payload : JSON.stringify(payload)
  }
  catch {
    s = String(payload)
  }
  return truncate(s, max)
}
