# TriForge

TriForge is a hackathon prototype for a hybrid LLM routing gateway. It classifies prompts, tries a low-cost local-first model path for suitable tasks, escalates harder work to cloud providers, records routing metadata, and exposes the results through a FastAPI backend and a Next.js dashboard.

Important implementation note: in the current backend, the default "local" path is a fast/low-cost Groq model (`groq/compound-mini`) rather than on-device inference. An Ollama provider and hardware detection utilities exist, but the main chat route currently uses Groq for the local-first execution path.

## Problem Statement

LLM applications often send every prompt to the same expensive frontier model. That is simple, but it can waste tokens on easy prompts, obscure routing decisions, and make it hard to compare cost, latency, and quality tradeoffs.

TriForge explores a more selective approach:

- classify the user request,
- serve low-risk prompts through a cheaper local-first route,
- escalate code generation, long-context prompts, low-confidence drafts, or flagged responses,
- cache repeated and similar prompts,
- log routing decisions for analytics and demos.

## Solution

TriForge is split into:

- `backend/`: FastAPI API, routing engine, providers, cache, analytics, benchmark runner, security checks, and SQLite/PostgreSQL persistence.
- `frontend/`: Next.js UI for chat, analytics, settings, and benchmark history.
- root scripts: small standalone router/eval prototypes used by the original hackathon experiments.

The primary app flow is:

1. Frontend sends prompts to `/api/chat/stream`.
2. Backend checks prompt safety and cache state.
3. Router classifies the prompt and chooses `local` or `remote`.
4. Local-first prompts may run a self-consistency check for higher-risk categories.
5. Low-confidence or suspicious local drafts escalate to a remote provider.
6. Requests, responses, cache events, thresholds, provider health, and security events are stored for analytics.

## Implemented Features

- Intent classification for coding, math, reasoning, summarization, translation, extraction, conversation, creative writing, and general QA.
- Hybrid routing rules:
  - coding generation/debugging and prompts over 75 words route remote,
  - short and low-to-medium complexity prompts route local-first,
  - self-consistency can escalate local-first math/reasoning work.
- Exact cache using normalized SHA-256 prompt hashes.
- Lightweight semantic cache using a 128-dimensional hashed word/character n-gram vector and cosine similarity.
- Streaming chat endpoint with Server-Sent Events.
- Adaptive per-intent consistency thresholds stored in `router_thresholds`.
- Provider failover manager for Groq, OpenAI, Anthropic, and Fireworks, with provider health and failover logs.
- PromptGuard prompt-injection pattern checks.
- In-memory per-IP rate limiting.
- Hardware detection for CPU, CUDA, ROCm, MPS, and NPU reporting.
- Analytics endpoints for routing, costs, cache performance, threshold adaptation, provider health, and security events.
- Benchmark harness that compares always-local, always-remote, and TriForge router modes when provider API keys are configured.
- Next.js dashboard for chat, analytics, benchmarks, settings, and route inspection.

## Incomplete or Provider-Dependent Areas

- True on-device local inference is not wired into the main chat route. `LocalOllamaProvider` exists, but the configured local-first path uses Groq by default.
- Live chat, self-consistency, escalation, and benchmark runs require valid provider API keys and network access.
- Verify-draft helper methods exist in the provider base class and are used by the benchmark runner. The main chat endpoint currently escalates by sending the original prompt to the remote failover path rather than using the draft as remote verification context.
- Benchmark results are environment-specific. This README intentionally does not include fixed benchmark numbers.
- `backend/triforge.db` is currently tracked in Git even though `*.db` is ignored. It did not contain obvious API key patterns during inspection, but removing tracked database artifacts before public submission is recommended.

## Architecture

```text
Next.js frontend
  -> /api/chat/stream
  -> /api/analytics
  -> /api/benchmark
  -> /api/settings

FastAPI backend
  -> PromptGuard + RateLimiter
  -> SmartCache exact/semantic lookup
  -> SemanticClassifier
  -> RoutingEngine
  -> ConsistencyChecker + HallucinationDetector
  -> ProviderHealthManager failover
  -> SQLite/PostgreSQL persistence
```

