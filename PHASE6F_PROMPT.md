Tu es Claude Code/Codex, ingénieur backend/frontend senior, spécialiste sécurité Node.js, JWT, SQLite, sessions, audit logs, backup sécurisé et UX admin.

CONTEXTE
Le projet SUPER-AGENT PLATFORM est fonctionnel dans :

C:\Users\Youss\super-agent-platform

État actuel validé :
- backend Node.js / Express ;
- frontend SPA HTML/CSS/JS ;
- AUTH_MODE=single par défaut ;
- AUTH_MODE=multi disponible ;
- JWT access token ;
- refresh token avec rotation ;
- refresh cookie optionnel ;
- CSRF optionnel ;
- access token blacklist en mémoire ;
- sessions refresh SQLite ;
- audit logs SQLite ;
- migration auth JSON → SQLite ;
- fallback JSON/mémoire ;
- tests backend : 369/369 ;
- tag stable recommandé : v2.0.0-phase-6e.

OBJECTIF PHASE 6F
Renforcer l’exploitation multi-user en rendant les révocations persistantes, visibles et nettoyées automatiquement.

Objectifs :
1. persister la blacklist JTI en SQLite ;
2. ajouter une UI sessions ;
3. permettre révocation session par session depuis l’UI ;
4. ajouter cleanup automatique des sessions/JTI/audit logs ;
5. enrichir audit logs IP + User-Agent ;
6. sécuriser backup auth.sqlite ;
7. conserver fallback mémoire/JSON ;
8. préserver tous les tests existants.

Ne pas casser AUTH_MODE=single.
Ne pas rendre SQLite obligatoire.
Ne pas stocker de token brut.
Ne pas exposer password_hash dans backup par défaut.
Ne pas ajouter de framework lourd.

==================================================
1. INSPECTION INITIALE
==================================================

Inspecte :

- backend/src/auth/tokenBlacklist.js
- backend/src/auth/refreshTokens.js
- backend/src/auth/refreshTokens.js
- backend/src/routes/auth.js
- backend/src/middleware/requireAuth.js
- backend/src/middleware/auditLog.js
- backend/src/routes/backup.js
- backend/src/storage/schema.js
- backend/src/storage/sqlite.js
- backend/src/server.js
- frontend/index.html
- frontend/js/api.js
- frontend/js/app.js
- frontend/css/styles.css
- docs/API.md
- docs/README.md
- docs/PHASE6E.md
- SECURITY.md
- .env.example
- backend/tests/

Puis donne un mini-plan avant modification.

==================================================
2. CONFIGURATION PHASE 6F
==================================================

Ajouter dans .env.example :

ACCESS_BLACKLIST_STORE=auto
ACCESS_BLACKLIST_CLEANUP_INTERVAL_MS=21600000
AUTH_CLEANUP_INTERVAL_MS=21600000
AUTH_CLEANUP_ENABLED=false
BACKUP_INCLUDE_AUTH_DB=false
BACKUP_INCLUDE_AUTH_SUMMARY=true
AUDIT_CAPTURE_USER_AGENT=true
AUDIT_CAPTURE_IP=true

Règles :
- ACCESS_BLACKLIST_STORE=auto utilise SQLite si disponible, sinon mémoire ;
- backup n’inclut pas auth.sqlite par défaut ;
- cleanup automatique désactivé par défaut ;
- AUTH_MODE=single reste inchangé ;
- aucun token brut ne doit être stocké.

==================================================
3. TABLE SQLITE JTI BLACKLIST
==================================================

Créer ou étendre le schéma SQLite avec :

Table : auth_jti_blacklist

Colonnes :
- jti_hash TEXT PRIMARY KEY
- user_id TEXT
- expires_at TEXT NOT NULL
- revoked_at TEXT NOT NULL
- reason TEXT
- metadata_json TEXT
- raw_json TEXT

