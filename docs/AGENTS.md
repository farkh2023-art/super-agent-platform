# Les 10 Agents de la Super-Agent Platform

## Vue d'ensemble

La plateforme dispose de 10 agents spécialisés, chacun expert dans un domaine précis. Tous fonctionnent en mode Mock (sans clé API) et peuvent être connectés à Claude, OpenAI ou Ollama.

---

## Agent 1 : SimAgent – Expert FDTD 🔬
**ID**: `sim-fdtd`  
**Catégorie**: Science & Simulation

Expert en simulation FDTD (Finite-Difference Time-Domain) pour l'analyse des propriétés optiques des nanoparticules. Crée des scripts de simulation pour Lumerical et MEEP.

**Cas d'usage** : Simulation de nanosphères d'or, calcul des sections efficaces d'absorption/diffusion, analyse des résonances plasmoniques.

---

## Agent 2 : DataLineage-FR – Lignée de Données 🗄️
**ID**: `data-lineage-fr`  
**Catégorie**: Data & Analyse

Version française de l'agent d'analyse de lignée de données. Parse des scripts SQL, cartographie les flux source→destination, analyse l'impact des changements.

---

## Agent 3 : DataLineage-EN – Data Lineage Agent 📊
**ID**: `data-lineage-en`  
**Catégorie**: Data & Analysis

Version anglaise. Analyse et rapport sur la lignée de données dans les systèmes de bases de données complexes. Génère des graphes Mermaid et des rapports d'impact.

---

## Agent 4 : BACKLOG-FORGE – Gestion de Projet 📋
**ID**: `backlog-forge`  
**Catégorie**: Project Management

Génère des backlogs structurés, tableaux Kanban, sprints et feuilles de route à partir de n'importe quelle source (PRD, SOW, programme, etc.). Compatible Notion, Sheets, Asana, GitHub.

---

## Agent 5 : LettaBuilder – Créateur d'Agents 🤖
**ID**: `letta-builder`  
**Catégorie**: Agent Management

Méta-agent expert sur Letta. Guide la création de nouveaux agents IA : conception du prompt système, définition des capacités, architecture modulaire.

---

## Agent 6 : LettaManager – Gestionnaire d'Agents ⚙️
**ID**: `letta-manager`  
**Catégorie**: Agent Management

Gestion opérationnelle des agents Letta existants : diagnostics, optimisation des performances, résolution de problèmes, monitoring.

---

## Agent 7 : RepoIndexer – Analyseur de Code 🗂️
**ID**: `repo-indexer`  
**Catégorie**: Development

Expert en analyse et indexation de dépôts de code. Génère des PROJECT_INDEX.md et PROJECT_INDEX.json compressés, cartographie les dépendances et détecte les hotspots.

---

## Agent 8 : ShellSpecialist – Expert Scripts Shell 💻
**ID**: `shell-specialist`  
**Catégorie**: Automation

Expert en scripting shell POSIX. Écrit des scripts bash/zsh robustes avec gestion d'erreurs complète, sécurité (quoting, validation) et compatibilité multiplateforme.

---

## Agent 9 : DevOpsManager – Gestionnaire de Dépendances 📦
**ID**: `devops-deps`  
**Catégorie**: DevOps

Expert DevOps en gestion de paquets (npm, pip, cargo, go mod). Audite les CVE, résout les conflits, optimise les bundles et documente les mises à jour.

---

## Agent 10 : XScraper – Agent X/Twitter 🐦
**ID**: `x-scraper`  
**Catégorie**: Social Media & Data

Intégration complète de l'API X (Twitter) via Xquik. 122 endpoints REST, 23 types d'extraction, webhooks HMAC-SHA256, composition IA de tweets.

---

## Super-Agent Orchestrateur

Le Super-Agent n'est pas un agent séparé — c'est le moteur de planification qui :
1. Analyse la tâche soumise
2. Sélectionne les agents appropriés via analyse de mots-clés
3. Génère un plan d'exécution séquentiel
4. Coordonne l'exécution de chaque agent
5. Synthétise les résultats en artefacts
