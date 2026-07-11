"""Precompute dashboard aggregate stats from the large CSV files.

The raw CSVs have 100k-300k+ rows each, so we don't want the FastAPI backend
recomputing aggregates on every dashboard load. Run this once (it's also run
automatically by `make setup` / the README instructions) and the backend just
serves the resulting small JSON file.

Usage:
    python scripts/build_stats.py
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
OUTPUT_PATH = DATA_DIR / "dashboard_stats.json"


def build() -> dict:
    chats = pd.read_csv(DATA_DIR / "chat_conversation_metadata.csv", parse_dates=["started_at"])
    sla = pd.read_csv(DATA_DIR / "agent_performance_sla.csv")
    admissions = pd.read_csv(DATA_DIR / "admissions.csv")
    appointments = pd.read_csv(DATA_DIR / "appointments.csv")

    # --- KPI cards ---------------------------------------------------------
    total_conversations = int(len(chats))
    avg_csat = round(float(chats["csat_rating"].mean()), 2)
    escalation_rate = round(float((chats["escalation_reason"].notna() & (chats["escalation_reason"] != "")).mean() * 100), 1)
    resolved_first_contact_rate = round(float(chats["resolved_first_contact"].mean() * 100), 1)
    avg_bot_handled_pct = round(float(chats["bot_handled_pct"].mean()), 1)
    avg_sla_met_pct = round(float(sla["sla_met_pct"].mean()), 1)
    avg_first_response_min = round(float(sla["first_response_time_min"].mean()), 1)

    # --- Conversation volume trend (by month) -------------------------------
    chats["month"] = chats["started_at"].dt.to_period("M").astype(str)
    monthly = (
        chats.groupby("month")
        .agg(conversations=("conversation_id", "count"), avg_csat=("csat_rating", "mean"))
        .reset_index()
        .sort_values("month")
        .tail(12)
    )
    monthly["avg_csat"] = monthly["avg_csat"].round(2)
    trend = monthly.to_dict(orient="records")

    # --- Channel distribution ------------------------------------------------
    channel_counts = chats["channel"].value_counts().reset_index()
    channel_counts.columns = ["name", "value"]
    channel_dist = channel_counts.to_dict(orient="records")

    # --- Intent distribution (top drivers) ------------------------------------
    intent_counts = chats["intent_detected"].value_counts().head(8).reset_index()
    intent_counts.columns = ["name", "value"]
    intent_dist = intent_counts.to_dict(orient="records")

    # --- Sentiment shift (start vs end) --------------------------------------
    sentiment_end_counts = chats["sentiment_end"].value_counts().reset_index()
    sentiment_end_counts.columns = ["name", "value"]
    sentiment_dist = sentiment_end_counts.to_dict(orient="records")

    # --- Readmission risk by diagnosis group ----------------------------------
    readmit = (
        admissions.groupby("diagnosis_group")
        .agg(admissions=("admission_id", "count"), readmit_rate=("readmitted_30d", "mean"))
        .reset_index()
    )
    readmit["readmit_rate"] = (readmit["readmit_rate"] * 100).round(1)
    readmit = readmit.sort_values("admissions", ascending=False)
    readmission_by_diagnosis = readmit.to_dict(orient="records")

    # --- Appointment no-show rate by department -------------------------------
    noshow = (
        appointments.groupby("department")
        .agg(appointments=("appointment_id", "count"), no_show_rate=("no_show", "mean"))
        .reset_index()
    )
    noshow["no_show_rate"] = (noshow["no_show_rate"] * 100).round(1)
    noshow = noshow.sort_values("appointments", ascending=False)
    no_show_by_department = noshow.to_dict(orient="records")

    return {
        "kpis": {
            "total_conversations": total_conversations,
            "avg_csat": avg_csat,
            "escalation_rate_pct": escalation_rate,
            "resolved_first_contact_pct": resolved_first_contact_rate,
            "avg_bot_handled_pct": avg_bot_handled_pct,
            "avg_sla_met_pct": avg_sla_met_pct,
            "avg_first_response_min": avg_first_response_min,
        },
        "conversation_trend": trend,
        "channel_distribution": channel_dist,
        "intent_distribution": intent_dist,
        "sentiment_end_distribution": sentiment_dist,
        "readmission_by_diagnosis": readmission_by_diagnosis,
        "no_show_by_department": no_show_by_department,
    }


def main() -> None:
    stats = build()
    OUTPUT_PATH.write_text(json.dumps(stats, indent=2))
    print(f"Wrote dashboard stats to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
