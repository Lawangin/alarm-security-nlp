# Alarm.com — Natural Language Security Control

A natural language interface for a security system. Type plain English commands like _"arm the system in stay mode"_ or _"add user Sarah with PIN 4321 from Monday to Friday"_ and the backend parses intent via NLP and executes the corresponding security action.

---

## TL;DR

> **API key:** A throwaway Anthropic API key for hybrid/LLM mode has been provided separately via email. Add it to a `.env` file as shown below before starting. Without it the system still runs fully in rule-based mode.

```bash
git clone <repo-url>
cd alarm-security-nlp

# Rule-based mode — no API key needed
docker compose up --build

# Hybrid mode — rule-based + Claude fallback (recommended)
cp .env.example .env          # paste the provided LLM_API_KEY value
docker compose up --build

# Wait until you see both of these lines in the output before testing:
#   backend   | ... "msg":"backend listening"
#   frontend  | [notice] start worker process ...

# Verify it's healthy
curl http://localhost:8080/healthz

# Send a natural language command
curl -X POST http://localhost:8080/nl/execute \
  -H "Content-Type: application/json" \
  -d '{"text": "arm the system"}'

# Open the UI
open http://localhost:3000
```

---

## Architecture

```
alarm-security-nlp/
├── backend/          Express REST API + NLP engine  (port 8080)
├── frontend/         React SPA served via nginx     (port 3000)
└── docker-compose.yml
```

### Request flow

```
POST /nl/execute { text }
  → inputValidation middleware   (max 500 chars, strip HTML, reject empty)
  → NlpStrategy.parse(text)      → ParsedCommand { intent, confidence, entities, source }
  → commandRouter                → securityService method
  → { success, data: { input, interpretation, apiCall, result }, correlationId }
```

### Backend structure

The backend follows a **domain-driven design** structure — each domain owns its routes, service, and types together in one module folder:

```
src/
  modules/
    system/               ← arm/disarm
      system.routes.ts
      system.service.ts
      system.types.ts
    users/                ← add/remove/list
      users.routes.ts
      users.service.ts
      users.types.ts
    commands/             ← /nl/execute + command routing
      commands.routes.ts
      commands.service.ts
  nlp/                    ← strategy implementations
    nlpStrategy.ts
    ruleBasedStrategy.ts
    llmStrategy.ts
    hybridStrategy.ts
    nlpFactory.ts
  shared/
    middleware/           ← correlation ID, logging, error handling, validation
    config.ts
    logger.ts
    types.ts              ← only truly shared types (Intent enum, ParsedCommand, etc.)
```

Adding a new feature (zones, sensors) means adding one folder under `modules/` without touching anything else. Cross-domain imports are explicit — `commands` imports from `system` and `users` — which keeps dependencies visible and prevents hidden coupling.

All state is in-memory — no database. System state and users live in `securityService.ts`.

---

## NLP Strategies

Controlled by the `NLP_STRATEGY` environment variable.

### `rule-based` (default)

Uses **nlp.js** trained on utterances for each intent. Entity extraction via regex (PIN, mode) and **chrono-node** for time windows. No API key required. Fast and deterministic.

### `llm`

Sends raw text to the **Claude API** (`claude-haiku-4-5` by default). The LLM resolves intent, entities, and complex temporal expressions in one shot. Falls back to rule-based automatically if `LLM_API_KEY` is missing.

### `hybrid` (recommended when you have an API key)

Rule-based first. If confidence falls below `CONFIDENCE_THRESHOLD` (default `0.85`), or if chrono-node would mis-parse the temporal expression, the request escalates to the LLM. If the LLM call fails, the rule-based result is returned with `source: "rule-based-fallback"`.

```
user input
  → rule-based parse
  → confidence ≥ threshold?  → return (source: "rule-based")
  → no → LLM parse
           → success?        → return (source: "llm")
           → failed?         → return (source: "rule-based-fallback")
```

### Switching strategies

**Via the UI** — The frontend shows three strategy buttons (`rule-based`, `hybrid`, `llm`) in the status bar. Click any button to switch strategies at runtime without restarting the server. If no `LLM_API_KEY` is configured, the `hybrid` and `llm` buttons are disabled and only `rule-based` is available.

**Via environment variable** — set before starting the server:

```bash
# .env or inline
NLP_STRATEGY=rule-based        # no key needed
NLP_STRATEGY=llm               # requires LLM_API_KEY
NLP_STRATEGY=hybrid            # requires LLM_API_KEY (recommended)

CONFIDENCE_THRESHOLD=0.85      # 0–1, lower = fewer LLM escalations
LLM_MODEL=claude-haiku-4-5     # cheapest model, sufficient for intent parsing
```

---

## API Reference

All responses use this envelope:

```json
{ "success": true, "data": { ... }, "correlationId": "uuid" }
```

Errors:

