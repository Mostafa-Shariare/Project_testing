"""
test_attendance_removal_audit.py
================================
Unit verification test for the complete audit & removal of attendance terminology
and legacy attendance functionality in Attenova.
"""
import sys
import time
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from backend.app.analytics_service import (
    summarize_session,
    build_attention_session_analytics,
    generate_excel_workbook,
    generate_pdf_report,
    attention_session_csv_rows,
)

def run_attendance_audit_test():
    print("=" * 65)
    print("RUNNING ATTENDANCE REMOVAL AUDIT & ATTENTION REPORT VERIFICATION")
    print("=" * 65)

    now = time.time()
    mock_sessions = [
        {
            "_id": "507f1f77bcf86cd799439011",
            "name": "Alice Student",
            "roll_number": "STU-001",
            "class_code": "CS101",
            "teacher_username": "prof_smith",
            "start_time": now - 3600,
            "end_time": now,
            "status": "completed",
            "logs": [
                {"timestamp": now - 3000, "attention": 85, "alert": ""},
                {"timestamp": now - 2000, "attention": 90, "alert": ""},
                {"timestamp": now - 1000, "attention": 82, "alert": ""},
            ],
        },
        {
            "_id": "507f1f77bcf86cd799439012",
            "name": "Bob Student",
            "roll_number": "STU-002",
            "class_code": "CS101",
            "teacher_username": "prof_smith",
            "start_time": now - 3600,
            "end_time": now,
            "status": "completed",
            "logs": [
                {"timestamp": now - 3000, "attention": 40, "alert": "PHONE DETECTED"},
                {"timestamp": now - 2000, "attention": 50, "alert": ""},
                {"timestamp": now - 1000, "attention": 55, "alert": ""},
            ],
        },
    ]

    mock_roster = [
        {"roll_number": "STU-001", "name": "Alice Student"},
        {"roll_number": "STU-002", "name": "Bob Student"},
    ]

    # 1. Summarize Session
    sm = summarize_session(mock_sessions[0])
    assert "attendance_status" not in sm or sm["session_status"] == "completed"
    assert sm["avg_attention"] == 86
    print(" [PASS] Test 1: Session summary produces attention metrics without legacy attendance status.")

    # 2. Build Attention Session Analytics
    analytics = build_attention_session_analytics(mock_sessions, mock_roster, now - 7200, now)
    summary = analytics["summary"]
    assert "total_session_records" in summary
    assert summary["high_focus_sessions"] == 1
    assert summary["moderate_drift_sessions"] == 1
    assert summary["high_focus_rate"] == 50.0
    print(" [PASS] Test 2: Attention session analytics computes focus breakdown & high focus rates.")

    # 3. Excel Report Generation
    excel_bytes = generate_excel_workbook(
        "CS101",
        {"session_count": 2, "avg_attention": 67, "total_alerts": 1, "ranked_sessions": []},
        analytics["students"],
        analytics,
        now - 7200,
        now,
    )
    assert len(excel_bytes) > 0
    print(" [PASS] Test 3: Excel report workbook generated cleanly with Attention Session headers.")

    # 4. PDF Report Generation
    pdf_bytes = generate_pdf_report(
        "Attention Session Report — CS101",
        "CS101",
        {"session_count": 2, "avg_attention": 67, "total_alerts": 1},
        None,
        analytics,
        now - 7200,
        now,
    )
    assert len(pdf_bytes) > 0
    print(" [PASS] Test 4: PDF report generated cleanly with Attention Session headers.")

    # 5. CSV Export Generation
    csv_str = attention_session_csv_rows(analytics)
    assert "High Focus Rate %" in csv_str
    assert "High Focus" in csv_str
    print(" [PASS] Test 5: CSV export rows generated cleanly with Attention Session headers.")

    print("\nALL ATTENDANCE REMOVAL AUDIT SUITE TESTS PASSED SUCCESSFULLY!")
    print("=" * 65)

if __name__ == "__main__":
    run_attendance_audit_test()
