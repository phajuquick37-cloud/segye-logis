"""
세계로지스 세금계산서 자동화 — 단일 메인 진입점 (main.py)
=========================================================

데이터 흐름 (관리자 페이지 연동 포함):
  1) IMAP: 한메일(Daum)·Gmail 등에서 화물맨·전국24시콜·원콜(ONEBILL) 등 메일 수신
  2) 본문에서 상세보기 URL 추출 → Playwright로 링크 접속
  3) 필요 시 사업자번호 입력·확인·승인/발행 클릭 → 세금계산서 화면/이미지 캡처
  4) OCR·파싱 후 Firestore 컬렉션 ``tax_invoices`` + Storage 에 저장
  5) 세계로지스.com 관리자 페이지는 웹앱이 같은 Firestore DB를 onSnapshot 으로 구독해 즉시 반영
     (별도 HTTP로 “홈페이지로 전송”하는 단계는 없음 — Firestore 가 단일 소스)

Google 연동:
  · 메일 읽기: Gmail REST API 가 아니라 IMAP(앱 비밀번호) — ``TAX_IMAP_EMAIL`` 등
  · DB/스토리지: Firebase Admin SDK + 서비스 계정 JSON — ``TAX_GOOGLE_CREDENTIALS_PATH`` 등
  · 선택: Google Sheets 백업 — gspread + 동일 계정 JSON

실행 예시:
  python main.py --pipeline      # 1회 전체 수집 (IMAP → 캡처 → Firestore tax_invoices)
  python main.py                 # 위와 동일 (--pipeline 생략 시에도 1회 수집)
  python main.py --server          # Cloud Run / 로컬 서버 (FastAPI + 스케줄러)
  python main.py --test            # IMAP + Firebase + Sheets 연결 테스트
  python main.py --check-google    # Firebase/서비스계정·환경 변수 요약 (Gmail API 제외)
  python main.py --url <URL>       # 단일 URL 디버그
"""

import asyncio
import argparse
import json
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


def run_google_env_check() -> None:
    """
    Firebase Admin·서비스 계정·IMAP 환경 점검.
    (Gmail API OAuth 는 이 프로젝트에서 사용하지 않음 — 수집은 IMAP.)
    """
    print("\n" + "=" * 60)
    print("  Google / Firebase 환경 확인 (세금 봇)")
    print("  ※ 메일: IMAP 만 사용  ·  Gmail REST API 미연동")
    print("=" * 60)

    from config import EMAIL_CONFIG, FIREBASE_ADMIN_CONFIG

    addr = (EMAIL_CONFIG.get("email_address") or "").strip()
    srv = (EMAIL_CONFIG.get("imap_server") or "").strip()
    print(f"\n[IMAP] 계정: {addr or '(미설정)'}")
    print(f"       서버: {srv or '(미설정)'} (한메일/다음: 보통 imap.daum.net)")
    if addr.endswith(("@hanmail.net", "@daum.net")):
        print("       → Daum/한메일 계열로 감지됨")

    cred_path = FIREBASE_ADMIN_CONFIG.get("credentials_file") or ""
    print(f"\n[Firebase Admin]")
    print(f"       project_id:   {FIREBASE_ADMIN_CONFIG.get('project_id')}")
    print(f"       database_id:  {FIREBASE_ADMIN_CONFIG.get('database_id') or '(default)'}")
    print(f"       storage_bucket: {FIREBASE_ADMIN_CONFIG.get('storage_bucket')}")
    print(f"       credentials:  {cred_path}")

    base = Path(__file__).resolve().parent
    raw_path = Path()
    if cred_path:
        cand = Path(cred_path)
        if not cand.is_absolute():
            cand = base / cred_path
        if not cand.exists():
            alt = Path.cwd() / Path(cred_path).name
            cand = alt if alt.exists() else cand
        raw_path = cand
    if cred_path and raw_path.exists():
        try:
            with open(raw_path, encoding="utf-8") as f:
                meta = json.load(f)
            ctype = meta.get("type", "")
            cid = meta.get("client_email", "")
            print(f"       JSON type: {ctype} | client_email: {cid[:40]}…" if len(cid) > 40 else f"       JSON type: {ctype} | client_email: {cid}")
            if ctype != "service_account":
                print("       ⚠️  서비스 계정 JSON(type=service_account)인지 확인하세요.")
        except Exception as e:
            print(f"       ⚠️  JSON 읽기 실패: {e}")
    elif cred_path:
        print("       ❌ 서비스 계정 파일을 찾을 수 없습니다.")
    else:
        print("       ❌ credentials 경로 미설정 (TAX_GOOGLE_CREDENTIALS_PATH 등)")

    print("\n[Firestore → 관리자 페이지]")
    print("       컬렉션: tax_invoices")
    print("       웹앱 firebase-applet-config.json 의 projectId·firestoreDatabaseId 가 이 설정과 같아야 합니다.")

    from firebase_writer import _init_firebase
    if _init_firebase():
        print("\n       ✅ Firebase Admin 초기화 성공 (Firestore/Storage 쓰기 가능)")
    else:
        print("\n       ❌ Firebase Admin 초기화 실패")

    print("\n" + "=" * 60)


