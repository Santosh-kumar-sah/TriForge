# ⚡ TriForge: Production-Grade Hybrid LLM Routing Agent

**TriForge** is a production-grade, token-efficient hybrid LLM routing agent. It dynamically orchestrates user queries between **free/fast local models** (via auto-detected CPU/CUDA/ROCm/MPS hardware or Groq Llama 3.1 8B) and **remote frontier models** (Fireworks AI, OpenAI, Anthropic, or Groq Llama 3.3 70B).

By combining intent-based semantic classification, selective consistency checking, verify-draft verification loops, and local cache layers, TriForge slashes API token costs by up to **80%** while preserving high-tier response accuracy.

---

## 🎯 Positioning & Multi-Hackathon Themes

TriForge features a thin, modular positioning layer allowing it to be adapted for different hackathons, pitch focus areas, and enterprise deployment models without changing the underlying engine:

- 🌿 **[Sustainability & Green AI Focus (`positioning/README-sustainability.md`)](./positioning/README-sustainability.md)** — Focuses on carbon footprint avoidance, real-time kWh energy tracking, and grid power reduction.
- ⚡ **[Developer Tools & Infrastructure Focus (`positioning/README-devtools.md`)](./positioning/README-devtools.md)** — Focuses on drop-in LLM cost optimization middleware, sub-50ms routing overhead, and developer telemetry.
- 💰 **[FinTech & Spend Governance Focus (`positioning/README-fintech.md`)](./positioning/README-fintech.md)** — Focuses on enterprise AI cost governance, audit trails, and token budget management.
- 🔓 **[Open-Source AI Focus (`positioning/README-opensource.md`)](./positioning/README-opensource.md)** — Focuses on pluggable bring-your-own-model (BYOM) architecture and model ecosystem freedom.

---

## 🚀 Key Features & Highlights

- 🧠 **Smart Intent-Based Routing:** Automatically classifies query intent (`coding`, `math`, `reasoning`, `summarization`, `translation`, `extraction`, `conversation`, `creative_writing`, `general_qa`). 
  - Conceptual coding QA (e.g. *"What is a Python list?"*) is routed locally to save tokens.
  - Code generation and synthesis tasks route to high-capability remote models.
- 🖥️ **Hardware Auto-Detection:** Dynamically detects execution backends (`ROCm`, `CUDA`, `MPS`, `NPU`, `CPU`) and applies calibrated hardware power draw profiles.
- 🌱 **Real-Time Green AI & Energy Impact Tracker:** Live dashboard metrics tracking **Energy Conserved (kWh)**, **CO₂ Emissions Avoided (kg)**, and **Smartphone Battery Recharges Offset**.
- 📄 **1-Click Evaluation Report Export:** Export structured Markdown reports (`.md`) containing executive performance summaries, accuracy matrices, latency breakdowns, and eco metrics directly from the Benchmark Harness.
- 🔒 **API Key Privacy Protection & Key Shield:** Server API keys are stored securely on the backend. Responses strictly mask keys as `••••••••`—never leaking prefixes, suffixes, or raw key bytes to browser clients.
- 💬 **Chat Thread Persistence:** Chat history automatically persists in `localStorage` across page navigation with a 1-click Clear Chat feature.
- ⚡ **Verify-Draft Escalation Loop:** When local answers require verification, TriForge submits the local draft alongside the prompt to the remote verifier, instructing it to output only corrections—drastically cutting cloud completion token expenditure.
- ⚡ **Selective Self-Consistency:** Subjective and conversational queries (greetings, translations, summaries) bypass double-sampling consistency loops, saving 50% token cost and preventing false-positive escalations.

---

## 🏗️ Architecture & System Flow

```
                 +---------------------------------------+
                 |          Next.js Client UI            |
                 |  (Dashboard, Chat, Analytics, Settings|
                 |      & Benchmark Harness Report)      |
                 +-------------------+-------------------+
                                     |
                                     v HTTP (REST / SSE Stream)
                 +-------------------+-------------------+
                 |        FastAPI Routing Backend        |
                 |  +---------------------------------+  |
                 |  |       Smart Cache (SQLite)      |  |
                 |  +----------------+----------------+  |
                 |                   | (If Cache Miss)   |
                 |                   v                   |
                 |  +----------------+----------------+  |
                 |  |     Hybrid Routing Engine       |  |
                 |  |  (Intent, Complexity, Length)   |  |
                 |  +----------------+----------------+  |
                 |                   |                   |
                 |         +---------+---------+         |
                 |         |                   |         |
                 |         v (Local)           v (Remote)|
                 |  +------+------+     +------+------+  |
                 |  | Local Engine|     | Pluggable   |  |
                 |  |(CPU/GPU/Ollama)|   | Providers   |  |
                 |  +------+------+     | (Fireworks/ |  |
                 |         |            | OpenAI/etc) |  |
                 |         |            +------+------+  |
                 |         |                   ^         |
                 |         |                   |         |
                 |         +-- Verify-Draft ---+         |
                 |             (Escalation)              |
                 +-------------------+-------------------+
                                     |
                                     v Log Data
                 +-------------------+-------------------+
                 |           SQLite Database             |
                 |    (Requests, Cache, Benchmarks)      |
                 +---------------------------------------+
```

