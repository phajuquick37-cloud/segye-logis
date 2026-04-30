"""
실행 파이프라인 (공통 로직)
scheduler.py 와 api_server.py 양쪽에서 import해서 사용
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from config import STORAGE_CONFIG, FIREBASE_ADMIN_CONFIG
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

# /api/status · 로그용 — 왜 관리자에 안 보이는지 추적
_last_pipeline_summary: dict = {}


def is_running() -> bool:
    return _running


def get_last_pipeline_summary() -> dict:
    """최근 1회 파이프라인 종료 요약(타임아웃·no_emails·firebase 건수 등)."""
    return dict(_last_pipeline_summary)


def _record_pipeline_done(result: dict, elapsed_sec: float | None = None) -> None:
    global _last_pipeline_summary
    now = datetime.now(tz=timezone.utc).isoformat()
    st = (result or {}).get("status")
    _last_pipeline_summary = {
        "finished_at_utc": now,
        "status": st,
        "firebase": (result or {}).get("firebase"),
        "success": (result or {}).get("success"),
        "fail": (result or {}).get("fail"),
        "message": (result or {}).get("message"),
        "elapsed_sec": (result or {}).get("elapsed_sec", elapsed_sec),
    }


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
    timeout_sec = int(os.environ.get("TAX_PIPELINE_TIMEOUT_SEC", "3300"))

    async def _work() -> dict:
        logger.info(f"{'[수동]' if manual else '[자동]'} 파이프라인 시작")

        # 1. 이메일 수집
        with EmailReader() as reader:
            if not reader.mail:
                return {"status": "email_error", "message": "IMAP 미연결·계정/비밀번호 확인"}
            emails = reader.fetch_tax_invoice_emails()

        logger.info(
            "email_reader 수집 후보 메일 %d건 (제목·발신 힌트·필터 반영)",
            len(emails),
        )
        if not emails:
            logger.info("처리할 새 이메일 없음")
            return {"status": "no_emails", "firebase": 0, "success": 0, "fail": 0}

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
        if not firebase_ids and all_finals:
            n_browser_ok = sum(1 for f in all_finals if f.get("success"))
            logger.warning(
                "Firestore 저장 0건 — 브라우저 성공 %d건 / 후보 %d건 "
                "(실패 건은 success=False·저장필터·중복·발행일 하한·크리덴셜 확인)",
                n_browser_ok,
                len(all_finals),
            )
        elif firebase_ids:
            db_id = FIREBASE_ADMIN_CONFIG.get("database_id") or "(default)"
            logger.info(
                "세계로지스.com 관리자 표시 경로: Firestore 컬렉션 tax_invoices 에 %d건 저장됨 "
                "(Firebase project=%s database=%s — 웹앱 firebase-applet-config.json 의 "
                "projectId·firestoreDatabaseId 와 반드시 동일)",
                len(firebase_ids),
                FIREBASE_ADMIN_CONFIG.get("project_id"),
                db_id,
            )

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

    out: dict
    try:
        out = await asyncio.wait_for(_work(), timeout=float(timeout_sec))
        _record_pipeline_done(out)
        return out
    except asyncio.TimeoutError:
        logger.error("파이프라인 타임아웃 (%ss) — _running 해제 후 재시도 가능", timeout_sec)
        out = {"status": "error", "message": f"pipeline_timeout_{timeout_sec}s"}
        _record_pipeline_done(out)
        return out
    except Exception as e:
        logger.error(f"파이프라인 오류: {e}")
        out = {"status": "error", "message": str(e)}
        _record_pipeline_done(out)
        return out
    finally:
        _running = False
