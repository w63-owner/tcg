import { getRequiredEnvVar } from "@/lib/env";

export type OcrProviderResult = {
  rawText: string;
  provider: "openai";
  model: string;
};

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

export async function detectCardTextFromImage(file: File): Promise<OcrProviderResult> {
  const apiKey = getRequiredEnvVar("OPENAI_API_KEY");
  const model = process.env.OCR_OPENAI_MODEL?.trim() || "gpt-4.1-mini";
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
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "You are an expert Pokemon card identification system. Your sole task is to extract visual data from this card to allow for a strict database match. Do NOT guess or output any financial value. Respond ONLY with a valid JSON object. Do not include markdown formatting (like ```json) or conversational text. Use null if a field is absolutely not visible. Required JSON keys: - \"name\": Card name including any suffixes or prefixes (e.g., V, EX, GX, VMAX, Dark, Light, Team Rocket). - \"hp\": Hit points (number only). - \"collector_number\": The exact numbering on the card (e.g., \"11/108\", \"096/182\", or null if it is an early vintage set without numbers). - \"year\": Copyright year(s) at the bottom (extremely crucial to differentiate vintage from retro-reprints like Evolutions or Celebrations). - \"language\": Language code (FR, EN, JP). - \"rarity_symbol\": Visually identify the symbol bottom right or bottom left (star, double_star, diamond, circle, promo_star, or null). - \"set_symbol_description\": Briefly describe the expansion symbol to help disambiguate the set. - \"inferred_set\": Your highest confidence guess for the exact set name based strictly on the year, collector number, and symbol. - \"finish_type\": Visually assess the foil pattern (non-holo, standard_holo, reverse_holo, full_art, textured_foil, cracked_ice). - \"vintage_markers\": Specifically look for vintage indicators (1st_edition, shadowless, unlimited, or null).",
              },
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

    return {
      rawText,
      provider: "openai",
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