Index :
- auth_jti_blacklist(expires_at)
- auth_jti_blacklist(user_id)
- auth_jti_blacklist(revoked_at)

Règles :
- stocker hash du jti, jamais le jti brut ;
- nettoyage possible des entrées expirées ;
- fallback mémoire conservé ;
- ne pas casser les anciens tokens si possible.

==================================================
4. STORE BLACKLIST ABSTRAIT
==================================================

Créer ou adapter :

- backend/src/auth/accessBlacklistStore.js
- backend/src/auth/accessBlacklistMemory.js
- backend/src/auth/accessBlacklistSqlite.js

API attendue :

- add(jti, expiresAt, metadata)
- has(jti)
- removeExpired()
- count()
- clear()

Adapter :

- backend/src/auth/tokenBlacklist.js
- backend/src/middleware/requireAuth.js
- backend/src/routes/auth.js

Comportement :
- logout ajoute le jti du access token à la blacklist ;
- requireAuth refuse un access token blacklisté ;
- ACCESS_BLACKLIST_STORE=memory fonctionne comme avant ;
- ACCESS_BLACKLIST_STORE=sqlite persiste les révocations ;
- ACCESS_BLACKLIST_STORE=auto choisit SQLite si disponible.

Tests attendus :
- mémoire compatible ;
- SQLite persistant ;
- token logout reste blacklisté après rechargement du store ;
- aucun jti brut en DB.

==================================================
5. CLEANUP AUTOMATIQUE AUTH
==================================================

Créer :

backend/src/auth/authCleanup.js

Comportement :
- si AUTH_CLEANUP_ENABLED=true, lancer interval avec .unref() ;
- nettoyer sessions expirées ;
- nettoyer JTI expirés ;
- nettoyer audit logs anciens seulement si explicitement prévu ;
- éviter exécutions concurrentes ;
- ne jamais bloquer le serveur.

Routes admin :

GET /api/auth/cleanup/status
POST /api/auth/cleanup

Retour attendu :

{
  "success": true,
  "sessionsRemoved": 0,
  "jtiRemoved": 0,
  "auditRemoved": 0,
  "durationMs": 0
}

Règles :
- admin only en AUTH_MODE=multi ;
- en AUTH_MODE=single, comportement compatible ;
- aucune donnée sensible dans la réponse.

==================================================
6. UI SESSIONS
==================================================

Ajouter une vue ou section Settings > Sessions.

Fonctions :
- afficher les sessions actives ;
- afficher current session si possible ;
- afficher createdAt, expiresAt, lastUsedAt, User-Agent, IP si disponibles ;
- bouton révoquer une session ;
- bouton révoquer toutes les autres sessions ;
- bouton cleanup expirées pour admin ;
- messages propres 401/403/429.

Frontend :
- API.getSessions()
- API.revokeSession(id)
- API.revokeAllSessions()
- API.runAuthCleanup()
- API.getAuthCleanupStatus()

Modifier :
- frontend/index.html
- frontend/js/api.js
- frontend/js/app.js
- frontend/css/styles.css

Ne jamais afficher :
- refreshToken ;
- refreshTokenHash ;
- accessToken ;
- jti brut.

==================================================
7. AUDIT ENRICHI
==================================================

Améliorer audit logs :

- capturer IP si AUDIT_CAPTURE_IP=true ;
- capturer User-Agent si AUDIT_CAPTURE_USER_AGENT=true ;
- afficher IP/User-Agent dans l’UI audit log ;
- ajouter filtres optionnels IP/User-Agent si simple ;
- ne jamais stocker headers complets ;
- ne jamais stocker Authorization ;
- ne jamais stocker Cookie ;
- ne jamais stocker token/password.

Modifier :
- backend/src/middleware/auditLog.js
- backend/src/routes/auth.js si audit log est exposé là
- frontend Audit Log UI

==================================================
8. BACKUP AUTH SÉCURISÉ
==================================================

Modifier backup :

