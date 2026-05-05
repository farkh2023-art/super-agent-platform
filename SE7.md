Tu es Claude Code/Codex, ingénieur backend/frontend senior, spécialiste observabilité, WebSocket, monitoring local, rapports admin, sécurité et performance Node.js.



CONTEXTE

Le projet SUPER-AGENT PLATFORM est fonctionnel dans :



C:\\Users\\Youss\\super-agent-platform



État actuel validé :

\- backend Node.js / Express ;

\- frontend SPA HTML/CSS/JS ;

\- Super-Agent orchestrateur ;

\- workflows ;

\- scheduler ;

\- metrics ;

\- RAG/memory/embeddings ;

\- SQLite progressif ;

\- migration/rollback/storage control ;

\- auth multi-user ;

\- sessions SQLite ;

\- audit SQLite ;

\- JTI blacklist SQLite ;

\- cleanup auth ;

\- backup sécurisé ;

\- tests backend : 427/427 ;

\- tag stable recommandé : v2.1.0-phase-6f.



OBJECTIF PHASE 7

Ajouter une observabilité globale et des rapports admin consolidés.



Objectifs :

1\. créer un tableau de santé système global ;

2\. ajouter WebSocket notifications pour événements critiques ;

3\. ajouter pagination sessions/audit ;

4\. mettre à jour last\_used\_at au refresh ;

5\. ajouter rate limit revoke-all ;

6\. ajouter export CSV audit log ;

7\. ajouter rapports admin Markdown/JSON ;

8\. préserver tous les tests existants.



Ne pas casser AUTH\_MODE=single.

Ne pas rendre SQLite obligatoire.

Ne pas exposer secrets.

Ne pas ajouter de framework lourd.



==================================================

1\. INSPECTION INITIALE

==================================================



Inspecte :

\- backend/src/server.js

\- backend/src/routes/dashboard.js

\- backend/src/routes/metrics.js

\- backend/src/routes/auth.js

\- backend/src/middleware/auditLog.js

\- backend/src/auth/refreshTokens.js

\- backend/src/auth/authCleanup.js

\- backend/src/auth/accessBlacklistStore.js

\- backend/src/routes/storage.js

\- backend/src/routes/memory.js

\- backend/src/routes/backup.js

\- frontend/index.html

\- frontend/js/api.js

\- frontend/js/app.js

\- frontend/js/ws.js

\- frontend/css/styles.css

\- docs/API.md

\- docs/README.md

\- SECURITY.md

\- .env.example



Puis donne un mini-plan avant modification.



==================================================

2\. HEALTH CENTER GLOBAL

==================================================



Créer ou enrichir :



GET /api/admin/health



Retour consolidé :

{

&nbsp; "status": "ok|warning|critical",

&nbsp; "generatedAt": "...",

&nbsp; "system": {

&nbsp;   "uptimeSec": 0,

&nbsp;   "memory": {},

&nbsp;   "nodeVersion": "...",

&nbsp;   "platform": "..."

&nbsp; },

&nbsp; "storage": {

&nbsp;   "mode": "json|hybrid|sqlite",

&nbsp;   "sqliteConnected": true,

&nbsp;   "lastValidationAt": "...",

&nbsp;   "desyncAlerts": 0

&nbsp; },

&nbsp; "auth": {

&nbsp;   "mode": "single|multi",

&nbsp;   "activeSessions": 0,

&nbsp;   "blacklistCount": 0,

&nbsp;   "cleanupEnabled": false

&nbsp; },

&nbsp; "rag": {

&nbsp;   "memoryItems": 0,

&nbsp;   "embeddingsEnabled": false,

&nbsp;   "embeddingsCount": 0,

&nbsp;   "lastEvaluationAt": "..."

&nbsp; },

&nbsp; "scheduler": {

&nbsp;   "enabled": true,

&nbsp;   "schedulesCount": 0,

&nbsp;   "lastRunAt": "..."

&nbsp; },

&nbsp; "tests": {

&nbsp;   "lastKnownTotal": 427

&nbsp; },

&nbsp; "warnings": \[]

}



Règles :

\- aucun secret ;

\- réponse rapide ;

\- fallback propre si composant absent.



==================================================

3\. WEBSOCKET NOTIFICATIONS

==================================================



Étendre WebSocket existant.



Événements :

\- auth:session\_revoked

\- auth:cleanup\_completed

\- auth:blacklist\_updated

\- storage:desync\_detected

\- storage:validation\_completed

\- rag:evaluation\_completed

\- scheduler:job\_failed

\- system:health\_warning



Frontend :

\- afficher bannière notification ;

\- historique court en mémoire ;

\- bouton clear notifications.



Si WebSocket absent, utiliser polling fallback.



==================================================

4\. PAGINATION SESSIONS/AUDIT

==================================================



Améliorer :



GET /api/auth/sessions

Query :

\- limit

\- offset

\- userId admin only

\- active=true|false



