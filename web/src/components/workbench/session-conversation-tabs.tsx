import type { ReactNode } from "react"
import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface SessionConversationTabsProps {
  conversation: ReactNode
  rawEvents: ReactNode
  metadata: ReactNode
}

export function SessionConversationTabs({
  conversation,
  rawEvents,
  metadata,
}: SessionConversationTabsProps) {
  const [tab, setTab] = useState("conversation")

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-4">
        <TabsList>
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
          <TabsTrigger value="raw">Raw events</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent
        value="conversation"
        forceMount
        className="min-h-0 flex-1 overflow-auto px-4 pb-4"
      >
        {conversation}
      </TabsContent>
      <TabsContent value="raw" className="min-h-0 flex-1 px-4 pb-4">
        {rawEvents}
      </TabsContent>
      <TabsContent
        value="metadata"
        className="min-h-0 flex-1 overflow-auto px-4 pb-4"
      >
        {metadata}
      </TabsContent>
    </Tabs>
  )
}
