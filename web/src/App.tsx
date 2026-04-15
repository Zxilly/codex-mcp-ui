import { QueryClientProvider } from "@tanstack/react-query"
import { ErrorBoundary } from "@/components/error-boundary"
import { LiveSessionWorkbench } from "@/components/workbench/session-workbench"
import { queryClient } from "@/lib/query-client"

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LiveSessionWorkbench />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
