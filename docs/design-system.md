# Design System - TCG

Ce document definit les regles UI communes du projet pour garantir une interface coherente, lisible et rapide a maintenir.

## 1) Source Of Truth

- **Tokens globaux**: `src/app/globals.css`
- **Composants UI de base**: `src/components/ui/*`
- **Helper de classes**: `src/lib/utils.ts` (`cn`)

Principe: avant de creer un nouveau style, verifier d'abord si un token ou un composant existant couvre deja le besoin.

## 2) Tokens et theme

Les tokens sont definis via variables CSS dans `:root` (light) et `.dark` (dark):

- `--background`, `--foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--border`, `--input`, `--ring`
- `--destructive`
- `--radius` et derives (`--radius-sm`, `--radius-md`, `--radius-lg`, ...)

Regles:

- Ne pas hardcoder des couleurs hex directement dans les pages sauf exception justifiee.
- Utiliser les classes semantiques Tailwind connectees aux tokens (`bg-background`, `text-foreground`, `border-border`, etc.).
- Conserver un contraste lisible en dark mode.

## 3) Composants UI officiels

Composants de base disponibles dans `src/components/ui`:

- `button`
- `input`
- `select`
- `textarea`
- `checkbox`
- `label`
- `badge`
- `card`
- `dialog`
- `tabs`
- `separator`
- `pagination-controls`
- `skeleton`
- `toaster`

Regles:

- Preferer ces composants avant tout markup custom.
- Ajouter des variantes via `cva` dans le composant UI concerné (et pas localement dans une page).
- Garder les props et variants simples et explicites (`variant`, `size`, `disabled`).

## 4) Typographie et hierarchy

Conventions recommandees:

- Titre ecran: `text-2xl font-semibold`
- Titre section: `text-sm font-medium`
- Texte principal: `text-sm`
- Texte secondaire/meta: `text-xs text-muted-foreground`
- Prix/valeur forte: `text-xl` a `text-3xl` selon contexte

Regles:

- Une seule information dominante visuelle par bloc.
- Eviter plusieurs textes en gras de meme niveau cote a cote.
- Limiter les line-clamp aux zones de liste/cartes.

## 5) Espacements, surfaces, rayons

Conventions:

- Espacement vertical entre blocs: `space-y-2` / `space-y-3` / `space-y-4`
- Grilles de formulaires: `grid gap-3` ou `grid gap-4`
- Rayon standard: `rounded-md`

Regles:

- Uniformiser les marges internes d'un meme pattern.
- Eviter de multiplier les bordures et ombres si la hierarchy visuelle est deja claire.
- Utiliser `border-b` + `pb-*` pour separer des sections dans un panneau.

## 6) Regles d'usage composant

### Button

- Priorite d'action: 1 bouton principal (`variant="default"`) max par zone.
- Actions secondaires: `outline` ou `ghost`.
- Mobile sticky CTA: hauteur cible `h-12` minimum.

### Form

- Toujours associer `Label` + champ.
- Afficher un hint court si necessaire en `text-xs text-muted-foreground`.
- Etat erreur concis, proche du champ.

### Skeleton

- Afficher un skeleton quand la structure est connue mais les donnees chargent.
- Garder le skeleton proche de la geometrie finale (ex: ratio carte Pokemon `63/88`).

## 7) Patterns d'ecran recommandes

### P1 - Header d'ecran mobile

- Retour (si necessaire) + titre principal.
- Stepper horizontal pour les flows multi-etapes.

### P2 - Bloc formulaire

- Titre de section court.
- Champs en colonne mobile, grille 2 colonnes desktop si pertinent.

### P3 - Carte media (Pokemon)

- Image principale avec ratio `63/88`.
- Meta en dessous: nom, set/numero, attributs.
- Badge overlay possible (ex: pourcentage correspondance).

### P4 - Sticky actions mobile

- Zone fixe en bas, `inset-x-0`.
- 1 action principale evidemment visible.
- Si 2 actions, ordre du haut vers bas = priorite haute vers basse.

### P5 - Panneau de detail annonce

- Sections logiques:
  - Prix & action
  - Etat de la carte
  - Identification
  - Details techniques

## 8) Do / Don't

Do:

- Reutiliser `ui/*` au maximum.
- Respecter tokens + variants existants.
- Garder une hierarchy visuelle nette.
- Tester les ecrans critiques sur mobile en priorite.

Don't:

- Dupliquer des styles de boutons/champs dans les pages.
- Melanger plusieurs couleurs d'accent sans raison produit.
- Ajouter des labels techniques bruts non user-friendly.
- Utiliser des tailles de texte trop petites pour les actions.

## 9) Checklist review UI (PR)

- Le composant reutilise-t-il `ui/*` quand possible ?
- Les couleurs utilisent-elles les tokens ?
- Le contraste est-il lisible en light et dark ?
- Les actions principales/secondaires sont-elles claires ?
- Le rendu mobile est-il correct (espacement, tappable area, sticky CTA) ?
- Les etats loading/empty/error sont-ils traites ?
- La terminologie est-elle user-friendly en francais ?

## 10) Evolution du design system

Quand un nouveau besoin apparait:

1. Verifier si un variant suffit.
2. Sinon, etendre un composant UI existant.
3. Si vraiment necessaire, creer un nouveau composant UI reutilisable.
4. Documenter la nouvelle regle ici dans la meme PR.

