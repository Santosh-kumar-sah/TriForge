# TriForge — Pluggable Bring-Your-Own-Model (BYOM) Routing Layer

> **Theme Focus: Open-Source AI & Model Ecosystem Freedom**  
> *An open, vendor-neutral routing framework orchestrating local open-weights LLMs with frontier cloud APIs.*

---

## 🔓 Executive Summary

TriForge is a fully open-source, vendor-agnostic routing framework built to promote model ecosystem freedom. It empowers developers to combine open-weights local models (Llama 3, Qwen, Gemma, Mixtral via Ollama/Groq) with commercial frontier models without lock-in or proprietary middleware dependencies.

### Open-Source Highlights
- **100% Open & Modular:** Extensible provider architecture supporting local, cloud, and self-hosted model deployments.
- **Hardware Freedom:** Operates on CPU, NVIDIA CUDA, AMD ROCm, Apple Silicon MPS, or custom NPU hardware.
- **Self-Hostable Infrastructure:** Standard Python/FastAPI backend and React frontend with Docker Compose deployment.

---

## 🏛️ System Architecture

```mermaid
graph TD
    Prompt([User Prompt]) --> Engine[TriForge Open Router]
    Engine --> Classifier[Semantic Classifier]
    
    Classifier -->|Local Open Weights| LocalOllama[Ollama / Local Engine: Llama 3 / Qwen / Gemma]
    Classifier -->|Cloud Open/Closed| CloudAPI[Cloud Providers: Groq / Fireworks / OpenAI / Anthropic]
    
    LocalOllama --> Agreement[Self-Consistency & Hedging Auditor]
    Agreement pass --> Response[Response Output]
    Agreement fail --> Escalation[Verify-Draft Escalation]
    
    Escalation --> Response
    CloudAPI --> Response
```

---

## 🚀 Key Features

1. **Pluggable Provider Architecture:** Clean `BaseProvider` interface allows adding new local engines or API endpoints in under 50 lines of Python.
2. **Local Model First:** Prioritizes local open-weights inference (Llama 3.1 8B, Gemma 2 9B, Mixtral) before resorting to remote APIs.
3. **Open Evaluation Benchmark Harness:** Run automated benchmark sweeps comparing pure local, pure remote, and hybrid routing strategies.
4. **Transparent Explainability:** Every routing decision provides an audit log detailing prompt classification, agreement ratios, and routing rationale.

---

## ⚙️ Quick Start & Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- Free Groq API Key (or local Ollama instance)

### 1. Clone & Configure
```bash
git clone https://github.com/Sarthak752008/TriForge.git
cd TriForge
cp .env.example .env
# Add your GROQ_API_KEY to .env
```

### 2. Launch Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Launch Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` to inspect the Open-Source Model Router UI.

---

## 📑 Multi-Hackathon Positioning Framework
- **[Open-Source AI Focus (Current)](./README-opensource.md)** — Pluggable BYOM architecture.
- **[Sustainability Focus](./README-sustainability.md)** — Green AI & energy tracking.
- **[DevTools & Infra Focus](./README-devtools.md)** — Drop-in cost optimizer for dev teams.
- **[FinTech & Governance Focus](./README-fintech.md)** — AI spend governance for finance.
