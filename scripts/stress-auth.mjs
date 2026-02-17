/**
 * Stress test auth: N requêtes concurrentes signIn (et optionnel signUp).
 * Usage: node scripts/stress-auth.mjs [concurrency] [total]
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * Optionnel: STRESS_EMAIL, STRESS_PASSWORD pour signIn (sinon crée un user de test).
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SCRIPTS !== "true") {
  console.error("Refusing to run stress script in production without ALLOW_PROD_SCRIPTS=true");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const concurrency = Math.min(parseInt(process.env.STRESS_CONCURRENCY || "10", 10), 50);
const total = Math.min(parseInt(process.env.STRESS_TOTAL || "50", 10), 500);
const stressEmail = process.env.STRESS_EMAIL || `stress-${Date.now()}@example.com`;
const stressPassword =
  process.env.STRESS_PASSWORD || `stress-${Math.random().toString(36).slice(2)}-A1!`;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function signIn(email, password) {
  const start = performance.now();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  const ms = performance.now() - start;
  return { ms, error: error?.message, ok: !error };
}

async function runStress() {
  let testEmail = stressEmail;
  let testPassword = stressPassword;

  if (process.env.STRESS_EMAIL && !process.env.STRESS_PASSWORD) {
    console.error("STRESS_PASSWORD must be set when STRESS_EMAIL is provided");
    process.exit(1);
  }

  if (!process.env.STRESS_EMAIL) {
    console.log("Creating one-time test user for signIn stress...");
    const { error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: { data: { username: "stress" } },
    });
    if (error && !error.message.includes("already registered")) {
      console.error("SignUp seed failed:", error.message);
      process.exit(1);
    }
  }

  console.log(`Stress: ${total} signIn, concurrency ${concurrency}`);
  const startAll = performance.now();
  const results = [];
  let index = 0;

  async function worker() {
    while (index < total) {
      const i = index++;
      if (i >= total) break;
      const r = await signIn(testEmail, testPassword);
      results.push(r);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  const totalMs = performance.now() - startAll;

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const times = results.map((r) => r.ms).filter((m) => m > 0);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const p99 = times.length ? times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)] : 0;

  console.log("Results:");
  console.log("  Total:", results.length, "| OK:", ok, "| Fail:", fail);
  console.log("  Total time (ms):", Math.round(totalMs));
  console.log("  Avg latency (ms):", Math.round(avg), "| P99 (ms):", Math.round(p99));
  if (fail > 0) {
    const errors = {};
    results.filter((r) => !r.ok).forEach((r) => { errors[r.error] = (errors[r.error] || 0) + 1; });
    console.log("  Errors:", errors);
  }
}

runStress().catch((e) => {
  console.error(e);
  process.exit(1);
});
