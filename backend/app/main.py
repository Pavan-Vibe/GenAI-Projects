import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .auth import authenticate_user, create_session, validate_session
from .database import get_connection, init_db, load_domain_data, seed_demo_user
from .patient_context import get_patient_context, search_patients
from .rag import PatientSupportRAG

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
KB_PATH = DATA_DIR / "medical_knowledge_base.json"
INDEX_DIR = DATA_DIR / "faiss_index"
STATS_PATH = DATA_DIR / "dashboard_stats.json"

app = FastAPI(title="Patient Support Knowledge Assistant")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
seed_demo_user()
load_domain_data()

rag = PatientSupportRAG(
    kb_path=KB_PATH,
    index_dir=INDEX_DIR,
    top_k=5,
    model=os.getenv("CHAT_MODEL", "gpt-4o-mini"),
    embedding_model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
)


def require_user(authorization: Optional[str]) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.replace("Bearer ", "", 1)
    user = validate_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


# -- health / meta ---------------------------------------------------------
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/categories")
def categories() -> Dict[str, List[str]]:
    cats = sorted({a.get("category", "general") for a in rag.articles.values()})
    return {"categories": cats}


# -- auth --------------------------------------------------------------------
@app.post("/login")
def login(payload: Dict[str, str]) -> Dict[str, Any]:
    email = payload.get("email", "")
    password = payload.get("password", "")
    user = authenticate_user(email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_session(user["id"])
    return {"token": token, "user": {"email": user["email"], "full_name": user["full_name"], "role": user["role"]}}


@app.get("/me")
def me(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = require_user(authorization)
    return {"user": {"email": user["email"], "full_name": user["full_name"], "role": user["role"]}}


# -- chats / messages ---------------------------------------------------------
@app.get("/chats")
def chats(authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
    user = require_user(authorization)
    conn = get_connection()
    rows = conn.execute("SELECT * FROM chats WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/chat")
def create_chat(payload: Dict[str, Any], authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = require_user(authorization)
    title = payload.get("title", "New conversation")
    patient_id = payload.get("patient_id")
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO chats (user_id, patient_id, title) VALUES (?, ?, ?)",
        (user["id"], patient_id, title),
    )
    conn.commit()
    chat_id = cursor.lastrowid
    conn.close()
    return {"id": chat_id, "title": title, "patient_id": patient_id}


@app.get("/chat/{chat_id}/messages")
def get_messages(chat_id: int, authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
    require_user(authorization)
    conn = get_connection()
    rows = conn.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC", (chat_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/chat/{chat_id}/message")
def save_message(chat_id: int, payload: Dict[str, Any], authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_user(authorization)
    role = payload.get("role", "assistant")
    content = payload.get("content", "")
    escalated = 1 if payload.get("escalated") else 0
    sources = json.dumps(payload.get("sources", []))
    conn = get_connection()
    conn.execute(
        "INSERT INTO messages (chat_id, role, content, escalated, sources) VALUES (?, ?, ?, ?, ?)",
        (chat_id, role, content, escalated, sources),
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}


# -- patients -----------------------------------------------------------------
@app.get("/patients/search")
def patients_search(q: str = "", authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_user(authorization)
    if not q:
        return {"patients": []}
    return {"patients": search_patients(q)}


@app.get("/patients/{patient_id}/summary")
def patient_summary(patient_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_user(authorization)
    summary = get_patient_context(patient_id)
    if not summary.found:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {
        "patient_id": summary.patient_id,
        "age": summary.age,
        "gender": summary.gender,
        "num_chronic_conditions": summary.num_chronic_conditions,
        "has_diabetes": summary.has_diabetes,
        "active_prescriptions": summary.active_prescriptions,
        "upcoming_appointments": summary.upcoming_appointments,
        "last_admission": summary.last_admission,
    }


# -- assistant -----------------------------------------------------------------
@app.post("/ask")
def ask(payload: Dict[str, Any], authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_user(authorization)
    question = payload.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    patient_id = payload.get("patient_id") or None
    category = payload.get("category") or None

    result = rag.answer(question, patient_id=patient_id, category=category)
    return result


@app.post("/admin/rebuild-index")
def rebuild_index(authorization: Optional[str] = Header(default=None)) -> Dict[str, str]:
    require_user(authorization)
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY is not set. Add it to your .env file before rebuilding the index.",
        )
    try:
        rag.rebuild_index()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to rebuild index: {exc}") from exc
    return {"status": "rebuilt"}


# -- dashboard -----------------------------------------------------------------
@app.get("/stats")
def stats(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_user(authorization)
    if not STATS_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="Dashboard stats not found. Run `python scripts/build_stats.py` first.",
        )
    return json.loads(STATS_PATH.read_text())
