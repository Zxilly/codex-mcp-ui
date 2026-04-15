import type {
  AssistantRuntime,
  AttachmentRuntime,
  ComposerRuntime,
  ExternalStoreAdapter,
  MessagePartRuntime,
  MessageRuntime,
  ThreadListItemRuntime,
  ThreadListRuntime,
  ThreadRuntime,
  ThreadMessageLike,
} from "@assistant-ui/react"
import { useExternalStoreRuntime } from "@assistant-ui/react"
import { useMemo } from "react"
import type {
  ReadonlyAssistantMessage,
  ReadonlyAssistantPart,
} from "./assistant-projection"

export const READONLY_ASSISTANT_AFFORDANCES = {
  composer: false,
  edit: false,
  reload: false,
  branchSwitch: false,
  attachments: false,
} as const

type ReadonlyRuntimeCapabilities = {
  edit: false
  reload: false
  switchToBranch: false
  attachments: false
}

interface ReadonlyAssistantRuntimeConfig extends ExternalStoreAdapter<ThreadMessageLike> {
  affordances: typeof READONLY_ASSISTANT_AFFORDANCES
  capabilities: ReadonlyRuntimeCapabilities
}

export type ReadonlyAssistantRuntimeContract = Omit<
  ReadonlyAssistantRuntimeConfig,
  "onNew"
> & {
  onNew?: undefined
}

export function buildReadonlyRuntimeConfig(
  messages: readonly ReadonlyAssistantMessage[],
): ReadonlyAssistantRuntimeContract {
  return {
    messages: toThreadMessages(messages),
    isRunning: false,
    convertMessage: message => message,
    affordances: READONLY_ASSISTANT_AFFORDANCES,
    capabilities: {
      edit: false,
      reload: false,
      switchToBranch: false,
      attachments: false,
    },
  }
}

export function useReadonlyAssistantRuntime(
  messages: readonly ReadonlyAssistantMessage[],
) {
  const config = useMemo(
    () => buildReadonlyRuntimeConfig(messages),
    [messages],
  )
  const runtime = useExternalStoreRuntime(
    config as unknown as ExternalStoreAdapter<ThreadMessageLike>,
  )
  return useMemo(() => createReadonlyRuntime(runtime), [runtime])
}

export function toThreadMessages(
  messages: readonly ReadonlyAssistantMessage[],
): readonly ThreadMessageLike[] {
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    createdAt: new Date(message.createdAt),
    content: message.parts.map(part => toThreadMessagePart(part)),
    ...(message.role === "assistant"
      ? {
          status: { type: "complete", reason: "stop" } as const,
          metadata: {
            unstable_state: null,
            unstable_annotations: [],
            unstable_data: [],
            steps: [],
            custom: { readonly: true },
          },
        }
      : {
          attachments: [],
          metadata: {
            custom: { readonly: true },
          },
        }),
  }))
}

function toThreadMessagePart(part: ReadonlyAssistantPart) {
  switch (part.type) {
    case "text":
      return {
        type: "text" as const,
        text: part.text,
      }
    case "reasoning":
      return {
        type: "reasoning" as const,
        text: part.text,
      }
    default:
      return {
        type: `data-codex-${part.type}` as const,
        data: part,
      }
  }
}

function createReadonlyRuntime(runtime: AssistantRuntime): AssistantRuntime {
  const thread = createReadonlyThread(runtime.thread)
  const threads = createReadonlyThreadList(runtime.threads)
  return {
    get threads() {
      return threads
    },
    get thread() {
      return thread
    },
    get threadList() {
      return threads
    },
    switchToNewThread: () => {
      throwReadonlyMutation("runtime.switchToNewThread")
    },
    switchToThread: () => {
      throwReadonlyMutation("runtime.switchToThread")
    },
    registerModelContextProvider: runtime.registerModelContextProvider.bind(runtime),
    registerModelConfigProvider: runtime.registerModelConfigProvider.bind(runtime),
    reset: () => {
      throwReadonlyMutation("runtime.reset")
    },
  }
}

