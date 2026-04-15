import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  buildReadonlyRuntimeConfig,
  toThreadMessages,
  useReadonlyAssistantRuntime,
} from "./readonly-assistant-runtime"

describe("buildReadonlyRuntimeConfig", () => {
  it("disables readonly mutation affordances and omits send from the runtime contract", () => {
    const config = buildReadonlyRuntimeConfig([])

    expect(config.messages).toEqual([])
    expect(config.isRunning).toBe(false)
    expect("onNew" in config).toBe(false)
    expect(config).not.toHaveProperty("onNew")
    expect(config.affordances).toMatchObject({
      composer: false,
      edit: false,
      reload: false,
      branchSwitch: false,
      attachments: false,
    })
    expect(config.capabilities).toMatchObject({
      edit: false,
      reload: false,
      switchToBranch: false,
      attachments: false,
    })
    expect(config.adapters?.attachments).toBeUndefined()
  })

  it("maps readonly messages into assistant-ui thread messages", () => {
    const messages = toThreadMessages([
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: "2026-04-13T10:00:00Z",
        parts: [
          { type: "text", text: "Rendered markdown", eventIds: ["evt-text"] },
          { type: "reasoning", text: "Internal notes", variant: "reasoning", eventIds: ["evt-think"] },
          { type: "tool", toolKind: "web_search", title: "Web search", status: "running", eventIds: ["evt-tool"] },
        ],
      },
      {
        id: "user-1",
        role: "user",
        createdAt: "2026-04-13T10:00:01Z",
        parts: [
          { type: "text", text: "Literal prompt", eventIds: ["evt-user"] },
        ],
      },
    ])

    expect(messages[0]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      createdAt: new Date("2026-04-13T10:00:00Z"),
      status: { type: "complete", reason: "stop" },
      metadata: {
        custom: { readonly: true },
      },
      content: [
        { type: "text", text: "Rendered markdown" },
        { type: "reasoning", text: "Internal notes" },
        {
          type: "data-codex-tool",
          data: { type: "tool", toolKind: "web_search", title: "Web search", status: "running", eventIds: ["evt-tool"] },
        },
      ],
    })
    expect(messages[1]).toMatchObject({
      id: "user-1",
      role: "user",
      attachments: [],
      metadata: {
        custom: { readonly: true },
      },
      content: [{ type: "text", text: "Literal prompt" }],
    })
  })

  it("returns a readonly runtime surface from the hook", async () => {
    const { result } = renderHook(() =>
      useReadonlyAssistantRuntime([
        {
          id: "assistant-1",
          role: "assistant",
          createdAt: "2026-04-13T10:00:00Z",
          parts: [{ type: "text", text: "Readonly response", eventIds: ["evt-1"] }],
        },
      ]),
    )

    const runtime = result.current
    expect(runtime.thread.getState()).toMatchObject({
      isDisabled: true,
      capabilities: {
        edit: false,
        reload: false,
        cancel: false,
        attachments: false,
        switchToBranch: false,
      },
    })
    expect(() => runtime.thread.append("blocked")).toThrow(/readonly/i)
    expect(() => runtime.thread.startRun({ parentId: null })).toThrow(/readonly/i)
    expect(() => runtime.thread.composer.setText("blocked")).toThrow(/readonly/i)
    expect(() => runtime.thread.composer.send()).toThrow(/readonly/i)
    expect(() => runtime.switchToNewThread()).toThrow(/readonly/i)
    expect(() => runtime.switchToThread("other-thread")).toThrow(/readonly/i)
    await expect(runtime.threads.switchToNewThread()).rejects.toThrow(/readonly/i)
    await expect(runtime.threadList.switchToThread("other-thread")).rejects.toThrow(/readonly/i)

    const message = runtime.thread.getMessageByIndex(0)
    expect(() => message.reload()).toThrow(/readonly/i)
    expect(() => message.switchToBranch({ position: "next" })).toThrow(/readonly/i)
    expect(() => message.composer.setText("blocked")).toThrow(/readonly/i)
    expect(() => message.composer.send()).toThrow(/readonly/i)

    const threadItem = runtime.threads.mainItem
    await expect(threadItem.rename("Renamed")).rejects.toThrow(/readonly/i)
    await expect(threadItem.archive()).rejects.toThrow(/readonly/i)
  })

  it("rejects the full readonly mutation surface across runtime wrappers", async () => {
    const { result } = renderHook(() =>
      useReadonlyAssistantRuntime([
        {
          id: "assistant-1",
          role: "assistant",
          createdAt: "2026-04-13T10:00:00Z",
          parts: [
            { type: "text", text: "Readonly response", eventIds: ["evt-1"] },
            { type: "tool", toolKind: "web_search", title: "Web search", status: "complete", eventIds: ["evt-2"] },
          ],
        },
      ]),
    )

    const runtime = result.current
    const thread = runtime.thread as unknown as Record<string, (...args: unknown[]) => unknown> & {
      composer: Record<string, (...args: unknown[]) => unknown>
      getMessageByIndex: (index: number) => Record<string, (...args: unknown[]) => unknown> & {
        composer: Record<string, (...args: unknown[]) => unknown>
        getMessagePartByIndex: (index: number) => Record<string, (...args: unknown[]) => unknown>
      }
    }
    const message = thread.getMessageByIndex(0)
    const part = message.getMessagePartByIndex(1)
    const composer = thread.composer as unknown as Record<string, unknown>
    const messageComposer = message.composer as unknown as Record<string, unknown>
    const syncCalls: Array<() => unknown> = [
      () => (runtime as unknown as { reset: (...args: unknown[]) => unknown }).reset(),
      () => thread.resumeRun(),
      () => thread.unstable_resumeRun(),
      () => thread.importExternalState({}),
      () => thread.unstable_loadExternalState({}),
      () => thread.cancelRun(),
      () => thread.import({}),
      () => thread.reset(),
      () => thread.stopSpeaking(),
      () => thread.connectVoice(),
      () => thread.disconnectVoice(),
      () => thread.muteVoice(),
      () => thread.unmuteVoice(),
      () => thread.composer.setRole("user" as never),
      () => thread.composer.setRunConfig({} as never),
      () => thread.composer.cancel(),
      () => thread.composer.startDictation(),
      () => thread.composer.stopDictation(),
      () => thread.composer.setQuote({} as never),
      () => message.speak(),
      () => message.stopSpeaking(),
      () => message.submitFeedback({} as never),
      () => part.addToolResult({} as never),
      () => part.resumeToolCall({}),
    ]

    if (typeof composer.beginEdit === "function")
      syncCalls.push(() => (composer.beginEdit as () => unknown)())
    if (typeof messageComposer.beginEdit === "function")
      syncCalls.push(() => (messageComposer.beginEdit as () => unknown)())

    for (const call of syncCalls)
      expect(call).toThrow(/readonly/i)

    const asyncCalls = [
      runtime.threadList.mainItem.initialize(),
      runtime.threadList.mainItem.generateTitle(),
      runtime.threadList.mainItem.switchTo(),
      runtime.threadList.mainItem.unarchive(),
      runtime.threadList.mainItem.delete(),
      Promise.resolve().then(() => runtime.threadList.mainItem.detach()),
      thread.composer.addAttachment(new File(["hello"], "note.txt", { type: "text/plain" })),
      thread.composer.reset(),
      thread.composer.clearAttachments(),
    ]

    for (const call of asyncCalls)
      await expect(call).rejects.toThrow(/readonly/i)
  })
})
