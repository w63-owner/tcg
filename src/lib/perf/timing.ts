import { logInfo } from "@/lib/observability";

export type PerfMeasure = {
  label: string;
  durationMs: number;
};

export function startTimer() {
  const start = performance.now();
  return () => Math.max(0, performance.now() - start);
}

export function measure(label: string, fn: () => Promise<void>) {
  return async () => {
    const end = startTimer();
    await fn();
    return { label, durationMs: end() } satisfies PerfMeasure;
  };
}

export function toServerTimingHeader(entries: PerfMeasure[]) {
  return entries
    .map((entry) => `${entry.label};dur=${entry.durationMs.toFixed(1)}`)
    .join(", ");
}

export function logPerf(event: string, entries: PerfMeasure[], context?: Record<string, unknown>) {
  logInfo({
    event,
    context: {
      ...context,
      timings: entries.reduce<Record<string, number>>((acc, current) => {
        acc[current.label] = Number(current.durationMs.toFixed(1));
        return acc;
      }, {}),
    },
  });
}