## Tech Stack

- Backend: Python 3.11, FastAPI, SQLAlchemy, Pydantic Settings, Requests, Uvicorn
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, Recharts, Framer Motion, Lucide icons
- Database: SQLite locally, PostgreSQL-compatible `DATABASE_URL` for deployment
- Providers: Groq by default, with optional OpenAI, Anthropic, and Fireworks support
- Deployment: Dockerfiles for backend/frontend, `docker-compose.yml`, Render config, Vercel config

## Setup

### 1. Environment

Copy `.env.example` to `.env` and set at least:

```env
GROQ_API_KEY=your_groq_api_key_here
DATABASE_URL=sqlite:///./triforge.db
```

Optional keys:

```env
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
FIREWORKS_API_KEY=your_fireworks_api_key_here
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://localhost:8000/health
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

### 4. Docker Compose

```bash
docker compose up --build
```

The backend runs on `http://localhost:8000` and the frontend on `http://localhost:3000`.

## Demo Instructions

1. Start the backend and frontend.
2. Open `http://localhost:3000/chat`.
3. Try a short factual prompt such as `What is the capital of Japan?`.
4. Try a coding generation prompt such as `Write a Python function for binary search`.
5. Repeat a previous prompt to demonstrate exact cache behavior.
6. Use similar wording for a cached prompt to demonstrate semantic cache behavior.
7. Open Analytics to inspect route counts, cache rate, latency, cost estimates, and compute backend reporting.
8. Open Benchmarks and run a sweep only when provider keys and network access are available.

## Benchmarking

Run from the UI on the Benchmarks page, or call:

```bash
curl -X POST http://localhost:8000/api/benchmark \
  -H "Content-Type: application/json" \
  -d "{\"benchmark_name\":\"Demo Sweep\",\"threshold\":0.8}"
```

Benchmark output is stored in the `benchmarks` table and returned by `/api/benchmarks`. Do not publish benchmark numbers unless you rerun them in the target environment and include the command/configuration used.

## Project Structure

```text
TriForge/
  backend/
    app/
      api/            FastAPI endpoints
      analytics/      Analytics summaries
      benchmark/      Three-mode benchmark runner
      cache/          Exact and semantic cache
      classifier/     Intent classifier
      database/       SQLAlchemy models/session/schemas
      evaluation/     Consistency and hallucination checks
      providers/      Groq, Fireworks, OpenAI, Anthropic, Ollama providers
      router/         Routing engine and adaptive threshold tuner
      security/       PromptGuard and rate limiter
      utils/          Hardware detection and prompt compression
    tests/            Pytest suite
  frontend/
    src/app/          Next.js pages
    src/components/   Shared UI components
    src/lib/          API base URL config
  positioning/        Supporting positioning notes
```

## Verification Commands

```bash
python -m pytest
cd frontend
npm run lint
npm run build
```

Verified in this workspace:

- `python -m pytest`: 13 passed, 1 warning
- `npm run lint`: passed with warnings
- `npm run build`: passed when run outside the sandbox; the sandboxed run reached TypeScript and failed with Windows `spawn EPERM`

## Security Notes

- `.env` is ignored.
- `.env.example` contains placeholders only.
- Provider error messages are sanitized before logging/returning.
- Settings API masks stored keys in responses.
- Source scan found no obvious committed API key patterns.
- `backend/triforge.db` is tracked and should be removed from version control before public release if it may contain real prompts or demo data.

## Roadmap

- Wire `LocalOllamaProvider` or another on-device provider into the main local execution path.
- Use verify-draft in the main chat escalation path, not only the benchmark runner.
- Add isolated integration tests for PromptGuard, rate limiting, provider failover, analytics, and benchmark persistence.
- Remove tracked SQLite databases from the repository and keep only schema/migration or seed fixtures.
- Tighten frontend TypeScript types and clean remaining lint warnings.
- Add deployment-specific configuration for production CORS and persistent database storage.
