/**
 * Stress test messagerie: N requêtes concurrentes POST /api/messages/send.
 * Usage: node scripts/stress-messages.mjs [concurrency] [total]
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   STRESS_EMAIL, STRESS_PASSWORD (compte existant)
 *   STRESS_CONVERSATION_ID (UUID d’une conversation où l’utilisateur est buyer ou seller)
 *   STRESS_BASE_URL (défaut: http://localhost:3000)
 *   STRESS_CONCURRENCY (défaut: 10), STRESS_TOTAL (défaut: 50)
 *
 * Prérequis: l’app Next doit tourner (npm run dev) et STRESS_CONVERSATION_ID
 * doit être une conversation réelle où STRESS_EMAIL a accès.
 * En dev, l’API accepte Authorization: Bearer <access_token> pour ce script.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

if (
  process.env.NODE_ENV === "production" &&
  process.env.ALLOW_PROD_SCRIPTS !== "true"
) {
  console.error(
    "Refusing to run stress script in production without ALLOW_PROD_SCRIPTS=true"
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const baseUrl = (process.env.STRESS_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const concurrency = Math.min(
  parseInt(process.env.STRESS_CONCURRENCY || "10", 10),
  50
);
const total = Math.min(
  parseInt(process.env.STRESS_TOTAL || "50", 10),
  500
);
const stressEmail = process.env.STRESS_EMAIL;
const stressPassword = process.env.STRESS_PASSWORD;
const conversationId = process.env.STRESS_CONVERSATION_ID;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
  process.exit(1);
}

if (!stressEmail || !stressPassword) {
  console.error(
    "STRESS_EMAIL and STRESS_PASSWORD are required (use an existing account that has access to STRESS_CONVERSATION_ID)"
  );
  process.exit(1);
}

if (!conversationId) {
  console.error(
    "STRESS_CONVERSATION_ID is required (UUID of a conversation where the test user is buyer or seller)"
  );
  process.exit(1);
}

const supabase = createClient(url, key);

async function getAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({
    email: stressEmail,
    password: stressPassword,
  });
  if (error) {
    console.error("Sign-in failed:", error.message);
    process.exit(1);
  }
  if (!session?.access_token) {
    console.error("No session returned");
    process.exit(1);
  }
  return session.access_token;
}

async function sendMessage(accessToken, index) {
  const start = performance.now();
  const res = await fetch(`${baseUrl}/api/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      conversationId,
      content: `[stress #${index}] ${new Date().toISOString()}`,
    }),
  });
  const ms = performance.now() - start;
  const ok = res.ok;
  let errorMsg = null;
  if (!ok) {
    try {
      const data = await res.json();
      errorMsg = data.error || res.statusText;
    } catch {
      errorMsg = res.statusText;
    }
  }
  return { ms, ok, status: res.status, error: errorMsg };
}

async function runStress() {
  console.log("Signing in to get access token...");
  const accessToken = await getAccessToken();
  console.log(
    `Stress: ${total} POST /api/messages/send, concurrency ${concurrency}, conversation ${conversationId}`
  );

  const startAll = performance.now();
  const results = [];
  let index = 0;

  async function worker() {
    while (index < total) {
      const i = index++;
      if (i >= total) break;
      const r = await sendMessage(accessToken, i);
      results.push(r);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  const totalMs = performance.now() - startAll;

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const times = results.map((r) => r.ms).filter((m) => m > 0);
  const avg = times.length
    ? times.reduce((a, b) => a + b, 0) / times.length
    : 0;
  const sorted = [...times].sort((a, b) => a - b);
  const p99 =
    sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;

  console.log("Results:");
  console.log("  Total:", results.length, "| OK:", ok, "| Fail:", fail);
  console.log("  Total time (ms):", Math.round(totalMs));
  console.log(
    "  Avg latency (ms):",
    Math.round(avg),
    "| P99 (ms):",
    Math.round(p99)
  );
  if (fail > 0) {
    const errors = {};
    results
      .filter((r) => !r.ok)
      .forEach((r) => {
        const k = `${r.status}: ${r.error || "unknown"}`;
        errors[k] = (errors[k] || 0) + 1;
      });
    console.log("  Errors:", errors);
  }
}

runStress().catch((e) => {
  console.error(e);
  process.exit(1);
});
