const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function getRequiredEnvVar(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getRequiredPublicEnvVar(name: (typeof REQUIRED_PUBLIC_ENV)[number]): string {
  // In client bundles, Next.js only inlines statically-referenced NEXT_PUBLIC_* vars.
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabasePublicEnv() {
  const [url, anonKey] = REQUIRED_PUBLIC_ENV.map(getRequiredPublicEnvVar);
  return { url, anonKey };
}

export function getSiteUrl() {
  let url: string;
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    url = explicit;
  } else {
    const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (vercelProduction) {
      url = vercelProduction.startsWith("http")
        ? vercelProduction
        : `https://${vercelProduction}`;
    } else {
      const vercelPreview = process.env.VERCEL_URL?.trim();
      if (vercelPreview) {
        url = vercelPreview.startsWith("http")
          ? vercelPreview
          : `https://${vercelPreview}`;
      } else {
        return "http://localhost:3000";
      }
    }
  }
  // Corriger la typo courante vercel.ap -> vercel.app
  if (url.includes("vercel.ap/") || url.endsWith("vercel.ap")) {
    url = url.replace(/vercel\.ap(\/|$)/g, "vercel.app$1");
  }
  return url;
}
