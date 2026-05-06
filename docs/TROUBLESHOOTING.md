# Troubleshooting

## Port Already Used

Set another port before starting:

```powershell
$env:PORT="3002"
.\release\start.ps1 -Mode demo
```

## npm install Fails

Check Node/npm versions:

```powershell
node --version
npm --version
```

Delete only dependency folders you own if needed, then rerun `.\release\install.ps1`.

## Jest on Windows

Use the explicit command:

```powershell
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand
```

## punycode Warning

The Node.js `punycode` deprecation warning comes from dependencies and is non-blocking while tests pass.

## Claude/Codex Usage Limits

Provider limits are external. Switch to `AI_PROVIDER=mock` or local Ollama for demos.

## Missing .env

Run `.\release\install.ps1` or copy `.env.example` to `.env`. Never commit `.env`.

## SQLite Locked

Stop the server, close tools that hold the database file, then restart. SQLite is optional; return to `STORAGE_MODE=json` if needed.

## Ollama Missing

Use demo mode or set `AI_PROVIDER=mock`. For local embeddings, install Ollama, start it, and pull the configured models.
