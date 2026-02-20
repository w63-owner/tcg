type TcgdexAssetQuality = "low" | "high";
type TcgdexAssetExt = "webp" | "png" | "jpg";

const IMAGE_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"];

export function normalizeTcgdexAssetUrl(
  rawUrl: string | null | undefined,
  quality: TcgdexAssetQuality = "high",
  ext: TcgdexAssetExt = "webp",
): string | null {
  const input = String(rawUrl ?? "").trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  if (IMAGE_EXTENSIONS.some((suffix) => lower.endsWith(suffix))) {
    return input;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }

  if (!/assets\.tcgdex\.net$/i.test(url.hostname)) {
    return input;
  }

  const cleanPath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${cleanPath}/${quality}.${ext}`;
  return url.toString();
}
