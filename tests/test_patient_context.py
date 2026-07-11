import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.database import init_db, load_domain_data
from app.patient_context import get_patient_context, search_patients

init_db()
load_domain_data()


def test_search_patients_by_id():
    results = search_patients("PT000001")
    assert len(results) >= 1
    assert results[0]["patient_id"] == "PT000001"


def test_unknown_patient_not_found():
    summary = get_patient_context("PT999999999")
    assert summary.found is False
    assert "No patient selected" in summary.to_prompt_context() or not summary.found


def test_known_patient_context_has_no_phi_fields():
    summary = get_patient_context("PT000001")
    assert summary.found is True
    text = summary.to_prompt_context()
    # Phone numbers, insurance type, and exact zip should never be injected into prompts.
    assert "insurance" not in text.lower()
    assert "zip" not in text.lower()
    assert "phone" not in text.lower()


def test_no_patient_selected_returns_generic_context():
    summary = get_patient_context(None)
    assert summary.found is False
    assert "No patient selected" in summary.to_prompt_context()
