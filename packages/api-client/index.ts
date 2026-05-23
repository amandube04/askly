import { createTRPCProxyClient, httpBatchLink } from "@repo/trpc/client";
import type { ServerRouter } from "@repo/trpc/client";

export function createApiClient(url: string): ReturnType<typeof createTRPCProxyClient<ServerRouter>> {
  return createTRPCProxyClient<ServerRouter>({
    links: [httpBatchLink({ url })],
  });
}