```json
{ "success": false, "errorCode": "VALIDATION_ERROR", "message": "...", "correlationId": "uuid" }
```

---

### `GET /healthz`

```bash
curl http://localhost:8080/healthz
```

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptime": 42.3,
    "version": "1.0.0",
    "nlpStrategy": "hybrid",
    "nlpReady": true,
    "systemState": { "armed": false, "mode": null },
    "userCount": 0
  }
}
```

---

### `POST /nl/execute`

Parse and execute a natural language command.

```bash
curl -X POST http://localhost:8080/nl/execute \
  -H "Content-Type: application/json" \
  -d '{"text": "arm the system in away mode"}'
```

```json
{
  "success": true,
  "data": {
    "input": "arm the system in away mode",
    "interpretation": {
      "intent": "ARM_SYSTEM",
      "confidence": 0.97,
      "entities": { "mode": "away" },
      "source": "rule-based"
    },
    "apiCall": "POST /api/arm-system",
    "result": { "armed": true, "mode": "away" }
  },
  "correlationId": "abc-123"
}
```

---

### `POST /api/arm-system`

```bash
curl -X POST http://localhost:8080/api/arm-system \
  -H "Content-Type: application/json" \
  -d '{"mode": "away"}'
```

`mode`: `"away"` | `"home"` | `"stay"` (default: `"away"`)

---

### `POST /api/disarm-system`

```bash
curl -X POST http://localhost:8080/api/disarm-system
```

---

### `POST /api/add-user`

```bash
curl -X POST http://localhost:8080/api/add-user \
  -H "Content-Type: application/json" \
  -d '{"name": "Sarah", "pin": "4321", "startTime": "2026-04-21T09:00:00Z", "endTime": "2026-04-25T18:00:00Z"}'
```

| Field | Required | Description |
|---|---|---|
| `name` | yes | User's name |
| `pin` | yes | 4–6 digit PIN |
| `startTime` | no | ISO 8601 access window start |
| `endTime` | no | ISO 8601 access window end |
| `permissions` | no | Default: `["arm", "disarm"]` |

---

### `POST /api/remove-user`

```bash
curl -X POST http://localhost:8080/api/remove-user \
  -H "Content-Type: application/json" \
  -d '{"name": "Sarah"}'
```

Accepts `{ name }` or `{ pin }`.

---

### `GET /api/list-users`

```bash
curl http://localhost:8080/api/list-users
```

Returns all users with masked PINs (`4321` → `***1`).

---

## Example Commands

These work reliably with any strategy:

```
arm the system
arm in stay mode
activate the alarm in home mode
lock it down

disarm the system
turn off the alarm
deactivate
sesame open

add user Sarah with PIN 4321
add user John with pin 5678

remove user Sarah
delete user John
revoke access for John

show me all users
list users
who has access
```

These require `hybrid` or `llm` mode for reliable entity extraction:

```
add user Sarah with PIN 4321 from Monday to Friday
give Ted access from this Friday to next Monday with pin 3333
add a temporary user Mike pin 9012 from today 9am to tomorrow 6pm
arm it up for the night
make sure she can arm and disarm — her pin is 4321, name is Lisa
```

---

## Testing

```bash
# Run all tests
pnpm --filter backend test

# With coverage report
pnpm --filter backend test:coverage

