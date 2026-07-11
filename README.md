# CareLine - GenAI Patient Support Knowledge Assistant

A HIPAA-aware, retrieval-augmented (RAG) patient support assistant built on the
`genai-patient-support-knowledge-assistant` synthetic dataset. It answers
post-discharge questions - medications, symptom monitoring, appointments -
grounded in an approved knowledge base, personalized with patient-specific
chart data, and with hard-coded safety guardrails that escalate emergencies
and clinical-judgment questions instead of answering them.

Full-stack, LangChain-powered version of the simpler sample project this was
built from: FastAPI + LangChain + FAISS on the backend, React + Vite on the
frontend, with login, per-patient chat history, and an operations dashboard.

## Architecture

```
backend/app/
  main.py             FastAPI app: auth, chats, patient lookup, /ask, /stats
  rag.py               LangChain RAG engine (FAISS + OpenAI embeddings/chat)
  guardrails.py         Emergency + out-of-scope detection (runs BEFORE retrieval)
  patient_context.py    PHI-minimized patient personalization lookups
  auth.py / database.py Session auth + SQLite persistence

frontend/src/App.jsx   React UI: login, dashboard, assistant chat, patient lookup

data/                  The dataset you provided (CSVs + medical_knowledge_base.json)
scripts/build_stats.py Precomputes dashboard aggregates from the large CSVs
tests/                 Pytest suite for guardrails, RAG loading, patient context
```

### How a question is answered

1. **Guardrails first** (`guardrails.py`) - the question is screened for
   emergency symptoms (chest pain, breathing trouble, self-harm, severe
   bleeding, stroke signs, overdose, etc.) and for out-of-scope clinical asks
   (diagnosis, dosage changes, prognosis). Either match returns a fixed
   escalation message immediately - **no model call happens**.
2. **Retrieval** - the question is embedded and matched against a FAISS index
   built from `medical_knowledge_base.json` (1,050 approved articles), with
   optional category filtering (`clinical_care`, `patient_support`,
   `pharmacovigilance`).
3. **Personalization** - if a patient is linked to the conversation, a small,
   deliberately minimal summary (age, gender, chronic condition count,
   active medications, upcoming appointments, most recent admission) is
   pulled from SQLite and added to the prompt. Phone numbers, exact zip
   codes, and insurance details are never included.
4. **Generation** - `gpt-4o-mini` (configurable) generates an answer that
   must cite the knowledge base article ids it used. If no relevant articles
   are retrieved, the assistant says so and escalates rather than guessing.

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt

cp ../.env.example ../.env
# edit ../.env and set OPENAI_API_KEY=sk-...

# Precompute the dashboard charts (reads the big CSVs once, writes a small JSON)
python ../scripts/build_stats.py

uvicorn app.main:app --reload --port 8000
```

On first run, the backend also:
- creates `data/app.db` and loads `patients.csv`, `prescriptions.csv`,
  `appointments.csv`, and `admissions.csv` into SQLite (a few hundred
  thousand rows total - this takes roughly 30-90 seconds the first time,
  then it's skipped on subsequent restarts).
- seeds a demo login: **nurse@careline.health / careline123**
- builds the FAISS index from `medical_knowledge_base.json` on the first
  `/ask` call and caches it to `data/faiss_index/` (needs `OPENAI_API_KEY`
  to embed - this is the only step that spends API credits until you chat).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000`. The Vite dev server proxies `/api/*` to the
FastAPI backend on port 8000 (see `vite.config.js`).

### 3. Run the tests

```bash
pip install -r backend/requirements.txt
pytest tests/ -v
```

The test suite covers guardrail detection, knowledge-base loading, and
patient-context lookups. It does **not** call OpenAI, so it runs fine without
an API key - the guardrail tests specifically check that emergencies and
out-of-scope questions short-circuit before any model call would happen.

## Try it

1. Log in with the demo account.
2. In **Assistant**, optionally search for a patient (try `PT000001`) to
   personalize answers.
3. Ask something like *"What should I do if I miss a dose of my
   medication?"* - you'll get a grounded, cited answer.
4. Ask something like *"I have chest pain and can't breathe"* - it's
   escalated immediately, without ever reaching the model.
5. Check the **Dashboard** for conversation volume, CSAT, escalation rate,
   readmission risk by diagnosis group, and appointment no-show rate - all
   computed from `chat_conversation_metadata.csv`, `agent_performance_sla.csv`,
   `admissions.csv`, and `appointments.csv`.

## Notes on the data

- All data is synthetic (see `data/DATASET_README.txt`).
- `patients.csv` has a small number of duplicate `patient_id` values in the
  synthetic set (a data-generation quirk, not a bug in this app) - the
  lookup returns the first match.
- The knowledge base's `question` field embeds an internal reference/tracking
  code as a prefix; this is left as-is since it doesn't affect retrieval
  quality, but you could strip it in `rag.py` if you want cleaner citations
  shown to users.

## Extending it

- Swap `text-embedding-3-small` / `gpt-4o-mini` via `EMBEDDING_MODEL` /
  `CHAT_MODEL` in `.env`.
- Add more guardrail patterns in `backend/app/guardrails.py` - it's a plain
  regex list, easy to extend or replace with a classifier.
- `POST /admin/rebuild-index` re-embeds the knowledge base if you edit
  `medical_knowledge_base.json`.