def run_test() -> None:
    print("\n" + "=" * 60)
    print("  세계로지스 세금계산서 자동화 — 연결 테스트")
    print("=" * 60)

    print("\n[1] IMAP 연결 (한메일·Gmail 등, TAX_IMAP_EMAIL)...")
    from email_reader import EmailReader
    with EmailReader() as reader:
        if reader.mail:
            print("  ✅ IMAP 연결 성공")
            emails = reader.fetch_tax_invoice_emails()
            print(f"  📧 수집 후보 메일: {len(emails)}개")
            for e in emails[:3]:
                links = e.get("links", [])
                print(f"    - [{e['date'][:10]}] {e['subject'][:50]}")
                for l in links[:2]:
                    print(f"      └ [{str(l.get('text', '?'))[:20]}] {l['url'][:60]}")
        else:
            print("  ❌ IMAP 연결 실패 — TAX_IMAP_EMAIL·앱 비밀번호 확인")

    print("\n[2] Firebase Admin (관리자 페이지 tax_invoices 저장 경로)...")
    from firebase_writer import _init_firebase
    if _init_firebase():
        print("  ✅ Firebase 연결 성공")
    else:
        print("  ⚠️  Firebase 미연결 — TAX_GOOGLE_CREDENTIALS_PATH / GOOGLE_APPLICATION_CREDENTIALS")

    print("\n[3] Google Sheets (선택 백업)...")
    from sheets_writer import SheetsWriter
    sw = SheetsWriter()
    if sw.connect():
        print(f"  ✅ Sheets 연결 성공: {sw.get_sheet_url()}")
    else:
        print("  ⚠️  Sheets 미연결 (선택)")

    print("\n[4] Gmail REST API")
    print("  ⏭  사용 안 함 — 메일 수집은 IMAP 전용입니다.")

    print("\n" + "=" * 60)


async def run_url(url: str) -> None:
    from config import STORAGE_CONFIG
    from browser_automation import TaxInvoiceBrowser
    from data_extractor import process_and_save
    from firebase_writer import save_invoices

    print(f"\n단일 URL 처리: {url}\n")
    dummy_email: Dict = {
        "subject": "직접입력",
        "from": "manual@test.com",
        "date": datetime.now().isoformat(),
        "links": [{"url": url, "text": "직접입력", "priority": 1}],
        "rfc_message_id": "",
        "html_body": "",
        "text_body": "",
    }
    out_dir = Path(STORAGE_CONFIG["output_dir"]) / "direct" / datetime.now().strftime("%Y%m%d_%H%M%S")

    async with TaxInvoiceBrowser() as browser:
        results = await browser.process_email(dummy_email, out_dir)

    finals = process_and_save(dummy_email, results)
    ids = save_invoices(finals)
    print(f"\n완료: Firestore tax_invoices 에 {len(ids)}건 저장 (관리자 동기화)")


def run_server() -> None:
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    print(f"\nmain.py --server → FastAPI( api_server:app ) 포트 {port} + 스케줄러")
    uvicorn.run("api_server:app", host="0.0.0.0", port=port, reload=False)


async def run_once() -> None:
    from pipeline import run_pipeline
    result = await run_pipeline(manual=True)
    print(f"\n완료: {result}")


def main() -> None:
    parser = argparse.ArgumentParser(description="세계로지스 세금계산서 자동화 (main.py 단일 진입점)")
    parser.add_argument(
        "--pipeline",
        action="store_true",
        help="전체 1회 실행: IMAP(한메일 등)에서 세금 메일 수집 → 링크·사업자번호·캡처 → "
        "Firestore tax_invoices·Storage (세계로지스.com 관리자와 동일 DB 동기화; 별도 Gmail API 없음)",
    )
    parser.add_argument("--server", action="store_true", help="FastAPI(api_server) + 스케줄러 (Cloud Run 기본)")
    parser.add_argument("--url", help="특정 세금 링크 URL 직접 처리 + Firestore 저장")
    parser.add_argument("--test", action="store_true", help="IMAP + Firebase + Sheets 테스트")
    parser.add_argument(
        "--check-google",
        action="store_true",
        help="Firebase·서비스계정·IMAP 환경 요약 (Gmail API 미사용 명시)",
    )
    parser.add_argument("--log-dir", default="logs")
    args = parser.parse_args()

    setup_logging(args.log_dir)

    if args.check_google:
        run_google_env_check()
    elif args.test:
        run_test()
    elif args.url:
        asyncio.run(run_url(args.url))
    elif args.server:
        run_server()
    elif args.pipeline:
        asyncio.run(run_once())
    else:
        asyncio.run(run_once())


if __name__ == "__main__":
    main()
