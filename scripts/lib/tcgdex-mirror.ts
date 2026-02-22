export type DbLang = "fr" | "en" | "jp";

export function resolveLanguageConfig() {
  const raw = String(process.env.TCGDEX_SEED_LANG || "fr").trim().toLowerCase();
  if (!["fr", "en", "jp", "ja"].includes(raw)) {
    throw new Error(`Unsupported TCGDEX_SEED_LANG '${raw}'. Use one of: fr, en, jp`);
  }
  const apiLang = raw === "jp" ? "ja" : raw;
  const dbLang = (raw === "ja" ? "jp" : raw) as DbLang;
  return { raw, apiLang, dbLang };
}

export function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function toInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

export function toDateOnly(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

export function* inBatches<T>(items: T[], size: number) {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonWithRetry<T>(url: string, attempts = 3): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "tcg-web-seed/1.0",
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status} on ${url}: ${text.slice(0, 240)}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Retry ${attempt}/${attempts - 1} for ${url} (${message})`);
        await sleep(350 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}
