"""
FastAPI 서버
- POST /api/run       : 수동 수집 트리거
- GET  /api/status    : 서버/스케줄러 상태 확인
- GET  /api/health    : 헬스체크 (Docker healthcheck용)

서버 시작:
  uvicorn api_server:app --host 0.0.0.0 --port 8000
"""

import asyncio
import logging
from datetime import datetime

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from scheduler import start_scheduler, stop_scheduler, get_next_run
from pipeline import run_pipeline, is_running

logger = logging.getLogger(__name__)

app = FastAPI(title="세계로지스 세금계산서 API", version="2.0")

# CORS: 세계로지스.com 프론트에서 호출 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://세계로지스.com",
        "https://xn--989ax3tm6gxob89q.com",
        "http://localhost:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    )
    start_scheduler(interval_minutes=60)
    logger.info("서버 시작 + 스케줄러 가동")

    # 서버 시작 직후 즉시 1회 수집 (60분 대기 없이 바로 시작)
    async def _initial_run():
        logger.info("🚀 서버 시작 직후 초기 수집 실행")
        result = await run_pipeline(manual=False)
        logger.info(f"초기 수집 완료: {result}")

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
    return {
        "status": "ok",
        "running": is_running(),
        "next_scheduled_run": get_next_run(),
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


@app.post("/api/run")
async def trigger_run(background_tasks: BackgroundTasks):
    """수동 즉시 실행 (백그라운드)"""
    if is_running():
        raise HTTPException(status_code=409, detail="현재 실행 중입니다. 잠시 후 다시 시도하세요.")

    async def _run():
        result = await run_pipeline(manual=True)
        logger.info(f"수동 실행 완료: {result}")

    background_tasks.add_task(_run)
    return {"status": "started", "message": "세금계산서 수집을 시작했습니다."}
