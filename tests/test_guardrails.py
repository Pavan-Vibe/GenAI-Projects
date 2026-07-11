import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.guardrails import run_guardrails, check_emergency, check_out_of_scope


def test_emergency_chest_pain():
    r = check_emergency("I have chest pain and can't breathe")
    assert r.triggered
    assert r.reason == "emergency_symptoms"


def test_emergency_self_harm():
    r = check_emergency("I want to kill myself")
    assert r.triggered


def test_out_of_scope_diagnosis():
    r = check_out_of_scope("What disease do I have?")
    assert r.triggered
    assert r.reason == "clinical_judgment_required"


def test_out_of_scope_dosage_change():
    r = check_out_of_scope("Should I take more of my medication?")
    assert r.triggered


def test_benign_question_passes():
    r = run_guardrails("When is my next cardiology appointment?")
    assert not r.triggered


def test_medication_education_passes():
    r = run_guardrails("What are common side effects of metformin?")
    assert not r.triggered


def test_priority_emergency_over_scope():
    # A message that could match both patterns should be treated as an emergency first.
    r = run_guardrails("Should I go to the ER, I have chest pain?")
    assert r.triggered
    assert r.reason == "emergency_symptoms"
