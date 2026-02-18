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
                  "Extract visible Pokemon card information from this photo for strict catalog matching. Return plain text only and include if visible: name (with suffix like V/EX/GX/VMAX), HP/PV, collector number, set symbol/code, language (FR/EN/JP), rarity, rarity symbol details (circle/diamond/star, star count, black/silver/gold/rainbow if visible), finish (non-holo/holo/reverse/full art/textured/cosmos/cracked ice), regulation mark, promo markers, vintage markers (1st edition/shadowless/unlimited), illustrator, and simple condition hints.",
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

