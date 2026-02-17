# Tests Auth – QA, Chaos, Stress

## QA (`qa-auth.test.ts`)

- **redirectTarget** : next vide / invalide → `/profile` ; chemin valide → conservé.
- **sanitizeUsername** : pseudo valide conservé ; nettoyage caractères ; fallback `trainer` si trop court.
- **validatePasswordSignUp** : refus < 6 caractères, accepte ≥ 6.
- **auth-state** : états initiaux `idle`.

## Chaos (`chaos-auth.test.ts`)

- **requestPasswordReset** : email vide → erreur ; Supabase erreur / throw → propagé ou status error ; success → status success.
- **updatePassword** : mot de passe court / vide → erreur ; Supabase erreur → status error ; success → status success.

(Mocks : `@/lib/supabase/server` → client avec `auth.resetPasswordForEmail` / `auth.updateUser`.)

## Stress (`scripts/stress-auth.mjs`)

Charge en **concurrence** sur `signIn` (et création d’un user de test si besoin).

```bash
# Optionnel : compte dédié
export STRESS_EMAIL=stress@example.com
export STRESS_PASSWORD=secret123

# Sinon un user éphémère est créé
export NEXT_PUBLIC_SUPABASE_URL=...
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Par défaut : 10 concurrent, 50 requêtes
npm run stress:auth

# Personnaliser
STRESS_CONCURRENCY=20 STRESS_TOTAL=100 npm run stress:auth
```

Résumé affiché : total, OK / fail, temps total, latence moyenne, P99, détail des erreurs.
