# Politique de Sécurité – Super-Agent Platform

## Gestion des secrets

### Ce qui NE DOIT PAS être commis dans git

| Type | Exemples | Protection |
|------|----------|------------|
| Clés API | `sk-ant-...`, `sk-...` | `.gitignore` → `.env` ignoré |
| Credentials OAuth | tokens, refresh tokens | `.gitignore` → `.env` ignoré |
| Certificats | `*.pem`, `*.key` | `.gitignore` |
| Données runtime | `backend/data/` | `.gitignore` |

### Flux de configuration sécurisé

```
.env.example  ──(copier)──▶  .env  ──(jamais commité)──▶ git
     ↑                         ↓
 commité dans git          chargé par dotenv
 (placeholders uniquement)  (clés réelles)
```

**Règle absolue** : le fichier `.env` ne doit jamais être commité. Le `.gitignore` le protège, mais vérifiez toujours avant un `git push`.

---

## Architecture de sécurité de l'application

### Clés API

- Les clés API sont **exclusivement lues depuis les variables d'environnement** (`process.env`)
- Elles ne transitent **jamais** par l'API REST (les routes `GET /api/settings` masquent les clés)
- Le frontend n'a **jamais** accès aux clés — elles restent dans le processus Node.js backend

### Fichier `backend/src/routes/settings.js`
```js
// Les clés API sont SUPPRIMÉES avant la réponse
delete settings.anthropicApiKey;
delete settings.openaiApiKey;
```

### Stockage des données

- Les données sont stockées localement dans `backend/data/` (JSON)
- Ce répertoire est dans `.gitignore` — il n'est jamais commité
- Aucune donnée utilisateur n'est envoyée vers des services tiers (sauf si un fournisseur IA est configuré)

---

## Validation des entrées

| Couche | Protection |
|--------|-----------|
| `POST /api/tasks` | Validation `task` requis, non vide, type string |
| `POST /api/workflows` | Validation `name` + `steps` non vides |
| Frontend | `escHtml()` sur toutes les données affichées (prévention XSS) |
| Providers IA | Les clés API sont validées avant appel, erreurs propagées proprement |

---

## Prévention des injections

### XSS (Cross-Site Scripting)
Toutes les données affichées dans le frontend passent par `escHtml()` :
```js
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

### Injection de commandes
- Les providers IA reçoivent des prompts en clair, pas des commandes système
- Aucun `exec()` ou `spawn()` n'est utilisé avec des entrées utilisateur

### Injection de prompt (pour les fournisseurs IA réels)
- Les prompts système sont définis statiquement dans `registry.js`
- Le contenu utilisateur est inséré dans le message `user`, pas dans le `system`
- Suivre les recommandations Anthropic / OpenAI pour la séparation system/user

---

## Dépendances

Les dépendances sont auditées régulièrement :

```bash
cd backend
npm audit                  # Vérifier les CVE
npm audit fix              # Corriger les CVE automatiquement
```

Dépendances de production minimales (sans bloat) :
- `express` — serveur web
- `ws` — WebSocket
- `uuid` — génération d'IDs
- `dotenv` — chargement `.env`
- `cors` — headers CORS
- `@anthropic-ai/sdk` — Claude (optionnel)
- `openai` — OpenAI (optionnel)

---

## Signalement de vulnérabilités

Si vous découvrez une vulnérabilité de sécurité, **ne créez pas d'issue publique**. Contactez directement le mainteneur du projet.

---

## Checklist avant déploiement

- [ ] `.env` absent du dépôt git (`git status` ne le montre pas)
- [ ] `npm audit` retourne 0 vulnérabilités critiques/hautes
- [ ] Aucune clé API en dur dans le code (`grep -r "sk-ant-\|sk-[a-zA-Z]" src/`)
- [ ] `data/` absent du dépôt git
- [ ] Variables d'environnement de production configurées séparément
- [ ] CORS restreint à l'origine frontend uniquement (variable `FRONTEND_URL`)
