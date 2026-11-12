import sqlite3
import shutil
from datetime import datetime, timezone
from pathlib import Path

def create_sqlite_backup(db_path: str, backup_dir: str) -> str:
    """
    Creates an online, safe snapshot of the SQLite database using the native SQLite backup API.
    Guarantees ACID consistency even while write operations are active.
    """
    source_path = Path(db_path)
    if not source_path.exists():
        raise FileNotFoundError(f"Database file does not exist: {db_path}")

    dest_dir = Path(backup_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup_file = dest_dir / f"clear_term_backup_{timestamp}.db"

    # Use SQLite online backup API
    src_conn = sqlite3.connect(str(source_path))
    dst_conn = sqlite3.connect(str(backup_file))

    try:
        with dst_conn:
            src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

    return str(backup_file)

def restore_sqlite_backup(backup_path: str, target_db_path: str) -> None:
    """
    Restores the SQLite database from a verified backup snapshot.
    """
    src_backup = Path(backup_path)
    if not src_backup.exists():
        raise FileNotFoundError(f"Backup file does not exist: {backup_path}")

    target_path = Path(target_db_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    shutil.copy2(src_backup, target_path)
