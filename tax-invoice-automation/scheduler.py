"""
스케줄러 모듈
APScheduler로 매시간 자동 실행 + 즉시 실행 지원
"""

import asyncio
import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler = None


def run_once():
    """세금계산서 수집 한 번 실행 (스케줄러에서 호출)"""
    logger.info(f"[{datetime.now().strftime('%H:%M')}] 정기 실행 시작")
    try:
        from pipeline import run_pipeline
        asyncio.run(run_pipeline())
    except Exception as e:
        logger.error(f"정기 실행 오류: {e}")


def start_scheduler(interval_minutes: int = 60):
    """백그라운드 스케줄러 시작"""
    global _scheduler
    _scheduler = BackgroundScheduler(timezone="Asia/Seoul")
    _scheduler.add_job(
        run_once,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="invoice_check",
        replace_existing=True,
        max_instances=1,  # 중복 실행 방지
    )
    _scheduler.start()
    logger.info(f"✅ 스케줄러 시작 (매 {interval_minutes}분마다 실행)")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        logger.info("스케줄러 중지")


def get_next_run() -> str:
    global _scheduler
    if not _scheduler:
        return "미시작"
    job = _scheduler.get_job("invoice_check")
    if job and job.next_run_time:
        return job.next_run_time.strftime("%Y-%m-%d %H:%M:%S")
    return "없음"