function createReadonlyThreadList(threadList: ThreadListRuntime): ThreadListRuntime {
  return {
    getState: threadList.getState.bind(threadList),
    subscribe: threadList.subscribe.bind(threadList),
    get main() {
      return createReadonlyThread(threadList.main)
    },
    getById: threadId => createReadonlyThread(threadList.getById(threadId)),
    get mainItem() {
      return createReadonlyThreadListItem(threadList.mainItem)
    },
    getItemById: threadId => createReadonlyThreadListItem(threadList.getItemById(threadId)),
    getItemByIndex: idx => createReadonlyThreadListItem(threadList.getItemByIndex(idx)),
    getArchivedItemByIndex: idx => createReadonlyThreadListItem(threadList.getArchivedItemByIndex(idx)),
    switchToThread: async () => {
      throwReadonlyMutation("threadList.switchToThread")
    },
    switchToNewThread: async () => {
      throwReadonlyMutation("threadList.switchToNewThread")
    },
    getLoadThreadsPromise: threadList.getLoadThreadsPromise.bind(threadList),
  }
}

function createReadonlyThreadListItem(item: ThreadListItemRuntime): ThreadListItemRuntime {
  return {
    path: item.path,
    getState: item.getState.bind(item),
    initialize: async () => {
      throwReadonlyMutation("threadListItem.initialize")
    },
    generateTitle: async () => {
      throwReadonlyMutation("threadListItem.generateTitle")
    },
    switchTo: async () => {
      throwReadonlyMutation("threadListItem.switchTo")
    },
    rename: async () => {
      throwReadonlyMutation("threadListItem.rename")
    },
    archive: async () => {
      throwReadonlyMutation("threadListItem.archive")
    },
    unarchive: async () => {
      throwReadonlyMutation("threadListItem.unarchive")
    },
    delete: async () => {
      throwReadonlyMutation("threadListItem.delete")
    },
    detach: () => {
      throwReadonlyMutation("threadListItem.detach")
    },
    subscribe: item.subscribe.bind(item),
    unstable_on: item.unstable_on.bind(item),
    __internal_getRuntime: () => createReadonlyThreadListItem(item),
  }
}

function createReadonlyThread(thread: ThreadRuntime): ThreadRuntime {
  const composer = createReadonlyComposer(thread.composer)
  return {
    path: thread.path,
    composer,
    getState: () => {
      const state = thread.getState()
      return {
        ...state,
        isDisabled: true,
        capabilities: {
          ...state.capabilities,
          edit: false,
          reload: false,
          cancel: false,
          speech: false,
          dictation: false,
          voice: false,
          attachments: false,
          feedback: false,
          switchToBranch: false,
          switchBranchDuringRun: false,
          unstable_copy: false,
          queue: false,
        },
      }
    },
    append: () => {
      throwReadonlyMutation("thread.append")
    },
    startRun: () => {
      throwReadonlyMutation("thread.startRun")
    },
    resumeRun: () => {
      throwReadonlyMutation("thread.resumeRun")
    },
    unstable_resumeRun: () => {
      throwReadonlyMutation("thread.unstable_resumeRun")
    },
    exportExternalState: thread.exportExternalState.bind(thread),
    importExternalState: () => {
      throwReadonlyMutation("thread.importExternalState")
    },
    unstable_loadExternalState: () => {
      throwReadonlyMutation("thread.unstable_loadExternalState")
    },
    subscribe: thread.subscribe.bind(thread),
    cancelRun: () => {
      throwReadonlyMutation("thread.cancelRun")
    },
    getModelContext: thread.getModelContext.bind(thread),
    getModelConfig: thread.getModelConfig.bind(thread),
    export: thread.export.bind(thread),
    import: () => {
      throwReadonlyMutation("thread.import")
    },
    reset: () => {
      throwReadonlyMutation("thread.reset")
    },
    getMessageByIndex: idx => createReadonlyMessage(thread.getMessageByIndex(idx)),
    getMessageById: messageId => createReadonlyMessage(thread.getMessageById(messageId)),
    stopSpeaking: () => {
      throwReadonlyMutation("thread.stopSpeaking")
    },
    connectVoice: () => {
      throwReadonlyMutation("thread.connectVoice")
    },
    disconnectVoice: () => {
      throwReadonlyMutation("thread.disconnectVoice")
    },
    getVoiceVolume: thread.getVoiceVolume.bind(thread),
    subscribeVoiceVolume: thread.subscribeVoiceVolume.bind(thread),
    muteVoice: () => {
      throwReadonlyMutation("thread.muteVoice")
    },
    unmuteVoice: () => {
      throwReadonlyMutation("thread.unmuteVoice")
    },
    unstable_on: thread.unstable_on.bind(thread),
  }
}

