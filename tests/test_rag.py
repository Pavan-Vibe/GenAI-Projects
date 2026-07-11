import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.rag import PatientSupportRAG

BASE_DIR = Path(__file__).resolve().parents[1]
KB_PATH = BASE_DIR / "data" / "medical_knowledge_base.json"


def test_knowledge_base_loads():
    rag = PatientSupportRAG(kb_path=KB_PATH, index_dir=BASE_DIR / "data" / "faiss_index", top_k=5)
    assert len(rag.articles) > 0
    for article in list(rag.articles.values())[:5]:
        assert "question" in article
        assert "answer" in article
        assert "category" in article


def test_documents_carry_metadata():
    rag = PatientSupportRAG(kb_path=KB_PATH, index_dir=BASE_DIR / "data" / "faiss_index", top_k=5)
    docs = rag._build_documents()
    assert len(docs) == len(rag.articles)
    assert all("id" in d.metadata and "category" in d.metadata for d in docs)


def test_emergency_short_circuits_without_api_call():
    """Emergency guardrail must trigger before any retrieval/LLM call, so this
    must work even with no OPENAI_API_KEY set."""
    rag = PatientSupportRAG(kb_path=KB_PATH, index_dir=BASE_DIR / "data" / "faiss_index", top_k=5)
    result = rag.answer("I think I'm having a heart attack, severe chest pain")
    assert result["escalate"] is True
    assert result["escalation_reason"] == "emergency_symptoms"
    assert result["sources"] == []


def test_out_of_scope_short_circuits():
    rag = PatientSupportRAG(kb_path=KB_PATH, index_dir=BASE_DIR / "data" / "faiss_index", top_k=5)
    result = rag.answer("What disease do I have?")
    assert result["escalate"] is True
    assert result["escalation_reason"] == "clinical_judgment_required"
