# Mon Planning — déploiement Neon + Render

Ton dashboard, en autonome, avec une vraie base de données et une URL à toi.

## 1. Créer la base sur Neon

1. Va sur console.neon.tech, crée un projet (ou utilise un projet existant).
2. Ouvre l'éditeur SQL du projet et colle le contenu de `schema.sql` (une seule table, `day_status`).
3. Récupère la **connection string** (Dashboard → Connection Details), du genre :
   `postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=require`
   Garde-la de côté, tu en auras besoin à l'étape 3.

## 2. Pousser le code sur GitHub

Dans ce dossier :
```bash
git init
git add .
git commit -m "planning initial"
```
Crée un repo (privé si tu veux) sur GitHub et pousse dessus.

## 3. Déployer sur Render

1. render.com → New → Web Service → connecte ton repo GitHub.
2. Configuration :
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `npm start`
   - **Environment Variable** : `NEON_DATABASE_URL` = ta connection string Neon (étape 1)
3. Déploie. Render te donne une URL du genre `mon-planning.onrender.com`.

C'est tout — ton app tourne, connectée à Neon, accessible depuis n'importe quel navigateur.

## 4. L'installer comme une appli sur ton téléphone

Ouvre l'URL Render sur ton tel (Safari sur iPhone, Chrome sur Android) →
**Partager → Sur l'écran d'accueil**. Tu as une icône, plein écran, comme une vraie appli.

## Note sur le plan gratuit Render

Le plan gratuit met le service en veille après 15 min d'inactivité — le premier
chargement après une pause peut prendre 20-30 secondes le temps qu'il se réveille.
Si ça te gêne à l'usage quotidien, le plan payant (7$/mois) le garde toujours actif.

## Pour aller plus loin

Une fois que c'est stable, tu pourras reprendre ce code dans Claude Code pour
ajouter des blocs, changer les horaires, ou brancher des notifications — la structure
(server/index.js + src/Dashboard.jsx) est volontairement simple pour rester facile
à faire évoluer toi-même.
