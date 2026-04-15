# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Natural language security control system. Users type plain-English commands (e.g. "arm the system", "add user Sarah with PIN 4321") and the backend parses intent via NLP and executes the corresponding security action. This is a pnpm monorepo with two packages: `backend` (Express + TypeScript) and `frontend` (React + Rsbuild).

## Commands

### From repo root
```bash
pnpm --filter backend dev          # Run backend in dev mode (ts-node)
pnpm --filter frontend dev         # Run frontend dev server (http://localhost:3000)
pnpm --filter backend build        # Compile backend TypeScript → dist/
pnpm --filter frontend build       # Build frontend for production
pnpm --filter backend test         # Run backend tests (vitest)
pnpm --filter backend test:coverage  # Run tests with coverage report
docker compose up --build          # Build and run both services in Docker
docker compose down                # Stop containers
```

### Within `backend/`
```bash
pnpm test                          # Run all tests
pnpm vitest run src/path/to.test.ts  # Run a single test file
pnpm build                         # tsc compile
```

### Within `frontend/`
```bash
pnpm dev                           # Dev server
pnpm build                         # Production build
pnpm lint                          # ESLint
pnpm format                        # Prettier
```

## Architecture

### Services
- **Backend** — `http://localhost:8080` — Express REST API + NLP engine
- **Frontend** — `http://localhost:3000` — React SPA (nginx in Docker)
- Docker: frontend container depends on backend passing its healthcheck (`GET /healthz`)

### Backend structure (to be built out in `backend/src/`)
```
src/
  index.ts              # App entry: wires middleware, awaits NLP init, starts server
  config.ts             # Zod-validated env config (PORT, NLP_STRATEGY, LLM_API_KEY, etc.)
  logger.ts             # Pino structured logger + PIN masking utility
  types.ts              # Shared types: Intent enum, ParsedCommand, SystemState, User
  middleware/
    correlationId.ts    # Generates/propagates X-Correlation-ID, attaches req.log
    requestLogger.ts    # Logs request entry and response finish with duration
    errorHandler.ts     # AppError class + centralized error middleware
    notFoundHandler.ts  # 404 JSON response
    inputValidation.ts  # Max 500 chars, strip HTML, reject empty
  routes/
    apiRoutes.ts        # Direct REST endpoints: /api/arm-system, /api/add-user, etc.
    nlRoutes.ts         # POST /nl/execute — NLP entry point
  services/
    securityService.ts  # In-memory store: system state + users Map; all business logic
    commandRouter.ts    # Maps ParsedCommand intent → securityService call
  nlp/
    nlpStrategy.ts      # Interface: { parse(text): Promise<ParsedCommand>, isReady() }
    ruleBasedStrategy.ts  # nlp.js trained model + chrono-node time extraction
    llmStrategy.ts      # Claude API call returning structured ParsedCommand JSON
    hybridStrategy.ts   # Rule-based first; fall back to LLM if confidence < threshold
    nlpFactory.ts       # Returns strategy based on NLP_STRATEGY env var
```

### Key data flow
```
POST /nl/execute { text }
  → inputValidation middleware
  → NlpStrategy.parse(text) → ParsedCommand { intent, confidence, entities, source }
  → commandRouter → securityService method
  → response { success, data: { input, interpretation, apiCall, result }, correlationId }
```

### NLP strategies (controlled by `NLP_STRATEGY` env var)
- `rule-based` (default) — nlp.js trained on utterances + regex entity extraction
- `llm` — sends text to Claude API, validates JSON response as ParsedCommand
- `hybrid` — rule-based first; if confidence < `CONFIDENCE_THRESHOLD`, escalates to LLM

### Backend TypeScript config
- ESM (`"type": "module"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`)
- Strict mode on
- Source compiled to `dist/`, with source maps and declaration files

### Response shape (all endpoints)
```json
{ "success": true, "data": { ... }, "correlationId": "uuid" }
```
Errors follow the same envelope with `"success": false` and an `errorCode` field.

### In-memory state
`securityService.ts` is the single source of truth — no database. System state and users live in module-level variables. `reset()` method exists for test isolation.

### Testing
- Framework: Vitest
- Integration tests use Supertest against the Express app directly (no running server needed)
- Each test suite calls `securityService.reset()` in `beforeEach` to clear state
