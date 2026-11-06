# Atelier Formulaire — règles du dépôt

Consulte `README.md` pour les fonctions et les réglages. Le contrat commun de la suite (charte, nœud `atelier-node/1`) est dans `Atelier_Projets/docs/SUITE.md`.

## Architecture

- `backend/` : Fastify + TypeScript + better-sqlite3. **Routes minces** (`src/routes/`) qui valident puis appellent un service ; logique dans `src/services/` ; règles pures dans `src/domain/`.
- Toute écriture passe par `services/forms.ts` ou `services/responses.ts`, dans **une transaction** qui émet l’événement `formulaire.*` (`emitEvents`). Les réponses sont toujours contrôlées par `domain/questions.ts` (`checkAnswers`), quelle que soit leur origine (suite, public, Nexus).
- Migrations SQLite dans `src/db/database.ts` : on n'en modifie jamais une publiée, on en ajoute une.
- Erreurs d'API : `ApiError` → `{ detail, code }`, messages en français.
- `PUT /api/forms/:id` exige `baseVersion` (verrou optimiste) : 409 `CONFLICT` avec la version actuelle si elle a changé. Le type d'une question qui a des réponses ne change plus.
- Réponse publique (`routes/fill.ts`) : seules `/r/*` et `/api/public/*` sont ouvertes sans connexion par Caddy ; ne jamais y exposer l'id interne, le lien secret ou les réponses. Champ piège + limite par IP.
- Nœud Atelier : actions déclarées **une seule fois** dans `services/atelier-manifest.ts` (schémas réutilisés par les routes), logique dans `services/atelier-node.ts`, idempotence par `runIdempotent`. Les événements ne contiennent jamais le contenu des réponses.
- Sécurité : gardes Host / Origin dans `http/guards.ts` (ne pas assouplir) ; export CSV avec cellules `= + - @` neutralisées.
- `frontend/` : React + Vite, CSS natif, charte v2 « Linear » de la suite (`Atelier_Deploy/DESIGN.md`). `src/styles/atelier-ds/*` et `src/styles/atelier-brand/*` (marque, police Inter, `atelier-theme.js`) sont des **copies verbatim** d'Atelier Projets : ne pas les modifier ici. `public/theme-init.js` est une copie exacte de `atelier-brand/atelier-theme.js` (chargée avant le rendu, adresse ouverte sans connexion par Caddy ; un test vérifie l'égalité). La signature sarcelle `#008478` vient de la source commune (`data-atelier-app="formulaire"` sur `<html>`). L'interface est dans `base.css` (coquille : barre latérale 232 px, barre haute 44 px, boutons, champs, menus) et `formulaire.css` (aucune couleur littérale : uniquement les jetons `--app-*`, `--accent*`, `--status-*`). Structure neutre, accent = signature (bouton principal, sélection, focus) ; pas de halo, de lueur ni de barre de couleur latérale.
- Thème : `lib/theme.ts` passe par `window.atelierTheme` (préférence commune à la suite : cookie `atelier_theme` sur le VPS, sinon `localStorage["atelier:theme"]`).
- Les contrôles de saisie existent côté backend (`domain/questions.ts`, qui fait foi) et frontend (`lib/questions.ts`, contrôle léger) : les garder cohérents.

## Méthode

- Interface et messages en français, tutoiement.
- Après chaque changement : `npm run check` (typage + tests). Tout comportement nouveau a un test.
- Commits : `feat(scope): …`, `fix(scope): …`, `chore(scope): …`.
