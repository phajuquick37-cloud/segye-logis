"""
실행 파이프라인 (공통 로직)
scheduler.py 와 api_server.py 양쪽에서 import해서 사용
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path

from config import STORAGE_CONFIG
from email_reader import EmailReader
from browser_automation import TaxInvoiceBrowser
from data_extractor import process_and_save, save_summary
from firebase_writer import (
    save_invoices,
    check_duplicate,
    check_duplicate_ingest,
    make_ingest_fingerprint,
)
from sheets_writer import SheetsWriter

logger = logging.getLogger(__name__)

_running = False


def is_running() -> bool:
    return _running


async def run_pipeline(manual: bool = False) -> dict:
    """
    전체 파이프라인 실행:
    이메일 수집 → 브라우저 자동화 → OCR 파싱 → Firebase 저장 → Sheets 백업
    """
    global _running
    if _running:
        return {"status": "already_running"}
    _running = True

    start_time = datetime.now()
    summary = {"start": start_time.isoformat(), "success": 0, "fail": 0, "sheet": 0, "firebase": 0}

    try:
        logger.info(f"{'[수동]' if manual else '[자동]'} 파이프라인 시작")

        # 1. 이메일 수집
        with EmailReader() as reader:
            if not reader.mail:
                return {"status": "email_error"}
            emails = reader.fetch_tax_invoice_emails()

        if not emails:
            logger.info("처리할 새 이메일 없음")
            return {"status": "no_emails"}

        # 2. 브라우저 + 파싱
        all_finals = []
        async with TaxInvoiceBrowser() as browser:
            for idx, email_info in enumerate(emails, 1):
                try:
                    dt = datetime.fromisoformat(email_info["date"])
                except Exception:
                    dt = datetime.now()
                out_dir = (
                    Path(STORAGE_CONFIG["output_dir"])
                    / dt.strftime("%Y/%m")
                    / f"email_{idx:03d}"
                )
                results = await browser.process_email(email_info, out_dir)
                finals = process_and_save(email_info, results)

                # 중복 필터링 (승인번호 + 수집 지문: RFC Message-ID + URL + 제목)
                for f in finals:
                    inv_no = f.get("invoice_record", {}).get("invoice_number")
                    fp = make_ingest_fingerprint(
                        f.get("rfc_message_id") or "",
                        f.get("url") or "",
                        str(inv_no or ""),
                        f.get("email_subject") or "",
                    )
                    if inv_no and check_duplicate(inv_no):
                        logger.info(f"중복 건 건너뜀(승인번호): {inv_no}")
                        continue
                    if fp and check_duplicate_ingest(fp):
                        logger.info(f"중복 건 건너뜀(수집지문): {fp[:12]}…")
                        continue
                    all_finals.append(f)

        # 3. Firebase 저장
        firebase_ids = save_invoices(all_finals)
        summary["firebase"] = len(firebase_ids)

        # 4. Google Sheets 백업
        sw = SheetsWriter()
        if sw.connect():
            summary["sheet"] = sw.append_results(all_finals)

        # 5. 요약 파일
        save_summary(all_finals, Path(STORAGE_CONFIG["output_dir"]))

        success = sum(1 for r in all_finals if r.get("success"))
        summary["success"] = success
        summary["fail"] = len(all_finals) - success
        summary["elapsed_sec"] = round((datetime.now() - start_time).total_seconds(), 1)
        logger.info(f"파이프라인 완료: {summary}")
        return {"status": "ok", **summary}

    except Exception as e:
        logger.error(f"파이프라인 오류: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        _running = False
