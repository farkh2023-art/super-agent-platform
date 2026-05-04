'use strict';

const MOCK_RESPONSES = {
  'sim-fdtd': {
    plan: 'Simuler les propriétés optiques des nanoparticules via FDTD. Étapes : (1) configurer la grille de simulation, (2) définir les matériaux, (3) lancer la simulation, (4) extraire et analyser les spectres.',
    result: `## Résultats de Simulation FDTD

### Configuration
- **Méthode** : FDTD (Finite-Difference Time-Domain)
- **Plage spectrale** : 400–800 nm
- **Points de fréquence** : 51
- **Maillage** : adaptatif (raffiné autour de la particule)

### Script Python (MEEP)
\`\`\`python
import meep as mp
import numpy as np

# Nanoparticule d'or - diamètre 60 nm
r = 0.03  # µm
gold = mp.Medium(epsilon=mp.lorentzian_susceptibilities_from_file("Au_JC.txt"))

cell = mp.Vector3(0.4, 0.4, 0.4)
geometry = [mp.Sphere(radius=r, material=gold)]
sources = [mp.Source(mp.GaussianSource(fcen=0.5/0.6, fwidth=0.5), mp.Ex, mp.Vector3(-0.15))]

sim = mp.Simulation(cell_size=cell, geometry=geometry, sources=sources, resolution=50)
sim.run(until=200)
\`\`\`

### Résultats
| Diamètre (nm) | λ_résonance (nm) | σ_abs (nm²) | σ_diff (nm²) |
|:---:|:---:|:---:|:---:|
| 20 | 517 | 842 | 156 |
| 40 | 524 | 4820 | 1890 |
| 60 | 535 | 12400 | 7600 |
| 80 | 548 | 24100 | 21800 |
| 100 | 562 | 38900 | 48200 |

### Conclusion
Les nanosphères d'or montrent un déplacement bathochrome de la résonance plasmonique avec l'augmentation du diamètre (+0.45 nm/nm). La diffusion domine la dissipation pour d > 60 nm.`,
  },
  'data-lineage-fr': {
    plan: 'Analyser la lignée des données : (1) parser les scripts SQL, (2) extraire les relations de tables, (3) construire le graphe de dépendances, (4) identifier les impacts des modifications.',
    result: `## Rapport de Lignée de Données

### Graphe de Dépendances (Mermaid)
\`\`\`mermaid
graph LR
    RAW_CLAIMS --> STAGING_CLAIMS
    STAGING_CLAIMS --> PROCESSED_CLAIMS
    PROCESSED_CLAIMS --> FINAL_REPORT
    RAW_MEMBERS --> STAGING_MEMBERS
    STAGING_MEMBERS --> PROCESSED_CLAIMS
\`\`\`

### Analyse d'Impact
Modifier **STAGING_CLAIMS** affecte : PROCESSED_CLAIMS, FINAL_REPORT (2 tables en aval).

### Risques Identifiés
- Couplage fort entre STAGING et PROCESSED
- Absence de contrôle de version sur les procédures stockées
- Pas de journalisation des transformations intermédiaires

### Recommandations
1. Implémenter un système de versioning des schémas
2. Ajouter des métadonnées de lignée dans chaque transformation
3. Mettre en place des alertes automatiques sur les changements de schéma`,
  },
  'data-lineage-en': {
    plan: 'Analyze data lineage: (1) parse SQL scripts, (2) extract table relationships, (3) build dependency graph, (4) identify change impacts.',
    result: `## Data Lineage Analysis Report

### Dependency Graph (Mermaid)
\`\`\`mermaid
graph LR
    SOURCE_A --> TRANSFORM_1
    SOURCE_B --> TRANSFORM_1
    TRANSFORM_1 --> AGGREGATE_2
    AGGREGATE_2 --> FINAL_TABLE
\`\`\`

### Impact Analysis
Changes to **TRANSFORM_1** affect: AGGREGATE_2, FINAL_TABLE (downstream).

### Identified Risks
- Tight coupling between transform layers
- Missing test coverage for stored procedures
- No change-data-capture mechanism

### Recommendations
1. Add schema versioning with migration scripts
2. Implement lineage metadata tagging
3. Set up automated regression tests for ETL pipelines`,
  },
  'backlog-forge': {
    plan: 'Générer les artefacts de gestion de projet : (1) analyser la source, (2) extraire les tâches, (3) estimer l\'effort, (4) structurer le backlog.',
    result: `## BACKLOG-FORGE – Artefacts Générés

### Tableau Agile (Sprint 2 semaines)

| No. | Epic | Tâche | Sous-tâche | Effort (pts) | Priorité | Statut | Sprint |
|:---:|:---:|:---|:---|:---:|:---:|:---:|:---:|
| 1 | Setup | Infrastructure | Configurer CI/CD pipeline | 3 | 🔴 Haute | ⏳ | S1 |
| 2 | Setup | Infrastructure | Docker containerization | 2 | 🔴 Haute | ⏳ | S1 |
| 3 | Auth | Authentification | Implémenter JWT auth | 5 | 🔴 Haute | ⏳ | S1 |
| 4 | Auth | Authentification | Page login/register | 3 | 🟡 Moyenne | ⏳ | S1 |
| 5 | API | Backend | CRUD endpoints utilisateurs | 5 | 🟡 Moyenne | ⏳ | S2 |
| 6 | UI | Frontend | Dashboard principal | 8 | 🟡 Moyenne | ⏳ | S2 |
| 7 | Tests | QA | Tests unitaires backend | 5 | 🟢 Basse | ⏳ | S2 |
| 8 | Docs | Documentation | README + API docs | 2 | 🟢 Basse | ⏳ | S2 |

### Recommandations
- **Framework** : Agile (Scrum, sprints de 2 semaines)
- **Outil recommandé** : GitHub Projects (intégration native CI/CD)
- **Victoires rapides** : Items 1, 2, 3 pour débloquer toute l'équipe
- **Risques** : Auth sous-estimée — prévoir 2 sprints supplémentaires`,
  },
  'letta-builder': {
    plan: 'Concevoir l\'architecture de l\'agent : (1) analyser les besoins, (2) définir le rôle et les capacités, (3) rédiger le prompt système, (4) configurer les outils.',
    result: `## Architecture Agent – LettaBuilder Output

### Configuration Agent
\`\`\`json
{
  "name": "CustomerSupportAgent",
  "model": "claude-sonnet-4-6",
  "system_prompt": "Tu es un agent de support client...",
  "tools": ["web_search", "crm_lookup", "ticket_create"],
  "memory": {
    "type": "archival",
    "recall_window": 10
  },
  "constraints": {
    "max_tokens": 2048,
    "response_format": "structured"
  }
}
\`\`\`

### Prompt Système Généré
\`\`\`
Tu es un agent de support client expert pour [COMPANY].
Ton rôle est d'aider les clients avec leurs questions et problèmes.
...
\`\`\`

### Meilleures Pratiques Appliquées
- Conception modulaire avec outils découplés
- Mémoire archivale pour la continuité des conversations
- Contraintes claires pour éviter les hallucinations
- Boucles de rétroaction pour l'amélioration continue`,
  },
  'letta-manager': {
    plan: 'Diagnostiquer et résoudre le problème : (1) analyser les logs, (2) identifier la cause racine, (3) proposer des corrections, (4) documenter.',
    result: `## Rapport de Diagnostic – LettaManager

### Problème Identifié
Délai de réponse élevé (>5s) sur l'agent de traitement des requêtes.

### Cause Racine
La mémoire archivale déclenche des recherches sur toute l'histoire à chaque requête.

### Plan d'Action
1. **Immédiat** : Limiter le recall_window à 5 (au lieu de 50)
2. **Court terme** : Indexer la mémoire par catégorie
3. **Long terme** : Implémenter un système de cache

### Métriques Attendues Après Correction
| Métrique | Avant | Après |
|:---|:---:|:---:|
| Temps de réponse moyen | 5.2s | 0.8s |
| Utilisation mémoire | 89% | 45% |
| Taux d'erreur | 2.1% | 0.3% |

### Instructions de Rollback
Si la correction échoue : restaurer recall_window=50 et désactiver l'indexation.`,
  },
  'repo-indexer': {
    plan: 'Indexer le dépôt : (1) scanner la structure, (2) cartographier les points d\'entrée, (3) analyser les dépendances, (4) générer PROJECT_INDEX.',
    result: `## PROJECT_INDEX.md – Rapport d'Analyse

### Résumé du Dépôt
- **Framework** : Node.js + Express
- **Langage principal** : JavaScript (TypeScript partiel)
- **Taille** : 127 fichiers, ~18 000 lignes de code
- **Test coverage** : 67%

### Structure des Répertoires
\`\`\`
src/
├── api/          # 12 fichiers – Routes REST
├── services/     # 8 fichiers  – Logique métier
├── models/       # 5 fichiers  – Schémas DB
├── middleware/   # 4 fichiers  – Auth, logging
└── utils/        # 6 fichiers  – Helpers
tests/            # 23 fichiers
config/           # 3 fichiers
\`\`\`

### Points d'Entrée
| Fichier | Rôle | Dépendances |
|:---|:---|:---|
| src/server.js | Bootstrap Express | express, cors, helmet |
| src/api/routes.js | Routeur principal | 12 sous-routes |

### Fichiers à Haut Risque (Hotspots)
- **src/services/auth.js** : 47 commits en 30j, faible couverture
- **src/models/user.js** : 3 auteurs, modifications fréquentes

### Économie de Tokens
Résumé compressé : ~800 tokens vs ~45 000 tokens pour lecture complète (×56)`,
  },
  'shell-specialist': {
    plan: 'Écrire le script shell : (1) analyser les besoins, (2) choisir le shebang, (3) implémenter avec gestion d\'erreurs, (4) sécuriser, (5) tester.',
    result: `## Script Shell – ShellSpecialist Output

### Script Généré
\`\`\`bash
#!/usr/bin/env bash
# deploy.sh – Script de déploiement sécurisé
# Usage: ./deploy.sh [--env prod|staging] [--dry-run]
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/deploy_$(date +%Y%m%d_%H%M%S).log"

cleanup() {
    local exit_code=$?
    rm -f "\${TMPDIR:-/tmp}/deploy_lock_$$"
    if [[ $exit_code -ne 0 ]]; then
        echo "ERROR: Déploiement échoué (code: $exit_code)" >&2
    fi
}
trap cleanup EXIT INT TERM

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

validate_env() {
    [[ -z "\${1:-}" ]] && { echo "Usage: $0 --env <prod|staging>" >&2; exit 1; }
    [[ "$1" =~ ^(prod|staging)$ ]] || { echo "Env invalide: $1" >&2; exit 1; }
}

main() {
    local env="" dry_run=false
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env) env="$2"; shift 2 ;;
            --dry-run) dry_run=true; shift ;;
            *) echo "Option inconnue: $1" >&2; exit 1 ;;
        esac
    done
    validate_env "$env"
    log "Déploiement vers $env (dry-run: $dry_run)"
}

main "$@"
\`\`\`

### Checklist ShellCheck ✅
- [x] Variables citées avec double guillemets
- [x] set -euo pipefail activé
- [x] Trap EXIT pour nettoyage
- [x] Validation des arguments
- [x] Messages d'erreur vers stderr`,
  },
  'devops-deps': {
    plan: 'Gérer les dépendances : (1) analyser l\'état actuel, (2) auditer les CVE, (3) proposer les mises à jour, (4) fournir les commandes.',
    result: `## Rapport de Gestion des Dépendances

### État Actuel
| Catégorie | Nombre | À Mettre à Jour | Vulnérabilités |
|:---|:---:|:---:|:---:|
| Dépendances prod | 24 | 7 | 2 critiques |
| Dépendances dev | 18 | 4 | 0 |
| **Total** | **42** | **11** | **2 critiques** |

### Vulnérabilités Critiques
| Paquet | Version | CVE | Gravité | Correction |
|:---|:---|:---|:---|:---|
| lodash | 4.17.19 | CVE-2021-23337 | CRITIQUE | Mettre à jour v4.17.21+ |
| follow-redirects | 1.14.7 | CVE-2023-26159 | HAUTE | Mettre à jour v1.15.4+ |

### Commandes de Mise à Jour
\`\`\`bash
# 1. Sauvegarder le lockfile
cp package-lock.json package-lock.json.bak

# 2. Corriger les vulnérabilités critiques
npm audit fix --force

# 3. Mettre à jour les patchs sécurisés
npm update lodash follow-redirects

# 4. Vérifier les régressions
npm test

# 5. Re-audit
npm audit
\`\`\`

### Instructions de Rollback
\`\`\`bash
cp package-lock.json.bak package-lock.json && npm ci
\`\`\``,
  },
  'x-scraper': {
    plan: 'Intégrer l\'API X/Twitter : (1) identifier les endpoints, (2) générer le code, (3) gérer les rate limits, (4) valider les résultats.',
    result: `## Intégration API X via Xquik

### Code d'Intégration
\`\`\`javascript
// Recherche de tweets avec l'API Xquik
const XQUIK_BASE = 'https://xquik.com/api/v1';
const headers = {
    'x-api-key': process.env.XQUIK_API_KEY,
    'Content-Type': 'application/json'
};

async function searchTweets(query, options = {}) {
    const params = new URLSearchParams({
        query,
        limit: options.limit || 100,
        lang: options.lang || 'fr',
        ...options
    });

    const res = await fetch(\`\${XQUIK_BASE}/x/tweets/search?\${params}\`, { headers });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(\`Xquik error: \${err.error_code}\`);
    }
    return res.json();
}

// Extraction bulk (jusqu'à 1K)
async function bulkExtract(tweetUrl, type = 'reply_extractor') {
    // 1. Estimer d'abord
    const estimate = await fetch(\`\${XQUIK_BASE}/extractions/estimate\`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type, tweetUrl })
    }).then(r => r.json());

    console.log(\`Coût estimé: \${estimate.credits} crédits\`);
    // 2. Créer l'extraction après confirmation utilisateur
}
\`\`\`

### Endpoints Utilisés
| Action | Endpoint | Coût/appel |
|:---|:---|:---:|
| Recherche tweets | GET /x/tweets/search | 1-3 crédits |
| Profil utilisateur | GET /x/users/{username} | 1 crédit |
| Extraction replies | POST /extractions | 1-5/résultat |

### Estimation Coûts
Pour 1000 tweets/jour : ~0.15$ (vs 10$ API officielle X)`,
  },
};

