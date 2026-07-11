"""Safety guardrails for the patient support assistant.

These checks run BEFORE any retrieval or LLM call, so an emergency or
out-of-scope question never depends on model behavior to be caught.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

# Phrases that suggest the patient may be describing a medical emergency.
# Kept broad on purpose - false positives (extra "please call 911" messages)
# are far cheaper than a missed emergency.
EMERGENCY_PATTERNS = [
    r"\bchest pain\b",
    r"\bcan'?t breathe\b|\bdifficulty breathing\b|\bshortness of breath\b|\btrouble breathing\b",
    r"\bsevere bleeding\b|\bwon'?t stop bleeding\b|\bbleeding a lot\b",
    r"\bunconscious\b|\bpassed out\b|\bnot waking up\b|\bunresponsive\b",
    r"\bstroke\b|\bface (is )?drooping\b|\bslurred speech\b|\bsudden numbness\b",
    r"\bsuicid|\bkill myself\b|\bwant to die\b|\bself[- ]harm\b|\bharm myself\b",
    r"\boverdose\b|\btook too many (pills|tablets|medication)\b",
    r"\banaphyla|\bthroat (is )?closing\b|\bsevere allergic reaction\b",
    r"\bseizure\b|\bconvuls",
    r"\bsevere chest pressure\b|\bheart attack\b",
    r"\bcoughing (up )?blood\b|\bvomiting blood\b",
    r"\b911\b|\bemergency room\b|\ber now\b|\bcall an ambulance\b",
]

# Requests that ask the assistant to make a clinical judgment it is not
# approved to make (diagnosis, dosage changes, prognosis).
OUT_OF_SCOPE_PATTERNS = [
    r"\bwhat (disease|condition|illness) do i have\b",
    r"\bdiagnos",
    r"\bshould i (take more|take less|stop taking|increase|decrease)\b",
    r"\bchange my (dose|dosage)\b",
    r"\bam i going to die\b|\bhow long (do|will) i (have|live)\b",
    r"\bis this cancer\b|\bdo i have cancer\b",
    r"\bwhat'?s wrong with me\b",
    r"\bprescribe\b",
]

_EMERGENCY_RE = re.compile("|".join(EMERGENCY_PATTERNS), re.IGNORECASE)
_SCOPE_RE = re.compile("|".join(OUT_OF_SCOPE_PATTERNS), re.IGNORECASE)

EMERGENCY_MESSAGE = (
    "This sounds like it could be a medical emergency. I'm not able to help with "
    "urgent symptoms in this chat. Please call your local emergency number (911 in "
    "the US) or go to the nearest emergency room right away. If you're having "
    "thoughts of harming yourself, you can also call or text 988 (Suicide & Crisis "
    "Lifeline) any time. A member of your care team will also be notified of this "
    "conversation."
)

OUT_OF_SCOPE_MESSAGE = (
    "I can share general, approved educational information, but I'm not able to "
    "diagnose conditions, interpret test results, or change medication doses - "
    "that needs a clinician who can review your full chart. I've flagged this "
    "question for your care team to follow up with you directly. In the meantime, "
    "I'm happy to help with general questions about your appointments, "
    "medications, or discharge instructions."
)


@dataclass
class GuardrailResult:
    triggered: bool
    reason: Optional[str] = None
    message: Optional[str] = None


def check_emergency(text: str) -> GuardrailResult:
    if _EMERGENCY_RE.search(text or ""):
        return GuardrailResult(True, "emergency_symptoms", EMERGENCY_MESSAGE)
    return GuardrailResult(False)


def check_out_of_scope(text: str) -> GuardrailResult:
    if _SCOPE_RE.search(text or ""):
        return GuardrailResult(True, "clinical_judgment_required", OUT_OF_SCOPE_MESSAGE)
    return GuardrailResult(False)


def run_guardrails(text: str) -> GuardrailResult:
    """Run all pre-retrieval guardrails in priority order."""
    emergency = check_emergency(text)
    if emergency.triggered:
        return emergency
    scope = check_out_of_scope(text)
    if scope.triggered:
        return scope
    return GuardrailResult(False)
