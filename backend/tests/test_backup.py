import sqlite3
import pytest
from pathlib import Path
from app.utils.backup import create_sqlite_backup, restore_sqlite_backup

def test_sqlite_backup_and_recovery(tmp_path):
    # Setup test database
    db_file = tmp_path / "original.db"
    backup_dir = tmp_path / "backups"
    restore_file = tmp_path / "restored.db"

    conn = sqlite3.connect(str(db_file))
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, note TEXT)")
    cursor.execute("INSERT INTO audit_logs (note) VALUES ('CleanTerm Audit Pass 1')")
    conn.commit()
    conn.close()

    # Create backup snapshot
    backup_path = create_sqlite_backup(str(db_file), str(backup_dir))
    assert Path(backup_path).exists()

    # Restore from snapshot
    restore_sqlite_backup(backup_path, str(restore_file))
    assert restore_file.exists()

    # Verify restored data
    r_conn = sqlite3.connect(str(restore_file))
    r_cursor = r_conn.cursor()
    r_cursor.execute("SELECT note FROM audit_logs")
    rows = r_cursor.fetchall()
    r_conn.close()

    assert len(rows) == 1
    assert rows[0][0] == 'CleanTerm Audit Pass 1'