---

## 🛠️ Routing Strategy & Decision Engine

| Query Category | Intent / Length Filter | Route Selected | Rationale |
|---|---|---|---|
| **Conversation / Greeting** | `"hello"`, `"hi"`, etc. | **`LOCAL`** | Bypasses consistency checks; served zero-cost locally |
| **Conceptual Code QA** | `"What is a Python list?"` | **`LOCAL`** | Informational programming QA served locally |
| **Code Synthesis / Debug** | `"Write a python script..."` | **`REMOTE`** | High-complexity code writing requires 70B+ synthesis |
| **Long Context** | `> 75 words` | **`REMOTE`** | Prevents local context overflow and latency degradation |
| **Factual QA / Math** | Standard prompts | **`LOCAL → VERIFY`** | Evaluates local self-consistency; escalates to remote via verify-draft if similarity < 0.8 |

---

## ⚡ Production Performance Optimizations

1. **Hardware Acceleration:** Hardware-detected local inference on CPU, CUDA, ROCm, MPS, or fast cloud fallback via Groq Llama 3.1 8B.
2. **Concurrent Local Sampling:** Parallel execution of self-consistency checks using Python `ThreadPoolExecutor`.
3. **SQLite WAL-Mode:** Enabled Write-Ahead Logging (`PRAGMA journal_mode=WAL`) and 64MB cache size for high-throughput concurrent I/O.
4. **Selective Consistency Bypass:** Low-risk categories (`conversation`, `translation`, `creative_writing`, `summarization`, `extraction`) bypass double-sampling.
5. **Clean Verification Output:** Direct final answer verifier prompts to avoid conversational meta-chatter (*"Confirmed. The draft is correct..."*).

---

## 📂 Project Structure

```
TriForge/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI endpoints (chat, stream, settings, analytics, benchmarks)
│   │   ├── router/       # Hybrid routing engine & metrics estimation
│   │   ├── classifier/   # Intent heuristic & semantic classification engine
│   │   ├── providers/    # Model providers (Groq, Ollama, Fireworks, OpenAI, Anthropic)
│   │   ├── utils/        # Hardware detection & prompt compressor
│   │   ├── database/     # SQLAlchemy models, schemas, and session initialization
│   │   ├── cache/        # Smart SQLite prompt cache
│   │   ├── analytics/    # Analytics engine (costs, token metrics, eco/energy savings)
│   │   └── evaluation/   # Self-consistency and hedging/hallucination checks
│   ├── tests/            # pytest suite
│   ├── Dockerfile        # FastAPI container configuration
│   └── requirements.txt  # Dependencies
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js pages (Dashboard, Chat, Analytics, Benchmarks, Settings)
│   │   ├── components/   # UI components (Sidebar navigation, Motion wrappers)
│   │   └── lib/          # API config helpers
│   ├── Dockerfile        # Next.js container configuration
│   └── package.json      # Dependencies
├── positioning/          # Multi-hackathon theme README variants
│   ├── README-sustainability.md
│   ├── README-devtools.md
│   ├── README-fintech.md
│   └── README-opensource.md
├── docker-compose.yml    # Full-stack orchestrator
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Python:** 3.11+
- **Node.js:** 20+
- **Groq API Key (Free):** Get a free key at [console.groq.com](https://console.groq.com)

### Quick Local Setup

#### 1. Setup Backend:
```bash
cd backend
pip install -r requirements.txt
```
Copy `.env.example` to `.env` in the root directory and add your `GROQ_API_KEY`:
```text
GROQ_API_KEY=gsk_your_groq_api_key_here
```
Run FastAPI server:
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Setup Frontend:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Running with Docker

Build and launch both services using Docker Compose:

```bash
docker compose up --build
```

---

## 🧪 Testing

Run pytest suite for backend router, caching, and provider checks:

```bash
python -m pytest backend/tests/
```