Variables :
- BACKUP_INCLUDE_AUTH_DB=false
- BACKUP_INCLUDE_AUTH_SUMMARY=true

Comportement par défaut :
- ne pas inclure auth.sqlite ;
- ne pas inclure password_hash ;
- ne pas inclure refresh_token_hash ;
- ne pas inclure jti_hash ;
- inclure auth_summary.json avec seulement :

{
  "usersCount": 0,
  "activeSessionsCount": 0,
  "revokedSessionsCount": 0,
  "auditEventsCount": 0,
  "blacklistCount": 0,
  "generatedAt": "..."
}

Si BACKUP_INCLUDE_AUTH_DB=true :
- inclure auth.sqlite uniquement explicitement ;
- documenter le risque ;
- vérifier qu’aucun token brut n’existe dedans.

Tests obligatoires :
- backup par défaut ne contient pas auth.sqlite ;
- backup contient auth_summary.json ;
- backup ne contient pas password_hash ;
- backup ne contient pas refresh_token_hash ;
- backup ne contient pas jti_hash ;
- backup ne contient pas token brut.

==================================================
9. TESTS
==================================================

Créer :

- backend/tests/phase6f-jti-sqlite.test.js
- backend/tests/phase6f-auth-cleanup.test.js
- backend/tests/phase6f-sessions-ui-smoke.test.js
- backend/tests/phase6f-audit-enrichment.test.js
- backend/tests/phase6f-backup-auth-security.test.js

Tester :
- les 369 tests existants restent verts ;
- blacklist SQLite fonctionne ;
- jti hashé ;
- logout blacklist persiste ;
- cleanup sessions/JTI ;
- endpoint cleanup ;
- UI sessions existe ;
- audit IP/User-Agent ;
- backup auth sécurisé par défaut ;
- mode single compatible ;
- aucun token brut en DB/log/backup.

Commande Windows :

cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand

Le total attendu doit être supérieur à 369.

==================================================
10. DOCUMENTATION
==================================================

Créer :

docs/PHASE6F.md

Mettre à jour :
- docs/README.md
- docs/API.md
- docs/PHASE6E.md
- SECURITY.md
- .env.example

Documenter :
- JTI blacklist SQLite ;
- cleanup automatique ;
- UI sessions ;
- audit IP/User-Agent ;
- backup auth sécurisé ;
- variables env ;
- limites restantes ;
- procédure recommandée.

==================================================
11. VALIDATION MANUELLE
==================================================

Exécuter :

cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand

Tester manuellement :

Mode single :
- AUTH_MODE=single ;
- application démarre ;
- routes existantes fonctionnent.

Mode multi :
- AUTH_MODE=multi ;
- SESSION_STORE=sqlite ;
- AUDIT_LOG_STORE=sqlite ;
- ACCESS_BLACKLIST_STORE=sqlite ;
- login ;
- voir sessions ;
- refresh ;
- logout ;
- vérifier access token invalidé ;
- cleanup ;
- audit log avec IP/User-Agent ;
- backup ;
- vérifier absence tokens bruts.

==================================================
12. RAPPORT FINAL
==================================================

À la fin, fournir :

1. fichiers créés ;
2. fichiers modifiés ;
3. endpoints ajoutés ;
4. variables .env ajoutées ;
5. tables SQLite ajoutées ;
6. tests ajoutés ;
7. nombre total de tests ;
8. commandes exécutées ;
9. résultats ;
10. limites restantes ;
11. recommandation Phase 7.

CRITÈRES D’ACCEPTATION

La Phase 6F est terminée seulement si :

- les 369 tests restent verts ;
- JTI blacklist SQLite fonctionne ;
- aucun JTI brut en DB ;
- cleanup automatique optionnel fonctionne ;
- UI sessions fonctionne ;
- audit IP/User-Agent fonctionne ;
- backup exclut auth.sqlite par défaut ;
- backup summary sans secrets ;
- mode single compatible ;
- documentation Phase 6F créée.