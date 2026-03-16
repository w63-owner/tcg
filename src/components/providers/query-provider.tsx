"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/** StaleTime for reference data (e.g. TCGDex sets list). Use in useQuery options: staleTime: REFERENCE_DATA_STALE_TIME_MS */
export const REFERENCE_DATA_STALE_TIME_MS = 24 * 60 * 60 * 1000; // 24 hours

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000, // 1 minute — reduces API spam on high traffic
            refetchOnWindowFocus: false, // avoid refetch on tab focus in high-traffic apps
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
