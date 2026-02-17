# TCG Marketplace (Next.js)

Marketplace C2C Pokemon (Next.js App Router + Supabase + Stripe).

## Prerequisites

- Node.js 20+
- npm
- Supabase project (URL + anon key + service role key)
- Stripe test key (optional for local checkout tests)

## Environment

Create `.env.local` from `.env.example` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (default local: `http://localhost:3000`)
- `STRIPE_SECRET_KEY` (for checkout flows)
- `STRIPE_WEBHOOK_SECRET` (for webhook validation)
- `OPENAI_API_KEY` (server-only, used by OCR endpoint)
- `OCR_OPENAI_MODEL` (optional, default: `gpt-4.1-mini`)
- `POKEMON_TCG_API_KEY` (optional, recommended for higher rate limits)
- `POKEMON_TCG_API_BASE_URL` (default: `https://api.pokemontcg.io/v2/cards`)
- `POKECADATA_API_KEY` (optional, for JP source when required)
- `POKECADATA_BASE_URL` (optional, enables JP source sync)
- `CATALOG_SYNC_SOURCES` (default: `pokemontcg,pokecadata`)
- `CATALOG_SYNC_PAGE_SIZE` (default: `250`)
- `CATALOG_SYNC_MAX_PAGES` (default: `200`, reduced in incremental mode)

OCR endpoint:

- `POST /api/ocr/card` expects a multipart form field `image`.
- The API key stays server-side only (never exposed in client bundle).

## Useful commands

```bash
npm run dev          # local dev (webpack mode)
npm run dev:turbo    # local dev (turbopack, optional)
npm run dev:reset    # stop stale dev processes + clear lock + restart
npm run lint
npm test
npm run build
```

## Seed and audit scripts

```bash
npm run seed:listings          # demo listings seed
npm run seed:listings:massive  # 120 demo listings
npm run seed:cards-catalog     # cards_ref exhaustive attrs + price guide import
npm run seed:cards-catalog:incremental  # lighter sync for regular refresh
npm run seed:price-guide       # pricing-only import from local JSON exports
npm run stress:auth            # auth stress test
npm run rls:audit              # RLS intrusion smoke checks
```

`cards_ref` now supports expert catalog attributes used by OCR and matching:

- identity: `name`, `set_id`, `tcg_id`, `card_number`, `hp`, `release_year`, `language`
- rarity/finish: `rarity`, `finish`, `is_secret`, `is_promo`, `vintage_hint`
- expert fields: `regulation_mark`, `illustrator`, `estimated_condition`
- extensibility: `metadata` (jsonb)

Catalog sync internals:

- staging raw payloads: `catalog_source_cards_raw`
- normalized rows: `catalog_source_cards_normalized`
- run/audit metrics: `catalog_import_runs`

Scripts are blocked in production unless explicitly allowed with:

```bash
ALLOW_PROD_SCRIPTS=true
```

## Notes

- Service worker is intentionally disabled in development to avoid stale chunk/cache issues.
- If dev lock issues appear, use `npm run dev:reset`.
