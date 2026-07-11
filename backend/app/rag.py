"""RAG engine over the approved medical knowledge base.

Pipeline: load medical_knowledge_base.json -> wrap each article as a
LangChain Document (with topic/category metadata) -> embed with OpenAI
embeddings -> index in FAISS (persisted to disk so we don't re-embed on
every restart) -> retrieve top-k -> generate a grounded, cited answer with
ChatOpenAI, after guardrails have already cleared the question.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate

from .guardrails import run_guardrails
from .patient_context import get_patient_context

ANSWER_PROMPT = PromptTemplate.from_template(
    """You are a HIPAA-aware patient support knowledge assistant for a hospital
after-discharge support line. You help with medication instructions, symptom
monitoring guidance, appointment logistics, and general education - grounded
ONLY in the approved knowledge base context below.

Strict rules:
- Only use facts present in the knowledge base context. Do not invent clinical guidance.
- Every factual claim must cite the article id it came from, like [Q00123].
- If the context does not answer the question, say so plainly and recommend the
  patient contact their care team - do not guess.
- Never provide a diagnosis, a specific dosage change, or a prognosis. If the
  question edges into clinical judgment, recommend escalation to a provider.
- Be warm, clear, and brief. Avoid jargon.

Patient context (use only to personalize this answer, do not repeat it verbatim
back to the patient unless relevant):
{patient_context}

Knowledge base context:
{context}

Patient question: {question}

Write the answer, then end with a line starting with "Sources:" listing the
article ids you relied on (e.g. Sources: Q00012, Q00045). If you used no
articles, write "Sources: none".
"""
)

NO_CONTEXT_ANSWER = (
    "I couldn't find approved knowledge base content that answers this "
    "clearly. I don't want to guess on health guidance, so I've flagged this "
    "for your care team to follow up with you directly."
)


class PatientSupportRAG:
    def __init__(
        self,
        kb_path: str | Path,
        index_dir: str | Path,
        top_k: int = 5,
        model: str = "gpt-4o-mini",
        embedding_model: str = "text-embedding-3-small",
    ):
        self.kb_path = Path(kb_path)
        self.index_dir = Path(index_dir)
        self.top_k = top_k
        self.model = model
        self.embedding_model = embedding_model
        self.articles: Dict[str, Dict[str, Any]] = {}
        self._vector_store = None
        self._load_articles()

    # -- setup -----------------------------------------------------------
    def _load_articles(self) -> None:
        with self.kb_path.open("r", encoding="utf-8") as handle:
            records = json.load(handle)
        self.articles = {r["id"]: r for r in records}

    def _build_documents(self) -> List[Document]:
        docs = []
        for article in self.articles.values():
            content = f"Q: {article['question']}\nA: {article['answer']}"
            docs.append(
                Document(
                    page_content=content,
                    metadata={
                        "id": article["id"],
                        "category": article.get("category", "general"),
                        "source": article.get("source", "medical_knowledge_base.json"),
                    },
                )
            )
        return docs

    def _get_embeddings(self):
        from langchain_openai import OpenAIEmbeddings

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        return OpenAIEmbeddings(model=self.embedding_model, openai_api_key=api_key)

    def _load_or_build_index(self):
        from langchain_community.vectorstores import FAISS

        embeddings = self._get_embeddings()
        index_marker = self.index_dir / "index.faiss"
        if index_marker.exists():
            self._vector_store = FAISS.load_local(
                str(self.index_dir), embeddings, allow_dangerous_deserialization=True
            )
            return self._vector_store

        docs = self._build_documents()
        self._vector_store = FAISS.from_documents(docs, embeddings)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self._vector_store.save_local(str(self.index_dir))
        return self._vector_store

    @property
    def vector_store(self):
        if self._vector_store is None:
            self._load_or_build_index()
        return self._vector_store

    def rebuild_index(self) -> None:
        """Force a fresh embedding pass, e.g. after the knowledge base is updated."""
        self._vector_store = None
        for f in self.index_dir.glob("*"):
            f.unlink()
        self._load_or_build_index()

    # -- retrieval ---------------------------------------------------------
    def search(self, query: str, category: Optional[str] = None, top_k: Optional[int] = None) -> List[Dict[str, Any]]:
        top_k = top_k or self.top_k
        if not os.getenv("OPENAI_API_KEY"):
            return self._keyword_search(query, category=category, top_k=top_k)

        filt = {"category": category} if category else None
        results = self.vector_store.similarity_search_with_score(query, k=top_k, filter=filt)
        matches = []
        for doc, score in results:
            matches.append(
                {
                    "id": doc.metadata.get("id"),
                    "category": doc.metadata.get("category"),
                    "source": doc.metadata.get("source"),
                    "content": doc.page_content,
                    "score": float(score),
                }
            )
        return matches

    def _keyword_search(self, query: str, category: Optional[str] = None, top_k: int = 5) -> List[Dict[str, Any]]:
        """Simple word-overlap fallback so the app works end-to-end without an
        OpenAI key (e.g. for a first look before wiring up billing)."""
        query_words = {w.lower() for w in query.split() if len(w) > 2}
        scored = []
        for article in self.articles.values():
            if category and article.get("category") != category:
                continue
            text = f"{article['question']} {article['answer']}".lower()
            score = sum(1 for w in query_words if w in text)
            if score > 0:
                scored.append((score, article))
        scored.sort(key=lambda x: x[0], reverse=True)
        matches = []
        for score, article in scored[:top_k]:
            matches.append(
                {
                    "id": article["id"],
                    "category": article.get("category"),
                    "source": article.get("source"),
                    "content": f"Q: {article['question']}\nA: {article['answer']}",
                    "score": float(score),
                }
            )
        return matches

    # -- generation ----------------------------------------------------------
    def answer(
        self,
        question: str,
        patient_id: Optional[str] = None,
        category: Optional[str] = None,
        top_k: Optional[int] = None,
    ) -> Dict[str, Any]:
        guardrail = run_guardrails(question)
        if guardrail.triggered:
            return {
                "answer": guardrail.message,
                "sources": [],
                "escalate": True,
                "escalation_reason": guardrail.reason,
            }

        matches = self.search(question, category=category, top_k=top_k)
        if not matches:
            return {
                "answer": NO_CONTEXT_ANSWER,
                "sources": [],
                "escalate": True,
                "escalation_reason": "no_grounded_content",
            }

        context = "\n\n".join(f"[{m['id']}] ({m['category']}) {m['content']}" for m in matches)
        patient_summary = get_patient_context(patient_id)

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            # Deterministic fallback so the app is still usable/demoable without a key.
            fallback = (
                "OPENAI_API_KEY is not configured, so I can't generate a personalized "
                "answer right now. Here is the most relevant approved guidance:\n\n"
                + "\n\n".join(f"[{m['id']}] {m['content']}" for m in matches)
            )
            return {
                "answer": fallback,
                "sources": [m["id"] for m in matches],
                "escalate": False,
                "escalation_reason": None,
            }

        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(model=self.model, openai_api_key=api_key, temperature=0.2)
        chain = ANSWER_PROMPT | llm | StrOutputParser()
        raw_answer = chain.invoke(
            {
                "patient_context": patient_summary.to_prompt_context(),
                "context": context,
                "question": question,
            }
        )

        return {
            "answer": raw_answer,
            "sources": [m["id"] for m in matches],
            "escalate": False,
            "escalation_reason": None,
        }
