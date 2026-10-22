# Atelier Formulaire

Les formulaires de la Suite Atelier : inscriptions, sondages, retours, demandes. On construit le questionnaire, on l'ouvre aux réponses, on partage un lien, et les réponses arrivent rangées, prêtes pour Atelier Viz et Atelier Nexus.

- **Constructeur** : réponse courte, paragraphe, e-mail, nombre, date, choix unique, cases à cocher, liste déroulante, échelle (0/1 à 10), oui / non, titres de section. Questions obligatoires, aides, bornes. Glisser-déposer ou flèches pour réordonner. **Enregistrement automatique.**
- **Aperçu** exact de ce que verra la personne qui répond.
- **Deux façons de répondre** :
  - *Personnes connectées à la suite* : derrière le portail ; chaque réponse porte le nom de la personne ; option « une seule réponse par personne ».
  - *Toute personne qui a le lien* : lien secret `/r/<lien>`, sans connexion, pour des personnes extérieures. Le lien peut être régénéré (l'ancien cesse de marcher). Champ piège anti-robots et limite d'envois par adresse IP.
- **Ouverture et fermeture** : en préparation → ouvert → fermé, fermeture automatique à une date.
- **Réponses** : synthèse par question (répartition des choix, moyenne / minimum / maximum, distribution d'une échelle, derniers textes) ou une ligne par réponse ; suppression d'une réponse ; **export CSV** (séparateur `;`, s'ouvre tel quel dans Excel ou Numbers ; cellules commençant par `= + - @` neutralisées).
- **Sûreté des données** : le type d'une question qui a déjà des réponses ne peut plus changer ; un formulaire supprimé reste 30 jours récupérable avec ses réponses ; modifications concurrentes détectées.

## Lancer en local

```bash
npm ci
npm run dev        # interface http://127.0.0.1:5177, API http://127.0.0.1:3300
```

Ou la version compilée, servie par le backend seul : `npm run build && npm start` → http://127.0.0.1:3300.
Les données vont dans `backend/data/formulaire.db`. Au premier démarrage, un formulaire d'exemple (en préparation) est créé.

## Réglages (variables d'environnement du backend)

| Variable | Défaut | Rôle |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3300` | Adresse d'écoute |
| `FORMULAIRE_DATA_DIR` | `backend/data` | Base SQLite |
| `ALLOWED_HOSTS` | (vide) | Hôtes publics acceptés en plus du bouclage (ex. `formulaire.atelier.mondomaine.fr`) |
| `FORMULAIRE_PUBLIC_URL` | (vide) | Adresse publique, pour les liens de partage |
| `FORMULAIRE_STATIC_DIR` | `frontend/dist` s'il existe | Interface compilée servie par le backend |
| `FORMULAIRE_PUBLIC_RATE_LIMIT` | `20` | Envois publics acceptés par adresse IP et par 10 minutes |
| `FORMULAIRE_DEFAULT_USER` | `moi` | Auteur affiché sans portail (en local) |

## Sur le VPS (Atelier_Deploy)

Derrière le portail de la suite : Caddy vérifie la session pour tout, **sauf** les adresses de la réponse publique (`/r/*`, `/api/public/*`) et les fichiers de l'interface (`/assets/*`, `/favicon.svg`, `/theme-init.js`). Toutes les autres routes d'API restent réservées aux personnes connectées. La personne connectée vient de l'en-tête `X-Atelier-User` posé par le portail.

## Utiliser les réponses ailleurs

- **Atelier Nexus** (contrat `atelier-node/1`, manifeste `GET /api/atelier/manifest`, événements `GET /api/atelier/events`) :

  | Action | Type | Route |
  |---|---|---|
  | `forms.list` | lecture | `GET /api/atelier/forms` → `atelier-table/1` |
  | `forms.get` | lecture | `GET /api/atelier/forms/{form_id}` → questions (identifiants, types, choix) |
  | `responses.list` | lecture | `GET /api/atelier/forms/{form_id}/responses?since_id&limit` → `atelier-table/1`, une colonne par question |
  | `responses.submit` | écriture, `Idempotency-Key` | `POST /api/atelier/forms/{form_id}/responses` `{ answers }` |

  Événements : `formulaire.form.created|updated|opened|closed|deleted`, `formulaire.response.submitted|deleted` (jamais le contenu des réponses).
- **Atelier Viz** : `GET /api/exports/datasets` et `GET /api/exports/datasets/form-<id>`, même forme que les jeux de données d'Atelier Projets.

## Comment c'est construit

```
backend/   Fastify + TypeScript + SQLite (better-sqlite3)
  src/domain/questions.ts   règles pures : questions, contrôle des réponses, synthèse
  src/services/             formulaires, réponses (CSV, tables), événements, idempotence, nœud Atelier
  src/routes/               forms.ts (interface), fill.ts (répondre : suite + public), atelier.ts (Nexus, Viz)
frontend/  React + TypeScript + Vite, CSS natif
```

Charte « néon monochrome » de la suite, couleur signature **menthe `#38D9A9`** (`frontend/src/styles/formulaire-signature.css`).

## Vérifier

```bash
npm run check      # typage + tests
```
