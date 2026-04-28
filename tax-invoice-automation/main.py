"""
세계로지스 세금계산서 자동화 툴 v2
=====================================
실행 방법:
  python main.py              # 1회 즉시 실행
  python main.py --server     # FastAPI 서버 + 스케줄러 (매시간 자동)
  python main.py --url <URL>  # 특정 URL 직접 처리
  python main.py --test       # 이메일/Firebase 연결 테스트
"""

import asyncio
import argparse
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict


def setup_logging(log_dir: str = "logs") -> logging.Logger:
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    log_file = Path(log_dir) / f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )
    return logging.getLogger(__name__)


# ─── 테스트 ────────────────────────────────────────────────────────────────────

def run_test():
    print("\n" + "="*60)
    print("  세계로지스 세금계산서 자동화 v2 - 연결 테스트")
    print("="*60)

    print("\n[1] Gmail IMAP 연결 테스트...")
    from email_reader import EmailReader
    with EmailReader() as reader:
        if reader.mail:
            print("  ✅ Gmail 연결 성공!")
            emails = reader.fetch_tax_invoice_emails()
            print(f"  📧 처리 대상 메일: {len(emails)}개")
            for e in emails[:3]:
                links = e.get("links", [])
                print(f"    - [{e['date'][:10]}] {e['subject'][:50]}")
                for l in links[:2]:
                    print(f"      └ [{l.get('text','?')[:20]}] {l['url'][:60]}")
        else:
            print("  ❌ Gmail 연결 실패")

    print("\n[2] Firebase Admin SDK 테스트...")
    from firebase_writer import _init_firebase
    if _init_firebase():
        print("  ✅ Firebase 연결 성공!")
    else:
        print("  ⚠️  Firebase 미연결 (google_credentials.json 설정 필요)")

    print("\n[3] Google Sheets 테스트...")
    from sheets_writer import SheetsWriter
    sw = SheetsWriter()
    if sw.connect():
        print(f"  ✅ Sheets 연결 성공: {sw.get_sheet_url()}")
    else:
        print("  ⚠️  Sheets 미연결 (선택사항)")

    print("\n" + "="*60)


# ─── 단일 URL 처리 ─────────────────────────────────────────────────────────────

async def run_url(url: str):
    from config import STORAGE_CONFIG
    from browser_automation import TaxInvoiceBrowser
    from data_extractor import process_and_save
    from firebase_writer import save_invoices

    print(f"\n단일 URL 처리: {url}\n")
    dummy_email = {
        "subject": "직접입력",
        "from": "manual@test.com",
        "date": datetime.now().isoformat(),
        "links": [{"url": url, "text": "직접입력", "priority": 1}],
    }
    out_dir = Path(STORAGE_CONFIG["output_dir"]) / "direct" / datetime.now().strftime("%Y%m%d_%H%M%S")

    async with TaxInvoiceBrowser() as browser:
        results = await browser.process_email(dummy_email, out_dir)

    finals = process_and_save(dummy_email, results)
    ids = save_invoices(finals)
    print(f"\n완료: Firebase {len(ids)}건 저장")


# ─── 서버 모드 ─────────────────────────────────────────────────────────────────

def run_server():
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    print(f"\nFastAPI 서버 시작 (포트 {port}) + 스케줄러 가동")
    uvicorn.run("api_server:app", host="0.0.0.0", port=port, reload=False)


# ─── 1회 즉시 실행 ─────────────────────────────────────────────────────────────

async def run_once():
    from pipeline import run_pipeline
    result = await run_pipeline(manual=True)
    print(f"\n완료: {result}")


# ─── 진입점 ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="세계로지스 세금계산서 자동화 v2")
    parser.add_argument("--server", action="store_true", help="FastAPI 서버 + 스케줄러 모드")
    parser.add_argument("--url", help="직접 처리할 URL")
    parser.add_argument("--test", action="store_true", help="연결 테스트")
    parser.add_argument("--log-dir", default="logs")
    args = parser.parse_args()

    setup_logging(args.log_dir)

    if args.test:
        run_test()
    elif args.url:
        asyncio.run(run_url(args.url))
    elif args.server:
        run_server()
    else:
        # 1회 즉시 실행
        asyncio.run(run_once())


if __name__ == "__main__":
    main()
