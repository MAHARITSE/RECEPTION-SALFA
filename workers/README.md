# PARTIE 1 — RECEPTION SALFA version JSON (workers.dev)

> Cette partie est la **version JSON** de l'application : toutes les données
> proviennent du fichier `src/data/localData.json` intégré au build (état en
> mémoire dans le navigateur). Elle est conçue pour être déployée sur
> **Cloudflare Workers** (`*.workers.dev`).

## 🚀 Déploiement sur workers.dev

1. **Prérequis** : Node.js + [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
   (installé automatiquement par `npx`).

2. Depuis le dossier `workers/` :

```bash
cd workers
npx wrangler login        # connexion au compte Cloudflare (une seule fois)
npx wrangler deploy       # déploiement
```

3. L'application est disponible à l'adresse :
   `https://reception-salfa.<votre-sous-domaine>.workers.dev`

Le fichier `wrangler.jsonc` pointe les fichiers statiques vers `public/`
(dossier qui contient l'application compilée en **un seul fichier** `index.html`)
avec gestion SPA : toutes les routes retombent sur `index.html`.

## 🔄 Recompiler cette version (après une modification du code source)

Depuis la racine du projet :

```bash
npm install
npm run build                       # build standard = version JSON (sans MySQL)
cp dist/index.html workers/public/index.html
cd workers && npx wrangler deploy
```

> ⚙️ Le build standard (`npm run build`) ne contient **aucun** appel à MySQL :
> `VITE_WAMP_MODE` n'est pas défini, le code de synchronisation MySQL est
> retiré du bundle.

## 📦 Contenu

```text
workers/
├── public/
│   └── index.html        # Application React/Vite compilée en un seul fichier
├── wrangler.jsonc        # Configuration Cloudflare Workers (assets statiques)
└── README.md             # Ce fichier
```

## 🔑 Comptes de l'application

Les comptes initiaux (intégrés dans le fichier compilé, identiques à
`src/data/localData.json`) :

| Rôle | Identifiant affiché | Mot de passe |
|---|---|---|
| Admin | Admin Système | `admin123` |
| Réception | Aina Rakoto | `rec123` |
| Médecin | Dr. Feno Rasoana / Dr. Mialy Andria | `doc123` |
| Caisse | Caisse 1 - Miora Kanto / Caisse 2 - Pierre Duval | `caisse123` |
| Pharmacie | Pharmacie 1 - Tiana Soa / Pharmacie 2 - Fatima Benali | `pharma123` |
| Laboratoire | Hery Lanto | `labo123` |
| Magasinier | Niry Tahina | `mag123` |
| Facturation sociétés | Lova Sitraka | `fact123` |

> ⚠️ Version JSON : les données saisies sont conservées en mémoire pendant la
> session (rechargement = retour aux données d'origine). Pour un stockage
> persistant (MySQL), utilisez la **PARTIE 2** : le dossier `WAMP/`.
