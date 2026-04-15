# Alarm.com — Natural Language Security Control

## Architecture Task Breakdown

---

### Phase 1: Project Scaffolding & Infrastructure

- [ ] Initialize monorepo structure
  ```
  alarm-security-nl/
  ├── backend/
  ├── frontend/
  ├── docker-compose.yml
  ├── README.md
  └── .gitignore
  ```
- [ ] Initialize backend with `npm init`, install core dependencies
  - express, typescript, pino, uuid, zod, cors
  - Dev: vitest, supertest, ts-node, @types/*
- [ ] Initialize frontend with rsbuild React template
  - `npx @rsbuild/create@latest` with React + TypeScript
  - Confirm CSS Modules work out of the box
- [ ] Set up TypeScript config for backend (`tsconfig.json`)
- [ ] Create `Dockerfile` for backend (Node 20 alpine, multi-stage build)
- [ ] Create `Dockerfile` for frontend (Node 20 alpine, build + nginx serve)
- [ ] Create `docker-compose.yml` with both services
  - Backend on port 8080
  - Frontend on port 3005
  - Health check configured for backend container
- [ ] Verify `docker compose up --build` runs both services cleanly

---

### Phase 2: Backend Core — Configuration & Middleware

- [ ] Create `src/config.ts` — centralized config module
  - PORT, NODE_ENV, LOG_LEVEL, NLP_STRATEGY, CORS_ORIGIN
  - LLM_API_KEY, LLM_MODEL, CONFIDENCE_THRESHOLD (defaults for later)
  - Zod validation with fail-fast on invalid config
- [ ] Create `src/logger.ts` — pino structured logger
  - JSON output, configurable log level
  - PIN masking utility function (`4321` → `***1`)
- [ ] Create `src/middleware/correlationId.ts`
  - Check for `X-Correlation-ID` header, generate UUID if missing
  - Attach to `req`, set on response header
  - Create pino child logger with correlationId, attach to `req.log`
- [ ] Create `src/middleware/requestLogger.ts`
  - Log method, path, correlationId on request entry
  - Log status code and duration on response finish
- [ ] Create `src/middleware/errorHandler.ts`
  - Custom `AppError` class (statusCode, errorCode, message)
  - Centralized error middleware with consistent JSON shape
  - Stack trace only in development mode
- [ ] Create `src/middleware/notFoundHandler.ts`
  - Consistent 404 JSON response for unknown routes
- [ ] Create `src/middleware/inputValidation.ts`
  - Max text length validation (500 chars)
  - Empty input rejection
  - Basic sanitization (strip HTML tags from text)
- [ ] Set up Express app with middleware in correct order
  1. CORS
  2. Correlation ID
  3. Request logger
  4. Body parser (with size limit)
  5. Routes
  6. 404 handler
  7. Error handler
- [ ] Implement `GET /healthz` endpoint
  - Return status, uptime, version, nlpStrategy, nlpReady, systemState, userCount

---

### Phase 3: Domain Layer — In-Memory Store & Security Service

- [ ] Create `src/types.ts` — shared type definitions
  ```typescript
  Intent: ARM_SYSTEM | DISARM_SYSTEM | ADD_USER | REMOVE_USER | LIST_USERS | UNKNOWN
  ParsedCommand: { intent, confidence, entities, rawText, source }
  SystemState: { armed: boolean, mode: 'away' | 'home' | 'stay' | null }
  User: { name, pin, startTime, endTime, permissions, createdAt }
  ```
- [ ] Create `src/services/securityService.ts`
  - In-memory store: system state object + Map for users
  - `armSystem(mode)` — set armed state, validate mode enum, handle already-armed
  - `disarmSystem()` — set disarmed, handle already-disarmed
  - `addUser(name, pin, startTime?, endTime?, permissions?)` — validate PIN format (4-6 digits), check duplicate name/PIN, store user
  - `removeUser(name | pin)` — find and remove, error if not found
  - `listUsers()` — return all users with masked PINs
  - `getSystemStatus()` — return current state for health check
  - `reset()` — clear all state (useful for testing)

---

### Phase 4: REST API Endpoints

- [ ] Create `src/routes/apiRoutes.ts`
  - `POST /api/arm-system` — accepts `{ mode }`, calls securityService.armSystem
  - `POST /api/disarm-system` — calls securityService.disarmSystem
  - `POST /api/add-user` — accepts `{ name, pin, startTime, endTime, permissions }`, calls securityService.addUser
  - `POST /api/remove-user` — accepts `{ name }` or `{ pin }`, calls securityService.removeUser
  - `GET /api/list-users` — calls securityService.listUsers
- [ ] Input validation per endpoint (Zod schemas for each request body)
- [ ] Consistent success response shape
  ```json
  {
    "success": true,
    "data": { ... },
    "correlationId": "abc-123"
  }
  ```

---

### Phase 5: NLP Layer — Rule-Based Strategy

- [ ] Install nlp.js (`@nlpjs/core`, `@nlpjs/nlp`, `@nlpjs/lang-en`) and chrono-node
- [ ] Create `src/nlp/nlpStrategy.ts` — strategy interface
  ```typescript
  interface NlpStrategy {
    parse(text: string): Promise<ParsedCommand>;
    isReady(): boolean;
  }
  ```
- [ ] Create `src/nlp/ruleBasedStrategy.ts`
  - Train nlp.js with utterances for each intent at initialization:
    - ARM_SYSTEM: "arm the system", "activate the alarm", "lock it down", "enable security", "set alarm to stay mode", "arm it", "turn on the alarm"
    - DISARM_SYSTEM: "disarm the system", "turn off the alarm", "deactivate", "unlock", "disarm", "sesame open", "turn off security"
    - ADD_USER: "add user", "create user", "add a temporary user", "give access to", "make sure she can arm and disarm"
    - REMOVE_USER: "remove user", "delete user", "revoke access"
    - LIST_USERS: "show me all users", "list users", "who has access"
  - Entity extraction:
    - PIN: regex for 4-6 digit numbers in text
    - Name: word(s) following "user" keyword, or proper nouns near intent
    - Mode: keyword match for "away", "home", "stay" in text
  - Time extraction: run chrono-node on raw text, map to ISO 8601 startTime/endTime
  - Permission extraction: default `["arm", "disarm"]`, parse if explicitly mentioned
  - Confidence score: use nlp.js built-in score
  - Return `ParsedCommand` with `source: "rule-based"`
- [ ] Create `src/nlp/nlpFactory.ts` — factory function
  - Reads `NLP_STRATEGY` from config
  - For now, only returns `RuleBasedStrategy`
  - Placeholder for LLM and hybrid (Phase 7)

---

### Phase 6: NL Execute Endpoint & Command Router

- [ ] Create `src/services/commandRouter.ts`
  - Takes a `ParsedCommand` and calls the appropriate `securityService` method
  - Maps intent to service method + formats entities into the right args
  - Handles `UNKNOWN` intent — returns helpful message with example commands
  - Returns structured result with what was interpreted, what API was called, and the response
- [ ] Create `src/routes/nlRoutes.ts`
  - `POST /nl/execute` — accepts `{ text }`, runs through NLP strategy, passes to command router, returns full response:
    ```json
    {
      "success": true,
      "data": {
        "input": "arm the system",
        "interpretation": {
          "intent": "ARM_SYSTEM",
          "confidence": 0.95,
          "entities": { "mode": "away" },
          "source": "rule-based"
        },
        "apiCall": "POST /api/arm-system",
        "result": { "armed": true, "mode": "away" }
      },
      "correlationId": "abc-123"
    }
    ```
- [ ] Wire NLP strategy initialization into app startup (await training before accepting traffic)

---

### Phase 7: Unit & Integration Tests

- [ ] Configure Vitest (`vitest.config.ts`)
  - Coverage reporting (text + json-summary)
  - Include/exclude patterns
- [ ] **Unit: NLP Rule-Based Strategy** (`nlp-rule-based.test.ts`)
  - ARM_SYSTEM: "arm the system", "activate the alarm", "lock it down", "set alarm to stay mode" (verify mode extraction)
  - DISARM_SYSTEM: "disarm", "turn off the alarm", "deactivate", "sesame open"
  - ADD_USER: "add user John with pin 4321" (verify name + PIN extraction)
  - ADD_USER with time: "add temporary user Sarah pin 5678 from today 5pm to Sunday 10am" (verify chrono-node extraction)
  - REMOVE_USER: "remove user John" (verify name extraction)
  - LIST_USERS: "show me all users", "who has access"
  - UNKNOWN: "what's the weather", "order pizza", gibberish
  - Edge cases: mixed case, extra whitespace, punctuation, polite phrasing
- [ ] **Unit: Security Service** (`security-service.test.ts`)
  - Arm system: default mode, specific mode, already armed
  - Disarm system: when armed, when already disarmed
  - Add user: valid user, duplicate name, duplicate PIN, invalid PIN format
  - Remove user: by name, by PIN, user not found
  - List users: empty list, multiple users, PINs are masked
  - Reset: clears all state
- [ ] **Unit: Utilities** (`utils.test.ts`)
  - PIN masking: "4321" → "***1", "12" → edge case, empty string
  - Input sanitization: strips HTML, trims whitespace
- [ ] **Unit: Config** (`config.test.ts`)
  - Valid defaults, invalid combinations, missing required vars
- [ ] **Integration: API Endpoints** (`api.integration.test.ts`)
  - Full flow via supertest: healthz → arm → add user → list users → remove user → disarm
  - Error cases: empty body, invalid PIN, remove nonexistent user
  - 404 returns JSON, not HTML
  - Correlation ID present on all responses
- [ ] **Integration: NL Execute** (`nl-execute.integration.test.ts`)
  - Send natural language text, assert full response shape
  - Test each intent through `/nl/execute`
  - Error: empty text, text too long
  - Unknown command returns helpful suggestions
- [ ] Add `test` and `test:coverage` scripts to `package.json`

---

### Phase 8: Frontend

- [ ] Set up rsbuild React app with TypeScript + CSS Modules
- [ ] Create `CommandInput` component
  - Text input field + submit button
  - Enter key submits
  - Loading state while request is pending
  - Disable button during loading
- [ ] Create `CommandResult` component
  - Display: original input text, NLP interpretation (intent, confidence, source, entities), API call made, response data
  - Error state display
- [ ] Create `CommandHistory` component (bonus)
  - List of previous commands and results
  - Clickable to re-run a command
- [ ] Create `ExampleCommands` component (bonus)
  - Clickable example command chips/buttons
  - Pre-fills the input field on click
- [ ] Create `SystemStatus` component
  - Shows current armed/disarmed state
  - Shows user count
  - Polls `/healthz` or updates after each command
- [ ] Main `App` component
  - Layout: status bar at top, input area, results/history below
  - API service module for calling `/nl/execute`
  - Error handling for network failures
- [ ] Configure proxy or CORS for backend communication in dev
- [ ] Style with CSS Modules — clean, functional, not fancy

---

### Phase 9: LLM Strategy & Hybrid Mode

- [ ] Install Anthropic SDK or set up fetch-based API client
- [ ] Create `src/nlp/llmStrategy.ts`
  - System prompt: describe intents, entity schema, few-shot examples
  - Send raw text, instruct model to return JSON matching `ParsedCommand`
  - Parse and validate LLM response (handle malformed JSON gracefully)
  - Timeout configuration (3-5 second max)
  - `source: "llm"` on returned ParsedCommand
- [ ] Create `src/nlp/hybridStrategy.ts`
  - Holds references to both RuleBasedStrategy and LlmStrategy
  - Flow: rule-based first → check confidence against threshold → LLM if below
  - Fallback to rule-based result if LLM call fails
  - `source: "rule-based" | "llm" | "rule-based-fallback"` tracking
- [ ] Update `src/nlp/nlpFactory.ts`
  - Support `NLP_STRATEGY=llm` → ResilientLlmStrategy (LLM with rule-based fallback on error)
  - Support `NLP_STRATEGY=hybrid` → HybridStrategy
  - Validate API key presence for LLM/hybrid modes
  - Warn and fallback to rule-based if key missing
- [ ] Add env vars to `docker-compose.yml` (commented out with instructions)
  ```yaml
  # NLP_STRATEGY=hybrid
  # LLM_API_KEY=your-key-here
  # CONFIDENCE_THRESHOLD=0.85
  ```
- [ ] **Unit: LLM Strategy** (`nlp-llm.test.ts`)
  - Mock API call, verify ParsedCommand output
  - Mock malformed JSON response, verify graceful handling
  - Mock network failure, verify error thrown (hybrid catches this)
- [ ] **Unit: Hybrid Strategy** (`nlp-hybrid.test.ts`)
  - High confidence rule-based result → LLM not called
  - Low confidence rule-based result → LLM called and used
  - Low confidence + LLM failure → rule-based result returned as fallback
  - Verify `source` field is set correctly in each scenario

---

### Phase 10: Documentation & Final Polish

- [ ] Write `README.md`
  - TL;DR section at the top (clone, docker compose up, curl commands to verify)
  - Architecture overview with diagram or description
  - NLP strategy explanation and how to switch modes
  - API reference (all endpoints with example requests/responses)
  - Example commands that work well
  - Testing: how to run, what's covered
  - Design decisions and trade-offs
  - What I'd do differently with more time
- [ ] Add `.env.example` file with all env vars and descriptions
- [ ] Final `docker compose up --build` from clean checkout
  - Verify healthz returns healthy
  - Verify `curl` commands from the assessment spec work
  - Verify frontend loads and can send commands
  - Verify tests pass inside container or locally
- [ ] Clean up: remove dead code, console.logs, TODOs
- [ ] Push to public GitHub repo

---

### Priority Order Summary

| Priority | Phase | Effort | Why |
|----------|-------|--------|-----|
| 🔴 P0 | Phase 1 — Scaffolding & Docker | 20 min | Nothing works without this |
| 🔴 P0 | Phase 2 — Config & Middleware | 20 min | Foundation for everything |
| 🔴 P0 | Phase 3 — Domain Layer | 15 min | Core business logic |
| 🔴 P0 | Phase 4 — REST API | 15 min | Required endpoints |
| 🔴 P0 | Phase 5 — Rule-Based NLP | 25 min | The hard differentiator |
| 🔴 P0 | Phase 6 — NL Execute & Router | 15 min | Connects NLP to API |
| 🟡 P1 | Phase 7 — Tests | 25 min | Proves correctness |
| 🟡 P1 | Phase 8 — Frontend | 20 min | Required but keep minimal |
| 🟢 P2 | Phase 9 — LLM & Hybrid | 25 min | Bonus points territory |
| 🟢 P2 | Phase 10 — Docs & Polish | 15 min | First and last impression |
