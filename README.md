EcoMoni – Déploiement Netlify avec base GitHub
================================================

Prérequis
- Compte GitHub et dépôt cible (ex: owner/repo) pour stocker `data/ecomoni.json`.
- Compte Netlify.

Structure
- Site statique dans `ecomoni-simple/`.
- Fonctions Netlify dans `netlify/functions/`.
- Config Netlify: `netlify.toml`.

Déploiement
1) Poussez ce dossier sur GitHub.
2) Sur Netlify: New site from Git > connectez votre repo.
   - Build command: vide
   - Publish directory: `ecomoni-simple`
3) Dans Site settings > Functions, assurez `netlify/functions`.
4) Dans Site settings > Environment variables, ajoutez:
   - `GITHUB_TOKEN`: PAT avec droits repo (Contents: Read/Write)
   - `GITHUB_OWNER`: votre utilisateur/organisation GitHub
   - `GITHUB_REPO`: nom du dépôt ciblé
   - `GITHUB_BRANCH`: `main` (ou autre)
   - `GITHUB_PATH`: `data/ecomoni.json`
5) Créez le fichier initial dans le repo cible si absent: `data/ecomoni.json` avec `[]`.
6) Déployez le site. L’API sera disponible sous `/api/github-db`.

Utilisation côté client
- `script.js` tente d’utiliser `/api/github-db` (GET/POST) et bascule sur `localStorage` en cas d’échec.
- Aucune config supplémentaire requise côté frontend.

Test rapide
- Ouvrez votre site Netlify déployé.
- Ajoutez un échantillon via l’UI.
- Vérifiez sur GitHub que `data/ecomoni.json` est mis à jour par commit automatique.

Dépannage
- 401/404: vérifiez `GITHUB_TOKEN` permissions et variables d’environnement.
- 405: seules méthodes GET/POST sont supportées.
- CORS: autorisé par défaut côté fonction.
