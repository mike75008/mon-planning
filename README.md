# Mon Planning — déploiement Neon + Render + Clerk

Dashboard personnel avec auth multi-utilisateurs, base Neon et déploiement Render.

## 1. Créer la base sur Neon

1. Va sur [console.neon.tech](https://console.neon.tech), crée un projet.
2. Ouvre l'éditeur SQL et exécute le contenu de `schema.sql`.
3. **Si tu avais déjà créé l'ancienne table** (sans `user_id`), exécute `schema-migration.sql` à la place.
4. Récupère la **connection string** (Dashboard → Connection Details).

## 2. Configurer Clerk

1. Crée une application sur [dashboard.clerk.com](https://dashboard.clerk.com).
2. Récupère :
   - **Publishable key** (`pk_test_...` ou `pk_live_...`)
   - **Secret key** (`sk_test_...` ou `sk_live_...`)
3. Dans Clerk → **Domains**, ajoute l'URL Render (ex. `https://mon-planning.onrender.com`).

## 3. Variables d'environnement

### En local (fichier `.env` à la racine, non versionné)

```
NEON_DATABASE_URL=postgresql://...
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Sur Render (Environment)

| Variable | Usage |
|---|---|
| `NEON_DATABASE_URL` | Connexion PostgreSQL Neon (runtime serveur) |
| `CLERK_SECRET_KEY` | Auth API Express (runtime serveur) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Auth React Clerk (build Vite **et** runtime via `/env-config.js`) |

Après toute modification de variable sur Render → **Manual Deploy** pour reconstruire.

## 4. Déployer sur Render

1. [render.com](https://render.com) → New → Web Service → repo GitHub `mike75008/mon-planning`.
2. Configuration :
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `npm start`
3. Ajoute les 3 variables d'environnement (étape 3).
4. Déploie.

## 5. Développement local

```bash
npm install
# Crée .env avec les 3 variables
npm run dev          # frontend Vite (port 5173)
npm run start:local  # serveur Express (port 3000) — dans un autre terminal
```

## 6. Installer sur téléphone

Ouvre l'URL Render → **Partager → Sur l'écran d'accueil**.

## Note plan gratuit Render

Le service se met en veille après 15 min d'inactivité — le premier chargement peut prendre 20–30 s.
