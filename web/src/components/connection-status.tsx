import { Badge } from "@/components/ui/badge"

export type ConnectionState = "connecting" | "live" | "disconnected"

interface Props {
  state: ConnectionState
}

const META: Record<ConnectionState, { label: string, variant: "default" | "secondary" | "destructive" }> = {
  connecting: { label: "Connecting…", variant: "secondary" },
  live: { label: "Live", variant: "default" },
  disconnected: { label: "Disconnected", variant: "destructive" },
}

export function ConnectionStatus({ state }: Props) {
  const meta = META[state]
  return (
    <Badge
      variant={meta.variant}
      aria-live="polite"
      aria-label={`SSE stream ${meta.label}`}
      className="gap-1.5"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          state === "live"
            ? "animate-pulse bg-green-500"
            : state === "connecting"
              ? "bg-amber-500"
              : "bg-red-500"
        }`}
      />
      {meta.label}
    </Badge>
  )
}