# Single file
cd backend && pnpm vitest run src/__tests__/nlp-rule-based.test.ts
```

### Coverage

| Suite | Type | What's tested |
|---|---|---|
| `nlp-rule-based.test.ts` | Unit | All intents, entity extraction, chrono-node time parsing, edge cases |
| `security-service.test.ts` | Unit | Arm/disarm, add/remove/list users, PIN validation, duplicates |
| `utils.test.ts` | Unit | PIN masking, input sanitization |
| `config.test.ts` | Unit | Valid defaults, invalid env var combinations |
| `nlp-llm.test.ts` | Unit | Mocked API calls, malformed JSON, network failures |
| `nlp-hybrid.test.ts` | Unit | Confidence routing, LLM fallback, `source` field tracking |
| `api.integration.test.ts` | Integration | Full REST flows via supertest, error cases, correlation IDs |
| `nl-execute.integration.test.ts` | Integration | Each intent through `/nl/execute`, validation errors |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Backend listen port |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Pino log level |
| `NLP_STRATEGY` | `rule-based` | `rule-based` \| `llm` \| `hybrid` |
| `LLM_API_KEY` | — | Anthropic API key (required for `llm`/`hybrid`) |
| `LLM_MODEL` | `claude-haiku-4-5` | Claude model ID |
| `CONFIDENCE_THRESHOLD` | `0.85` | Hybrid mode escalation threshold (0–1) |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |

Copy `.env.example` to `.env` and fill in your API key to use LLM/hybrid mode.

---

## Design Decisions & Trade-offs

**NLP strategy pattern** — Three interchangeable strategies behind a common interface let you swap parsing logic without touching routes, services, or tests. The hybrid mode is the practical default: cheap and deterministic for standard commands, intelligent for edge cases.

**Rule-based NLP over a local LLM (Ollama), with a deliberate escape hatch** — Three factors drove this choice:

- _Build time_ — An Ollama model pull inside a Docker build downloads gigabytes during the interview. The nlp.js model trains in ~13ms from utterances already in the source code. `docker compose up --build` and the backend is ready in seconds.
- _Response latency_ — A local LLM adds 1–10 seconds per request depending on the model and hardware. The rule-based classifier runs in under a millisecond.
- _Accuracy for this domain_ — The security command space is narrow and well-defined: 5 intents, predictable phrasing, structured entities. A rule-based system with good training utterances hits 95% on realistic inputs. A general-purpose LLM doesn't give meaningfully better intent accuracy here — it adds complexity, cost, and latency for the same outcome.

The hybrid strategy is the most honest architectural answer to this tradeoff: rule-based handles the 95% of commands that are direct and unambiguous in under a millisecond; the LLM fallback handles genuinely ambiguous or conversational phrasing (e.g. _"John is going to be here this weekend, give him access"_) where the flexibility actually earns its cost.

**Prompt caching** — The LLM strategy sends the system prompt with `cache_control: ephemeral`. The stable prompt is cached on first use; only the per-request timestamp and user message are re-sent, cutting token costs significantly on repeated calls.

**Hybrid escalation heuristics** — Beyond the confidence threshold, the hybrid strategy also detects temporal expressions chrono-node actively mis-parses (e.g. _"first weekend of May"_) and escalates those unconditionally, preventing silent wrong dates rather than just missing ones.

**Non-contiguous schedules** — _"Add user Sarah on Tuesday and Thursday"_ is explicitly rejected rather than silently storing a wrong time window. A real system would model recurring schedules (cron-style).

**Unit and integration tests over E2E** — The NLP layer is the core business logic and the highest-risk surface: wrong intent classification or missed entity extraction produces silent incorrect behavior. Covering that thoroughly with unit tests (per-strategy, per-intent) and integration tests (full request through Supertest) gave more signal per hour than standing up an E2E suite against Docker would have. If E2E coverage were added, Playwright or Cypress would be the right tools — focused on happy-path flows: submit a command, assert the UI reflects the new system state.

**Structured logging** — Pino with correlation IDs threaded through every request via a child logger. The same `correlationId` appears in request logs, response headers, and the response body, making cross-layer tracing straightforward.

---

## What I'd Do Differently with More Time

- **Persistent storage** — SQLite or PostgreSQL for users and an audit log of all commands.
- **Authentication** — API keys or JWT on all endpoints; role-based access for admin vs. user operations.
- **Scheduled arming/disarming** — Natural language commands like _"arm the system at 11pm every night"_ or _"disarm automatically at 7am on weekdays"_ mapped to a cron-style job scheduler. The NLP layer already understands temporal expressions; the missing piece is a persistent job store and a scheduler (e.g. `node-cron`) to execute them.
- **Recurring access schedules** — Cron-style access windows (_"every weekday 9–5"_, _"every other weekend"_) instead of only contiguous date ranges. Currently rejected with a clear error; the data model and NLP would both need extending.
- **Bulk user operations** — Commands like _"add users Alice with PIN 1234, Bob with PIN 5678, and Carol with PIN 9012"_ or _"remove all temporary users"_. Would require the NLP layer to return a list of parsed entities rather than a single user per command, and the API to accept arrays.
- **User updates** — Commands like _"change Sarah's PIN to 9999"_, _"extend John's access until Friday"_, or _"update Mike's permissions to arm only"_. Needs a `PATCH /api/update-user` endpoint, a new `UPDATE_USER` intent, and entity extraction for the specific field being changed alongside the new value.
- **Zones and sensors** — Arm/disarm individual zones (_"arm just the front door"_, _"disable motion sensor in the garage"_) rather than the whole system. Needs a zone model and zone-aware intents.
- **Access level permissions** — Distinguish between _arm-only_, _disarm-only_, and _full access_ users rather than defaulting everyone to both. The `permissions` field is already modelled; the NLP just needs training on the phrasing.
- **Audit log** — Immutable log of every command, parsed intent, and outcome with timestamps and correlation IDs, queryable through the UI.
- **Streaming UI** — Stream LLM parse results token-by-token so the frontend feels responsive on slow API calls.
- **Retry + circuit breaker** — Exponential backoff and a circuit breaker around Anthropic SDK calls so transient API outages don't cascade into 500s.
- **Telemetry** — Track per-strategy latency, LLM escalation rate, and intent distribution to tune the confidence threshold over time.
- **Test-as-you-go with AI tooling** — Tests were largely written near the end rather than alongside each phase. Using AI-assisted tooling to generate and run tests immediately after each feature would have caught regressions earlier and eliminated the manual verification pass at the end.