Retour :

{

&nbsp; "items": \[],

&nbsp; "total": 0,

&nbsp; "limit": 50,

&nbsp; "offset": 0,

&nbsp; "hasMore": false

}



Améliorer :



GET /api/auth/audit-log

Query :

\- limit

\- offset

\- username

\- method

\- action

\- from

\- to

\- statusCode

\- ip

\- userAgent



Même format paginé.



==================================================

5\. LAST\_USED\_AT AU REFRESH

==================================================



Modifier refreshTokens :

\- à chaque refresh réussi, mettre à jour last\_used\_at ;

\- conserver compatibilité fallback ;

\- tester SQLite et JSON/memory.



==================================================

6\. RATE LIMIT REVOKE-ALL

==================================================



Ajouter rate limit spécifique :

\- POST /api/auth/sessions/revoke-all



Variables :

REVOKE\_ALL\_RATE\_LIMIT\_WINDOW\_MS=900000

REVOKE\_ALL\_RATE\_LIMIT\_MAX=5



Retour 429 propre.



==================================================

7\. EXPORT CSV AUDIT LOG

==================================================



Ajouter :



GET /api/auth/audit-log/export.csv



Query filters identiques audit-log.



Règles :

\- admin only en multi ;

\- CSV échappé correctement ;

\- colonnes : createdAt, username, userId, workspaceId, method, action, statusCode, ip, userAgent, resourceType, resourceId

\- aucun token/password/cookie/authorization.



==================================================

8\. RAPPORTS ADMIN

==================================================



Créer :



backend/src/reports/adminReport.js



Endpoints :

\- GET /api/admin/report.json

\- GET /api/admin/report.md



Inclure :

\- health summary ;

\- storage summary ;

\- auth summary ;

\- RAG summary ;

\- scheduler summary ;

\- derniers warnings ;

\- compteurs par agent/workspace/utilisateur si disponible.



Ne jamais inclure secrets.



==================================================

9\. UI ADMIN OBSERVABILITY

==================================================



Ajouter vue “Admin Health” ou enrichir Dashboard.



Sections :

\- System Health ;

\- Storage Health ;

\- Auth Health ;

\- RAG Health ;

\- Scheduler Health ;

\- Live notifications ;

\- Sessions paginées ;

\- Audit paginé ;

\- bouton Export CSV audit ;

\- bouton Download admin report MD/JSON.



Modifier :

\- frontend/index.html

\- frontend/js/api.js

\- frontend/js/app.js

\- frontend/js/ws.js

\- frontend/css/styles.css



==================================================

10\. BACKUP

==================================================



Mettre à jour backup pour inclure :

\- derniers rapports admin générés si présents ;

\- sans secrets ;

\- sans tokens/hashes bruts.



==================================================

11\. TESTS

==================================================



Créer :

\- backend/tests/phase7-admin-health.test.js

\- backend/tests/phase7-websocket-notifications.test.js

\- backend/tests/phase7-pagination.test.js

\- backend/tests/phase7-audit-export.test.js

\- backend/tests/phase7-admin-report.test.js

\- backend/tests/phase7-security.test.js

\- backend/tests/phase7-frontend-smoke.test.js



Tester :

\- 427 tests existants restent verts ;

\- /api/admin/health ;

\- sessions pagination ;

\- audit pagination ;

\- last\_used\_at au refresh ;

\- revoke-all rate limit ;

\- CSV audit sans secrets ;

\- reports JSON/Markdown sans secrets ;

\- WebSocket event émis si testable ;

\- frontend contient Admin Health UI.



Commande :

cd backend

node --experimental-vm-modules node\_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand



==================================================

12\. DOCUMENTATION

==================================================



Créer :

docs/PHASE7.md



Mettre à jour :

\- docs/README.md

\- docs/API.md

\- SECURITY.md

\- .env.example



Documenter :

\- admin health ;

\- notifications ;

\- pagination ;

\- audit CSV ;

\- admin reports ;

\- limites.



==================================================

13\. RAPPORT FINAL

==================================================



À la fin, fournir :

1\. fichiers créés ;

2\. fichiers modifiés ;

3\. endpoints ajoutés ;

4\. variables .env ajoutées ;

5\. tests ajoutés ;

6\. nombre total de tests ;

7\. résultats ;

8\. limites restantes ;

9\. recommandation Phase 7B.



CRITÈRES D’ACCEPTATION



La Phase 7 est terminée seulement si :

\- les 427 tests restent verts ;

\- admin health fonctionne ;

\- notifications WebSocket ou fallback fonctionnent ;

\- sessions/audit pagination fonctionne ;

\- last\_used\_at refresh fonctionne ;

\- revoke-all rate limit fonctionne ;

\- CSV audit export fonctionne ;

\- admin reports JSON/MD fonctionnent ;

\- UI Admin Health existe ;

\- aucun secret exposé ;

\- documentation Phase 7 créée.

