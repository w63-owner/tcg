import { getRequiredEnvVar } from "@/lib/env";

export type OcrProviderResult = {
  rawText: string;
  structured: OcrStructuredOutput | null;
  provider: "openai";
  model: string;
};

export type OcrStructuredOutput = {
  name: string | null;
  hp: number | null;
  localId: string | null;
  printedTotal: string | null;
  releaseYear: number | null;
  language: "fr" | "en" | "jp" | null;
  illustrator: string | null;
  regulationMark: string | null;
  rarity: "Common" | "Uncommon" | "Rare" | "Double Rare" | "Secret Rare" | null;
  is_promo: boolean | null;
  is_secret: boolean | null;
  vintage_hint: "1st_edition" | "shadowless" | "unlimited" | null;
  finish: "holo" | "reverse" | "normal" | null;
  inferred_set_name: string | null;
};

const OPENAI_SYSTEM_PROMPT = `You are an expert Pokemon card identification system. Your sole task is to extract visual data from this card to allow for a strict database match. Do NOT guess or output any financial value. Respond ONLY with a valid JSON object. Do not include markdown formatting or conversational text. Use null if a field is absolutely not visible.

Required JSON keys:
- "name": Card name including any suffixes or prefixes (e.g., V, EX, GX, VMAX).
- "hp": Hit points (integer only, e.g., 150).
- "localId": The first part of the collector number before the slash (string, e.g., "11" from "11/108").
- "printedTotal": The second part of the collector number after the slash (string, e.g., "108").
- "releaseYear": Copyright year(s) at the bottom (integer, e.g., 2016).
- "language": Language code in lowercase (fr, en, jp).
- "illustrator": Name of the illustrator.
- "regulationMark": The single letter printed in a white box on modern cards (e.g., "D", "E", "F", "G"). null if vintage.
- "rarity": Translate the visual symbol to text: "Common", "Uncommon", "Rare", "Double Rare", or "Secret Rare". null if no symbol.
- "is_promo": Boolean. True ONLY if the card has a "Promo" black star symbol.
- "is_secret": Boolean. True if localId > printedTotal.
- "vintage_hint": "1st_edition", "shadowless", "unlimited", or null.
- "finish": Visually assess the foil pattern: "holo", "reverse", "normal", or null.
- "inferred_set_name": Your highest confidence guess for the exact set name.`;

function toBase64(file: File) {
  return file.arrayBuffer().then((buffer) => Buffer.from(buffer).toString("base64"));
}

function extractOutputText(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "output_text" in payload &&
    typeof (payload as { output_text?: unknown }).output_text === "string"
  ) {
    return (payload as { output_text: string }).output_text;
  }

  const output = (payload as { output?: unknown[] })?.output;
  if (!Array.isArray(output)) return "";

  const chunks: string[] = [];
  for (const item of output) {
    const content = (item as { content?: unknown[] })?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function parseStructuredJson(rawText: string): OcrStructuredOutput | null {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!cleaned) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  const toText = (value: unknown) => {
    const text = String(value ?? "").trim();
    return text || null;
  };
  const toInt = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : null;
  };
  const toBooleanOrNull = (value: unknown) =>
    typeof value === "boolean" ? value : value === null ? null : null;
  const toLanguage = (value: unknown) => {
    const text = String(value ?? "").trim().toLowerCase();
    if (text === "fr" || text === "en" || text === "jp") return text;
    return null;
  };
  const toRarity = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (["Common", "Uncommon", "Rare", "Double Rare", "Secret Rare"].includes(text)) {
      return text as OcrStructuredOutput["rarity"];
    }
    return null;
  };
  const toVintage = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text === "1st_edition" || text === "shadowless" || text === "unlimited") return text;
    return null;
  };
  const toFinish = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text === "holo" || text === "reverse" || text === "normal") return text;
    return null;
  };

  return {
    name: toText(row.name),
    hp: toInt(row.hp),
    localId: toText(row.localId),
    printedTotal: toText(row.printedTotal),
    releaseYear: toInt(row.releaseYear),
    language: toLanguage(row.language),
    illustrator: toText(row.illustrator),
    regulationMark: toText(row.regulationMark),
    rarity: toRarity(row.rarity),
    is_promo: toBooleanOrNull(row.is_promo),
    is_secret: toBooleanOrNull(row.is_secret),
    vintage_hint: toVintage(row.vintage_hint),
    finish: toFinish(row.finish),
    inferred_set_name: toText(row.inferred_set_name),
  };
}

export async function detectCardTextFromImage(file: File): Promise<OcrProviderResult> {
  const apiKey = getRequiredEnvVar("OPENAI_API_KEY");
  const model = process.env.OCR_OPENAI_MODEL?.trim() || "gpt-4o";
  const mimeType = file.type?.trim() || "image/jpeg";
  const base64Image = await toBase64(file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_output_tokens: 350,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: OPENAI_SYSTEM_PROMPT,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: `data:${mimeType};base64,${base64Image}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OCR provider request failed (${response.status}): ${body.slice(0, 280)}`);
    }

    const payload = (await response.json()) as unknown;
    const rawText = extractOutputText(payload);
    if (!rawText) {
      throw new Error("OCR provider returned empty text");
    }
    const structured = parseStructuredJson(rawText);

    return {
      rawText,
      structured,
      provider: "openai",
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

