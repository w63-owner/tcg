import { spawn } from "node:child_process";

const languages = ["fr", "en", "jp"] as const;
const scripts = ["seed-tcgdex-series.ts", "seed-tcgdex-sets.ts", "seed-tcgdex-cards.ts"] as const;

function runScript(script: string, lang: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      ["ts-node", "--compiler-options", "{\"module\":\"commonjs\"}", `scripts/${script}`],
      {
        stdio: "inherit",
        env: { ...process.env, TCGDEX_SEED_LANG: lang },
      },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed for ${lang} (exit=${code ?? "null"})`));
    });
  });
}

async function run() {
  for (const lang of languages) {
    console.log(`\n=== Seeding language ${lang.toUpperCase()} ===`);
    for (const script of scripts) {
      await runScript(script, lang);
    }
  }
  console.log("\nFull TCGdex seed completed for FR+EN+JP.");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
