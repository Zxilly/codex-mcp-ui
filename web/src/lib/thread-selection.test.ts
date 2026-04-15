import { describe, expect, it } from "vitest"
import type { ClientSource, Session } from "./types"
import { resolveThreadSelection } from "./thread-selection"

const sources: ClientSource[] = [
  {
    source_key: "source-a",
    client_name: "Claude",
    pid: 1,
    first_seen: "",
    last_seen: "",
    session_count: 2,
  },
  {
    source_key: "source-b",
    client_name: "Codex",
    pid: 2,
    first_seen: "",
    last_seen: "",
    session_count: 1,
  },
]

const sessionsBySource: Record<string, Session[]> = {
  "source-a": [
    { thread_id: "thread-a-1", source_key: "source-a", first_seen: "", last_seen: "" },
    { thread_id: "thread-a-2", source_key: "source-a", first_seen: "", last_seen: "" },
  ],
  "source-b": [
    { thread_id: "thread-b-1", source_key: "source-b", first_seen: "", last_seen: "" },
  ],
}

describe("resolveThreadSelection", () => {
  it("keeps a valid hash thread id", () => {
    expect(
      resolveThreadSelection({
        hashThreadId: "thread-b-1",
        sources,
        sessionsBySource,
      }),
    ).toEqual({
      threadId: "thread-b-1",
      shouldWriteHash: false,
    })
  })

  it("falls back from a stale hash to the first available session in source order", () => {
    expect(
      resolveThreadSelection({
        hashThreadId: "thread-missing",
        sources,
        sessionsBySource,
      }),
    ).toEqual({
      threadId: "thread-a-1",
      shouldWriteHash: true,
    })
  })
})
