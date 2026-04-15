# Alarm Security NLP

A natural language security control system. Type plain-English commands to arm/disarm a security system and manage users.

## Quick Start

```bash
docker compose up --build
```

- Frontend: http://localhost:3005
- Backend API: http://localhost:8080
- Health check: http://localhost:8080/healthz

## Development

Requires [pnpm](https://pnpm.io/).

```bash
# Install dependencies
pnpm install

# Run backend (http://localhost:8080)
pnpm --filter backend dev

# Run frontend (http://localhost:3000)
pnpm --filter frontend dev

# Run backend tests
pnpm --filter backend test
```

## Architecture

pnpm monorepo with two packages:

- **`backend/`** — Express + TypeScript REST API with NLP engine
- **`frontend/`** — React + Rsbuild SPA

### NLP Strategies

Controlled by the `NLP_STRATEGY` environment variable:

| Strategy | Description |
|---|---|
| `rule-based` (default) | nlp.js trained model + regex entity extraction |
| `llm` | Claude API — structured JSON response |
| `hybrid` | Rule-based first; escalates to LLM if confidence is low |

Set `LLM_API_KEY` and optionally `CONFIDENCE_THRESHOLD` (default `0.85`) to use LLM or hybrid modes.

### API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Health check — system state, NLP status |
| POST | `/api/arm-system` | Arm the system `{ mode: "away" \| "home" \| "stay" }` |
| POST | `/api/disarm-system` | Disarm the system |
| POST | `/api/add-user` | Add a user `{ name, pin, startTime?, endTime?, permissions? }` |
| POST | `/api/remove-user` | Remove a user `{ name }` or `{ pin }` |
| GET | `/api/list-users` | List all users (PINs masked) |
| POST | `/nl/execute` | Execute a plain-English command `{ text }` |

### Example Commands

```bash
curl -X POST http://localhost:8080/nl/execute \
  -H "Content-Type: application/json" \
  -d '{"text": "arm the system in away mode"}'

curl -X POST http://localhost:8080/nl/execute \
  -d '{"text": "add user Sarah with PIN 4321"}' \
  -H "Content-Type: application/json"

curl -X POST http://localhost:8080/nl/execute \
  -d '{"text": "show me all users"}' \
  -H "Content-Type: application/json"
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Backend listen port |
| `NODE_ENV` | `development` | Environment |
| `NLP_STRATEGY` | `rule-based` | NLP strategy (`rule-based`, `llm`, `hybrid`) |
| `LLM_API_KEY` | — | Anthropic API key (required for `llm`/`hybrid`) |
| `LLM_MODEL` | `claude-sonnet-4-6` | Claude model ID |
| `CONFIDENCE_THRESHOLD` | `0.85` | Hybrid mode fallback threshold |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
