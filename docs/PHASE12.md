# Phase 12 - Auto-update controle et monitoring release

Phase 12 cloture le passage a `v3.0.0-phase-12`. Elle ajoute un cycle de mise a jour local, controle et non intrusif: detection, notification, verification manuelle et installation guidee. Aucune mise a jour n'est telechargee ou installee automatiquement sans action explicite de l'operateur.

## Resume

- Backend update API: verification, historique, dismiss, statut monitor et check manuel.
- Frontend Update Center et bandeau de nouvelle version.
- Notification WebSocket `update_available`.
- Scripts Windows `release/update-check.ps1` et `release/update-install.ps1`.
- Monitoring local `updateMonitor` desactive par defaut.
- Feed public documente via `release/update-manifest.example.json`.
- Rollback operateur documente.

## Endpoints

| Endpoint | Role |
|:--|:--|
| `GET /api/update/check` | Verifie le feed configure sans telecharger de ZIP. |
| `GET /api/update/history` | Retourne les 50 dernieres installations reussies, sans chemins absolus. |
| `POST /api/update/dismiss` | Ignore une version indiquee par l'operateur. |
| `GET /api/update/monitor/status` | Retourne `enabled`, `running`, `lastCheckAt`, `lastResult`, `lastNotifiedVersion`. |
| `POST /api/update/check-now` | Lance une verification immediate sans telechargement ni installation. |

## Frontend

L'Update Center affiche la version courante, le statut du feed, l'historique et les actions de controle. Le bandeau de mise a jour s'appuie sur l'evenement WebSocket `update_available`. L'interface ne declenche pas d'installation automatique.

## WebSocket

Quand `updateMonitor` detecte une version plus recente et non deja notifiee, il emet `update_available` via `notify.updateAvailable(payload)`. Le monitor memorise `lastNotifiedVersion` en memoire pour limiter le spam.

## Scripts Windows

`release/update-check.ps1`:

- lit `VERSION` si `CurrentVersion` est absent;
- accepte `FeedUrl`, `Offline`, `Json`, `Strict`;
- exige HTTPS pour le feed et le `downloadUrl`;
- valide `version`, `downloadUrl`, `sha256`;
- ne telecharge pas le ZIP et n'ecrit aucun fichier.

`release/update-install.ps1`:

- accepte `ZipUrl`, `Sha256`, `Version`, `DownloadDir`, `InstallDir`, `DryRun`, `Offline`, `Json`, `Force`;
- ne fait rien de dangereux sans parametres explicites;
- ne contacte pas Internet en `Offline`;
- ne telecharge rien en `DryRun`;
- verifie SHA256 avec `Get-FileHash` avant extraction;
- ecrit `data/update-history.json` seulement apres succes reel;
- n'execute jamais automatiquement un script telecharge.

## Monitoring

`backend/src/monitoring/updateMonitor.js` exporte:

- `start(options)`;
- `stop()`;
- `runOnce(options)`;
- `getStatus()`.

Le monitor est desactive par defaut. Il ne demarre au boot que si `UPDATE_MONITOR_ENABLED=true`. Sans `UPDATE_FEED_URL`, il retourne un resultat local `NO_FEED` et ne contacte pas Internet.

## Variables .env

```dotenv
# HTTPS only when configured
UPDATE_FEED_URL=

# Disabled by default; notification only
UPDATE_MONITOR_ENABLED=false

# Default: 1 hour
UPDATE_MONITOR_INTERVAL_MS=3600000
```

## Format update manifest

Voir `release/update-manifest.example.json`.

```json
{
  "version": "v3.0.0-phase-12",
  "releaseDate": "YYYY-MM-DD",
  "releaseUrl": "https://github.com/farkh2023-art/super-agent-platform/releases/tag/v3.0.0-phase-12",
  "downloadUrl": "https://github.com/farkh2023-art/super-agent-platform/releases/download/v3.0.0-phase-12/super-agent-platform-v3.0.0-phase-12.zip",
  "sha256": "REPLACE_WITH_RELEASE_SHA256",
  "releaseNotes": "Auto-update controle, Update Center, monitoring release."
}
```

Ne jamais publier de token dans ce fichier.

## Procedure operateur

1. Construire la release localement.
2. Calculer et verifier le SHA256 du ZIP.
3. Publier le ZIP et le manifest sur un endpoint HTTPS.
4. Configurer `UPDATE_FEED_URL` avec l'URL HTTPS du manifest.
5. Laisser `UPDATE_MONITOR_ENABLED=false` pour une verification manuelle, ou passer a `true` pour des notifications periodiques.
6. Verifier `/api/update/check` ou `POST /api/update/check-now`.
7. Utiliser `release/update-check.ps1 -FeedUrl <url> -Json` pour un controle externe.
8. Utiliser `release/update-install.ps1 -DryRun` avant toute installation.
9. Pour une installation reelle, fournir `ZipUrl`, `Sha256`, `Version`, `InstallDir` et `Force`.

## Procedure rollback

1. Arreter le serveur avec `release/stop.ps1` si necessaire.
2. Restaurer le dernier ZIP stable connu, par exemple `v2.9.0-phase-10`.
3. Restaurer `.env` et `backend/data` depuis une sauvegarde controlee.
4. Redemarrer avec `release/start.ps1 -Mode demo` ou la commande operateur habituelle.
5. Verifier `GET /api/health`, `GET /api/version` et `GET /api/update/history`.
6. Si le feed public pointe vers une version defectueuse, retirer ou corriger le manifest HTTPS.

## Limites securite

- `UPDATE_FEED_URL` doit etre HTTPS.
- Le monitor est desactive par defaut.
- Aucune installation automatique n'est declenchee.
- Le ZIP doit etre verifie par SHA256 avant extraction.
- Aucun script telecharge ne doit etre execute automatiquement.
- Les fichiers `.env`, tokens, bases runtime et logs restent exclus des releases.

## Commandes de validation

```powershell
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/phase12 --runInBand
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand
```

```powershell
.\release\update-check.ps1 -Offline -Json
.\release\update-install.ps1 -DryRun -Offline -Json
.\release\create-release.ps1 -Version v3.0.0-phase-12 -DryRun
```
