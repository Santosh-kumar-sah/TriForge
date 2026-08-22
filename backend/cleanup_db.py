"""
TriForge Database Cleanup Script
Deletes records from benchmarks and requests tables with a timestamp from before today's date (keeps only today's data).
Also deletes any orphaned responses from the responses table.
"""

import os
import sys
from datetime import datetime

# Add the backend directory to sys.path to allow imports if run standalone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.session import SessionLocal, engine, Base
from app.database.models import RequestModel, ResponseModel, BenchmarkModel

def cleanup_old_data():
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        print(f"Starting database cleanup for records prior to: {today_start.strftime('%Y-%m-%d %H:%M:%S')}")

        # 1. Clean old benchmarks
        old_benchmarks = db.query(BenchmarkModel).filter(BenchmarkModel.timestamp < today_start).all()
        benchmarks_count = len(old_benchmarks)
        if benchmarks_count > 0:
            db.query(BenchmarkModel).filter(BenchmarkModel.timestamp < today_start).delete(synchronize_session=False)
            print(f"[-] Deleted {benchmarks_count} old benchmark runs.")
        else:
            print("[+] No old benchmark runs to delete.")

        # 2. Clean old requests and their corresponding responses
        old_requests = db.query(RequestModel).filter(RequestModel.timestamp < today_start).all()
        old_req_ids = [r.id for r in old_requests]
        req_count = len(old_req_ids)
        deleted_responses = 0

        if req_count > 0:
            deleted_responses = db.query(ResponseModel).filter(
                ResponseModel.request_id.in_(old_req_ids)
            ).delete(synchronize_session=False)
            db.query(RequestModel).filter(
                RequestModel.id.in_(old_req_ids)
            ).delete(synchronize_session=False)
            print(f"[-] Deleted {req_count} old requests and {deleted_responses} associated responses.")
        else:
            print("[+] No old requests to delete.")

        # 3. Clean any orphaned responses whose request_id no longer exists in requests table
        orphaned_responses = db.query(ResponseModel).filter(
            ~ResponseModel.request_id.in_(db.query(RequestModel.id))
        ).delete(synchronize_session=False)

        if orphaned_responses > 0:
            print(f"[-] Deleted {orphaned_responses} orphaned responses.")
        else:
            print("[+] No orphaned responses found.")

        db.commit()
        print("\n[SUCCESS] Database cleanup completed successfully! Kept only today's data.")
        return {
            "deleted_benchmarks": benchmarks_count,
            "deleted_requests": req_count,
            "deleted_responses": deleted_responses + orphaned_responses
        }
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Database cleanup failed: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_old_data()
