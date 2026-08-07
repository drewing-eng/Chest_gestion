# Coffre — gestion de coffres, inventaire et catalogue

Application personnelle de gestion d'inventaire, hébergée sur Cloudflare Workers + D1. Voir `PRD` fourni pour la spécification complète.

## Stack

- Un seul Worker (`worker/index.js`) qui sert le front statique (`public/`) et l'API (`/api/*`).
- Base de données Cloudflare D1 (SQLite) : deux tables, `catalogue` et `journal`. L'état des coffres n'est jamais stocké : il est recalculé à partir du journal (event sourcing).
- Front en HTML/CSS/JS vanilla (modules ES natifs, pas de build).

## Développement local

```bash
npm install

# Créer et migrer la base D1 locale (une seule fois, ou après une nouvelle migration)
npx wrangler d1 migrations apply coffre-db --local

# Lancer le serveur de développement (front + API + D1 local émulé)
npm run dev
```

Le site est servi sur `http://localhost:8787`.

## Déploiement

Voir la conversation / le plan de mise en ligne pour le guide pas à pas (création de la base D1 distante, `wrangler deploy`, Cloudflare Access recommandé).

Résumé :

```bash
npx wrangler login
npx wrangler d1 create coffre-db          # récupérer le database_id, le renseigner dans wrangler.toml
npx wrangler d1 migrations apply coffre-db --remote
npx wrangler deploy
```
