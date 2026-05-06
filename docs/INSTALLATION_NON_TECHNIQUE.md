# Installation simple pour Windows

Ce guide s'adresse aux utilisateurs qui veulent lancer Super-Agent Platform sans manipuler le code.

## 1. Telecharger et extraire

1. Recuperer le fichier `super-agent-platform-v2.5.0-phase-8b.zip`.
2. Clic droit -> Extraire tout.
3. Ouvrir le dossier extrait.

## 2. Installer

1. Clic droit dans le dossier -> Ouvrir dans le terminal.
2. Lancer :

```powershell
.\release\install.ps1
```

Le script verifie Node.js, installe les dependances et prepare la configuration locale.

## 3. Lancer en mode demo

```powershell
.\release\demo.ps1
```

Le mode demo ne demande aucune cle API.

## 4. Ouvrir l'application

Aller sur :

```text
http://localhost:3001
```

## 5. Sauvegarder

```powershell
.\release\backup.ps1
```

Les sauvegardes sont placees dans `backups/local/`.

## 6. Arreter

```powershell
.\release\stop.ps1
```

## 7. Desinstaller

```powershell
.\release\uninstall.ps1
```

Par defaut, les donnees locales et `.env` sont conservees.

## 8. Option service Windows

L'installation comme service est optionnelle et reservee aux utilisateurs avances. Elle demande des droits administrateur :

```powershell
.\release\install-service.ps1 -DryRun
```

Retirer le service :

```powershell
.\release\uninstall-service.ps1 -DryRun
```

## Problemes courants

- Si le navigateur ne s'ouvre pas, visiter manuellement `http://localhost:3001`.
- Si le port est occupe, fermer l'autre instance ou changer `PORT`.
- Si Node.js est absent, installer Node.js LTS puis relancer `install.ps1`.