function createReadonlyMessage(message: MessageRuntime): MessageRuntime {
  return {
    path: message.path,
    composer: createReadonlyComposer(message.composer),
    getState: message.getState.bind(message),
    reload: () => {
      throwReadonlyMutation("message.reload")
    },
    speak: () => {
      throwReadonlyMutation("message.speak")
    },
    stopSpeaking: () => {
      throwReadonlyMutation("message.stopSpeaking")
    },
    submitFeedback: () => {
      throwReadonlyMutation("message.submitFeedback")
    },
    switchToBranch: () => {
      throwReadonlyMutation("message.switchToBranch")
    },
    unstable_getCopyText: message.unstable_getCopyText.bind(message),
    subscribe: message.subscribe.bind(message),
    getMessagePartByIndex: idx => createReadonlyPart(message.getMessagePartByIndex(idx)),
    getMessagePartByToolCallId: toolCallId => createReadonlyPart(message.getMessagePartByToolCallId(toolCallId)),
    getAttachmentByIndex: idx => createReadonlyAttachment(message.getAttachmentByIndex(idx)),
  }
}

function createReadonlyComposer<T extends ComposerRuntime>(composer: T): T {
  const baseComposer = {
    path: composer.path,
    type: composer.type,
    getState: () => ({
      ...composer.getState(),
      canCancel: false,
    }),
    addAttachment: () => rejectReadonlyMutation("composer.addAttachment"),
    setText: () => {
      throwReadonlyMutation("composer.setText")
    },
    setRole: () => {
      throwReadonlyMutation("composer.setRole")
    },
    setRunConfig: () => {
      throwReadonlyMutation("composer.setRunConfig")
    },
    reset: () => rejectReadonlyMutation("composer.reset"),
    clearAttachments: () => rejectReadonlyMutation("composer.clearAttachments"),
    send: () => {
      throwReadonlyMutation("composer.send")
    },
    cancel: () => {
      throwReadonlyMutation("composer.cancel")
    },
    subscribe: composer.subscribe.bind(composer),
    getAttachmentByIndex: (idx: number) => createReadonlyAttachment(composer.getAttachmentByIndex(idx)),
    startDictation: () => {
      throwReadonlyMutation("composer.startDictation")
    },
    stopDictation: () => {
      throwReadonlyMutation("composer.stopDictation")
    },
    setQuote: () => {
      throwReadonlyMutation("composer.setQuote")
    },
    unstable_on: composer.unstable_on.bind(composer),
  }

  if ("beginEdit" in composer && typeof composer.beginEdit === "function") {
    return {
      ...baseComposer,
      beginEdit: () => {
        throwReadonlyMutation("composer.beginEdit")
      },
    } as unknown as T
  }

  return baseComposer as unknown as T
}

function createReadonlyPart(part: MessagePartRuntime): MessagePartRuntime {
  return {
    path: part.path,
    getState: part.getState.bind(part),
    subscribe: part.subscribe.bind(part),
    addToolResult: () => {
      throwReadonlyMutation("messagePart.addToolResult")
    },
    resumeToolCall: () => {
      throwReadonlyMutation("messagePart.resumeToolCall")
    },
  }
}

function createReadonlyAttachment<T extends AttachmentRuntime>(attachment: T): T {
  return {
    path: attachment.path,
    source: attachment.source,
    getState: attachment.getState.bind(attachment),
    subscribe: attachment.subscribe.bind(attachment),
    remove: () => rejectReadonlyMutation("attachment.remove"),
  } as unknown as T
}

function createReadonlyMutationError(operation: string): Error {
  return new Error(`Readonly assistant runtime does not allow ${operation}.`)
}

function throwReadonlyMutation(operation: string): never {
  throw createReadonlyMutationError(operation)
}

function rejectReadonlyMutation(operation: string): Promise<never> {
  return Promise.reject(createReadonlyMutationError(operation))
}
