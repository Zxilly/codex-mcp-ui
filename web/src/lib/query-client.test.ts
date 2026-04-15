import { describe, expect, it } from "vitest"
import { queryClient } from "./query-client"

describe("queryClient", () => {
  it("configures the shared query defaults for the workbench", () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    })
  })
})
