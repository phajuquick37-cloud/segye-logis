"""
FastAPI 서버
- POST /api/run       : 수동 수집 트리거
- GET  /api/status    : 서버/스케줄러 상태 확인
- GET  /api/health    : 헬스체크 (Docker healthcheck용)

서버 시작:
  Cloud Run: PORT(기본 8080) 리슨 / 로컬: PORT 미설정 시 8000 (main.py --server 참고)
"""

import asyncio
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, BackgroundTasks, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import (
    SCHEDULE_INTERVAL_MINUTES,
    EMAIL_CONFIG,
    EMAIL_FILTER,
    FIREBASE_ADMIN_CONFIG,
    TAX_EMAIL_SINCE_MIN_RAW,
    TAX_REQUIRE_ETAX_OR_NTS_SIGNAL,
    today_kst_date,
    get_effective_mail_window_start_date,
    get_min_issue_date_for_save,
    TAX_MAIL_LOOKBACK_DAYS,
)
from scheduler import start_scheduler, stop_scheduler, get_next_run
from pipeline import run_pipeline, is_running, get_last_pipeline_summary

logger = logging.getLogger(__name__)

TAX_COLLECT_SECRET = (os.environ.get("TAX_COLLECT_SECRET") or "").strip()


def _mask_imap_login(addr: str) -> Optional[str]:
    a = (addr or "").strip()
    if "@" not in a:
        return None
    local, _, domain = a.partition("@")
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"

app = FastAPI(title="세계로지스 세금계산서 API", version="2.0")

# CORS: 관리자 페이지(커스텀 도메인·Vercel·로컬)에서 POST 허용
# (Origin이 목록에 없으면 브라우저에서 "Failed to fetch"만 보임)
_extra = [o.strip() for o in (os.environ.get("CORS_EXTRA_ORIGINS") or "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://세계로지스.com",
        "https://www.세계로지스.com",
        "https://xn--989ax3tm6gxob89q.com",
        "https://www.xn--989ax3tm6gxob89q.com",
        "https://xn--vk1b88f7uf0b7kda.com",
        "https://www.xn--vk1b88f7uf0b7kda.com",
        "https://15887185.co.kr",
        "https://www.15887185.co.kr",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        *_extra,
    ],
    # Vercel(preview·production) 임의 서브도메인
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    )
    if not TAX_COLLECT_SECRET:
        logger.warning(
            "TAX_COLLECT_SECRET 미설정 — POST /api/run 은 URL을 아는 누구나 호출할 수 있습니다. "
            "Cloud Run 환경 변수에 시크릿을 설정하세요."
        )
    start_scheduler(interval_minutes=SCHEDULE_INTERVAL_MINUTES)
    logger.info(
        f"서버 시작 + 스케줄러 가동: 매 {SCHEDULE_INTERVAL_MINUTES}분, "
        f"KST오늘={today_kst_date()}, 메일창={get_effective_mail_window_start_date()}~, "
        f"저장=발행일≧{get_min_issue_date_for_save() or '하한없음'}"
    )

    # 즉시 수집은「지금 수집」과 겹쳐 계속 busy 로 보이기 쉬움 → 기본 90초 후 1회
    async def _initial_run():
        raw = (os.environ.get("TAX_STARTUP_PIPELINE_DELAY_SEC") or "90").strip()
        try:
            delay_sec = max(0, int(raw))
        except ValueError:
            delay_sec = 90
        if delay_sec > 0:
            logger.info(
                "⏳ 초기 수집 전 %ss 대기 (TAX_STARTUP_PIPELINE_DELAY_SEC=0 이면 즉시)",
                delay_sec,
            )
            await asyncio.sleep(delay_sec)
        logger.info("🚀 서버 초기 수집 실행")
        result = await run_pipeline(manual=False)
        logger.info("초기 수집 완료: %s", result)

    asyncio.create_task(_initial_run())


@app.on_event("shutdown")
async def shutdown():
    stop_scheduler()


@app.get("/")
async def root():
    return {
        "service": "세계로지스 세금계산서 자동화 v2",
        "status": "running",
        "endpoints": {
            "GET  /":            "이 안내 페이지",
            "GET  /api/health":  "헬스체크",
            "GET  /api/status":  "스케줄러 상태 확인",
            "POST /api/run":     "수동 즉시 수집 실행",
        },
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.get("/api/status")
async def status():
    m = EMAIL_FILTER.get("imap_since_min_date")
    wstart = get_effective_mail_window_start_date()
    floor = get_min_issue_date_for_save()
    imap_addr = (EMAIL_CONFIG.get("email_address") or "").strip()
    imap_pwd = (EMAIL_CONFIG.get("app_password") or "").strip()
    cred_file = (FIREBASE_ADMIN_CONFIG.get("credentials_file") or "").strip()
    cred_ok = False
    if cred_file:
        cp = Path(cred_file)
        if cp.is_file():
            cred_ok = True
        elif not cp.is_absolute():
            base = Path(__file__).resolve().parent
            cred_ok = (base / cred_file).is_file() or (Path.cwd() / cred_file).is_file()
    return {
        "status": "ok",
        "running": is_running(),
        "next_scheduled_run": get_next_run(),
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "schedule_interval_minutes": SCHEDULE_INTERVAL_MINUTES,
        "collection_min_received": str(m) if m else None,
        "tax_email_since_min": TAX_EMAIL_SINCE_MIN_RAW or None,
        "today_kst": str(today_kst_date()),
        "mail_window_start_kst": str(wstart),
        "mail_lookback_days": TAX_MAIL_LOOKBACK_DAYS,
        "min_invoice_issue_date": str(floor) if floor else None,
        "invoice_subject_strict": bool(
            EMAIL_FILTER.get("invoice_subject_strict", True)
        ),
        "require_etax_or_nts_signal": TAX_REQUIRE_ETAX_OR_NTS_SIGNAL,
        "imap_configured": bool(imap_addr and imap_pwd),
        "imap_server": (EMAIL_CONFIG.get("imap_server") or "").strip() or None,
        "imap_login_masked": _mask_imap_login(imap_addr),
        "firebase_project_id": FIREBASE_ADMIN_CONFIG.get("project_id") or None,
        "firestore_database_id": FIREBASE_ADMIN_CONFIG.get("database_id") or None,
        "google_credentials_file_present": cred_ok,
        "last_pipeline": get_last_pipeline_summary(),
    }


@app.post("/api/run")
async def trigger_run(
    background_tasks: BackgroundTasks,
    x_tax_collect_secret: str | None = Header(None, alias="X-Tax-Collect-Secret"),
):
    """수동 즉시 실행 (백그라운드). TAX_COLLECT_SECRET 설정 시 동일 값을 헤더로 전달해야 함."""
    if TAX_COLLECT_SECRET and (x_tax_collect_secret or "").strip() != TAX_COLLECT_SECRET:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    # 서버 기동 직후 초기 수집·정각 스케줄과 겹치면 흔함 — 409는 Vercel/Admin에서 '실패'로만 보이므로 200으로 안내
    if is_running():
        return {
            "status": "busy",
            "message": "이미 세금계산서 수집이 진행 중입니다. 잠시 후 목록을 확인해 주세요.",
        }

    async def _run():
        result = await run_pipeline(manual=True)
        logger.info(f"수동 실행 완료: {result}")

    background_tasks.add_task(_run)
    return {"status": "started", "message": "세금계산서 수집을 시작했습니다."}
