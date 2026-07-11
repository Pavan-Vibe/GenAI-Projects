"""Fetches a minimal, PHI-conscious summary of a patient for prompt personalization.

Design choice: we deliberately do NOT pull every column (phone, exact zip,
insurance type, provider IDs) into the prompt or into stored chat messages.
Only the fields that materially help answer a support question are included.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional

from .database import get_connection


@dataclass
class PatientSummary:
    patient_id: str
    found: bool = False
    age: Optional[int] = None
    gender: Optional[str] = None
    num_chronic_conditions: Optional[int] = None
    has_diabetes: Optional[bool] = None
    active_prescriptions: List[Dict[str, Any]] = field(default_factory=list)
    upcoming_appointments: List[Dict[str, Any]] = field(default_factory=list)
    last_admission: Optional[Dict[str, Any]] = None

    def to_prompt_context(self) -> str:
        if not self.found:
            return "No patient selected. Answer with general, non-personalized guidance."

        lines = [
            f"Age: {self.age}, Gender: {self.gender}",
            f"Chronic conditions on file: {self.num_chronic_conditions}"
            + (", includes diabetes" if self.has_diabetes else ""),
        ]

        if self.active_prescriptions:
            lines.append("Active/recent medications:")
            for rx in self.active_prescriptions:
                lines.append(
                    f"  - {rx['drug_name']} {rx['dosage']} (refills left: {rx['refills']}, "
                    f"ends {rx['end_date']})"
                )
        else:
            lines.append("No active medications on file.")

        if self.upcoming_appointments:
            lines.append("Upcoming appointments:")
            for appt in self.upcoming_appointments:
                lines.append(f"  - {appt['department']} on {appt['appointment_date']} ({appt['status']})")
        else:
            lines.append("No upcoming appointments on file.")

        if self.last_admission:
            a = self.last_admission
            lines.append(
                f"Most recent admission: {a['diagnosis_group']} ({a['admission_type']}), "
                f"discharged {a['discharge_date']}, length of stay {a['length_of_stay']} days, "
                f"readmitted within 30 days: {'yes' if a['readmitted_30d'] else 'no'}"
            )

        return "\n".join(lines)


def get_patient_context(patient_id: Optional[str]) -> PatientSummary:
    if not patient_id:
        return PatientSummary(patient_id="", found=False)

    conn = get_connection()
    try:
        patient_row = conn.execute(
            "SELECT * FROM patients WHERE patient_id = ?", (patient_id,)
        ).fetchone()
        if not patient_row:
            return PatientSummary(patient_id=patient_id, found=False)

        today = date.today().isoformat()

        rx_rows = conn.execute(
            "SELECT drug_name, dosage, refills, end_date FROM prescriptions "
            "WHERE patient_id = ? AND (end_date IS NULL OR end_date >= ?) "
            "ORDER BY start_date DESC LIMIT 5",
            (patient_id, today),
        ).fetchall()

        appt_rows = conn.execute(
            "SELECT department, appointment_date, status FROM appointments "
            "WHERE patient_id = ? AND appointment_date >= ? "
            "ORDER BY appointment_date ASC LIMIT 5",
            (patient_id, today),
        ).fetchall()

        admission_row = conn.execute(
            "SELECT diagnosis_group, admission_type, discharge_date, length_of_stay, readmitted_30d "
            "FROM admissions WHERE patient_id = ? ORDER BY discharge_date DESC LIMIT 1",
            (patient_id,),
        ).fetchone()

        return PatientSummary(
            patient_id=patient_id,
            found=True,
            age=patient_row["age"],
            gender=patient_row["gender"],
            num_chronic_conditions=patient_row["num_chronic_conditions"],
            has_diabetes=bool(patient_row["has_diabetes"]),
            active_prescriptions=[dict(r) for r in rx_rows],
            upcoming_appointments=[dict(r) for r in appt_rows],
            last_admission=dict(admission_row) if admission_row else None,
        )
    finally:
        conn.close()


def search_patients(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Lightweight patient lookup by ID or last name, for the UI's patient picker."""
    conn = get_connection()
    try:
        like = f"%{query}%"
        rows = conn.execute(
            "SELECT patient_id, first_name, last_name, age, gender FROM patients "
            "WHERE patient_id LIKE ? OR last_name LIKE ? OR first_name LIKE ? "
            "LIMIT ?",
            (like, like, like, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