const SUPER_AGENT_PLAN_TEMPLATE = (task, agents) => `## Plan d'Exécution Super-Agent

### Tâche Analysée
> ${task}

### Agents Sélectionnés (${agents.length})
${agents.map((a, i) => `${i + 1}. **${a.name}** (${a.id}) – ${a.description.split('.')[0]}`).join('\n')}

### Séquence d'Exécution
\`\`\`
[Étape 1] Analyse de la demande par le Super-Agent
     ↓
${agents.map((a, i) => `[Étape ${i + 2}] ${a.name}\n     ↓`).join('\n')}
[Étape ${agents.length + 2}] Synthèse et rapport final
\`\`\`

### Estimations
- **Durée estimée** : ${agents.length * 2}–${agents.length * 5} minutes
- **Mode d'exécution** : Mock (sans clé API)
- **Artefacts attendus** : ${agents.length} rapports + 1 synthèse finale
`;

function getMockPlan(task, agents) {
  return SUPER_AGENT_PLAN_TEMPLATE(task, agents);
}

function getMockResult(agentId) {
  const response = MOCK_RESPONSES[agentId];
  if (!response) {
    return {
      plan: `Exécution de l'agent ${agentId} en cours...`,
      result: `## Résultat Mock\n\nL'agent **${agentId}** a traité votre demande avec succès.\n\nRésultat simulé : les données ont été analysées et le rapport a été généré.\n\n*Mode mock actif – connectez un fournisseur IA pour des résultats réels.*`,
    };
  }
  return response;
}

module.exports = { getMockPlan, getMockResult, MOCK_RESPONSES };
