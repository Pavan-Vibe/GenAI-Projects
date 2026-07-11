"""SQLite persistence layer.

Two kinds of data live here:
1. App tables (users, sessions, chats, messages) - created and managed by this app.
2. Domain tables (patients, prescriptions, appointments, admissions) - bulk loaded
   once from the CSV files in /data so the assistant can personalize answers
   without re-reading multi-hundred-thousand-row CSVs on every request.
"""
from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[2]
DB_PATH = BASE_DIR / "data" / "app.db"
DATA_DIR = BASE_DIR / "data"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# CSV files that get mirrored into SQLite for fast patient-context lookups.
DOMAIN_TABLES = {
    "patients": "patients.csv",
    "prescriptions": "prescriptions.csv",
    "appointments": "appointments.csv",
    "admissions": "admissions.csv",
}

CHUNK_SIZE = 20_000


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def init_db() -> None:
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'care_navigator'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            patient_id TEXT,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            escalated INTEGER NOT NULL DEFAULT 0,
            sources TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


def seed_demo_user() -> None:
    conn = get_connection()
    user = conn.execute(
        "SELECT id FROM users WHERE email = ?", ("nurse@careline.health",)
    ).fetchone()
    if not user:
        conn.execute(
            "INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
            (
                "nurse@careline.health",
                hash_password("careline123"),
                "Demo Care Navigator",
                "care_navigator",
            ),
        )
        conn.commit()
    conn.close()


def _table_row_count(conn: sqlite3.Connection, table: str) -> int:
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    except sqlite3.OperationalError:
        return 0


def load_domain_data(force: bool = False) -> None:
    """Bulk load patients/prescriptions/appointments/admissions CSVs into SQLite.

    Idempotent: skipped if the tables are already populated, unless force=True.
    """
    conn = get_connection()
    already_loaded = all(_table_row_count(conn, t) > 0 for t in DOMAIN_TABLES)
    if already_loaded and not force:
        conn.close()
        return

    for table, filename in DOMAIN_TABLES.items():
        csv_path = DATA_DIR / filename
        if not csv_path.exists():
            continue
        conn.execute(f"DROP TABLE IF EXISTS {table}")
        first_chunk = True
        for chunk in pd.read_csv(csv_path, chunksize=CHUNK_SIZE):
            chunk.to_sql(table, conn, if_exists="replace" if first_chunk else "append", index=False)
            first_chunk = False

    # Indexes make per-patient lookups fast even with hundreds of thousands of rows.
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions(patient_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_patients_id ON patients(patient_id)")
    conn.commit()
    conn.close()
