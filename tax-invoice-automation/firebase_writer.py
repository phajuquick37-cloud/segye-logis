"""
Firebase 연동 모듈
- Firebase Admin SDK로 Firestore tax_invoices 컬렉션에 저장
- Firebase Storage에 스크린샷 이미지 업로드 후 공개 URL 반환
- 입금 상태 업데이트 (status / payer_name / pay_memo)
"""

import logging
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# 스크립트 위치 기준으로 credentials 파일 절대경로 설정
_BASE_DIR = Path(__file__).parent

logger = logging.getLogger(__name__)

# Firebase Admin SDK는 import 시점에 초기화
_firestore_client = None
_storage_bucket = None


def _init_firebase():
    """Firebase Admin SDK 초기화 (최초 1회)"""
    global _firestore_client, _storage_bucket
    if _firestore_client is not None:
        return True
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore, storage as fb_storage
        from config import FIREBASE_ADMIN_CONFIG

        if not firebase_admin._apps:
            # 절대경로로 credentials 파일 탐색
            cred_file = FIREBASE_ADMIN_CONFIG["credentials_file"]
            cred_path = Path(cred_file)
            if not cred_path.is_absolute():
                # 스크립트 위치 기준 → 현재 작업 디렉토리 순으로 탐색
                candidates = [
                    _BASE_DIR / cred_file,
                    Path.cwd() / cred_file,
                    Path.home() / cred_file,
                ]
                for c in candidates:
                    if c.exists():
                        cred_path = c
                        break
            logger.info(f"credentials 파일 경로: {cred_path}")
            cred = credentials.Certificate(str(cred_path))
            firebase_admin.initialize_app(
                cred,
                {"storageBucket": FIREBASE_ADMIN_CONFIG["storage_bucket"]},
            )

        # 커스텀 데이터베이스 ID 지원
        db_id = FIREBASE_ADMIN_CONFIG.get("database_id")
        _firestore_client = firestore.client(database_id=db_id) if db_id else firestore.client()
        _storage_bucket = fb_storage.bucket()
        logger.info("✅ Firebase Admin SDK 초기화 완료")
        return True
    except ImportError:
        logger.error("firebase-admin 미설치: pip install firebase-admin")
        return False
    except FileNotFoundError:
        logger.error(
            "Firebase 서비스 계정 키가 없습니다. TAX_GOOGLE_CREDENTIALS_PATH 또는 "
            "GOOGLE_APPLICATION_CREDENTIALS 에 JSON 경로를 설정하세요."
        )
        return False
    except Exception as e:
        logger.error(f"Firebase 초기화 실패: {e}")
        return False


# ─── Storage 이미지 업로드 ────────────────────────────────────────────────────

def upload_screenshot(local_path: str, platform: str, invoice_date: str) -> Optional[str]:
    """
    스크린샷을 Firebase Storage에 업로드하고 공개 URL 반환.
    경로: tax_invoices/{year}/{month}/{platform}/{filename}
    """
    if not _init_firebase():
        return None
    try:
        path = Path(local_path)
        if not path.exists():
            logger.warning(f"파일 없음: {local_path}")
            return None

        # 저장 경로 구성
        try:
            dt = datetime.fromisoformat(invoice_date)
        except Exception:
            dt = datetime.now()
        import re
        safe_platform = re.sub(r"[^\w가-힣]", "_", platform)
        # 세금계산서 작성일 기준 연/월/일/플랫폼 경로
        blob_name = (
            f"tax_invoices/{dt.strftime('%Y/%m/%d')}/{safe_platform}/{path.name}"
        )

        mime_type, _ = mimetypes.guess_type(str(path))
        mime_type = mime_type or "image/png"

        blob = _storage_bucket.blob(blob_name)
        blob.upload_from_filename(str(path), content_type=mime_type)
        blob.make_public()

        url = blob.public_url
        logger.info(f"Storage 업로드: {blob_name}")
        return url
    except Exception as e:
        logger.error(f"Storage 업로드 실패 ({local_path}): {e}")
        return None


def upload_screenshots(paths: List[str], platform: str, invoice_date: str) -> List[str]:
    """여러 스크린샷 업로드, 성공한 URL 목록 반환"""
    urls = []
    for p in paths:
        url = upload_screenshot(p, platform, invoice_date)
        if url:
            urls.append(url)
    return urls


# ─── Firestore 저장 ───────────────────────────────────────────────────────────

def save_invoice(result: Dict) -> Optional[str]:
    """
    처리 결과를 Firestore tax_invoices 컬렉션에 저장.
    Returns: 생성된 문서 ID
    """
    if not _init_firebase():
        return None
    if not result.get("success"):
        return None

    try:
        from config import (
            is_blocked_tax_invoice_url,
            is_excluded_tax_platform,
            is_blocked_invoice_email,
        )

        if is_blocked_invoice_email(
            result.get("email_from") or "",
            result.get("email_subject") or "",
        ):
            logger.info(
                "Firestore 저장 생략 (차단 발신/제목): "
                f"{(result.get('email_subject') or '')[:50]}"
            )
            return None

        record = result.get("invoice_record", {})
        supplier = record.get("supplier", {})
        platform = result.get("platform", "기타")
        src_url = result.get("url") or ""
        if is_blocked_tax_invoice_url(src_url) or is_excluded_tax_platform(platform):
            logger.info(f"Firestore 저장 생략 (차단 URL 또는 제외 플랫폼): {platform} | {src_url[:60]}")
            return None
        invoice_date = record.get("issue_date") or datetime.now().strftime("%Y-%m-%d")

        # 스크린샷 Storage 업로드
        local_screenshots = result.get("screenshots", [])
        storage_urls = upload_screenshots(local_screenshots, platform, invoice_date)

        now_utc = datetime.now(tz=timezone.utc)

        doc_data = {
            # 발행 정보
            "platform": platform,
            "issue_date": invoice_date,
            "invoice_number": record.get("invoice_number") or "",
            "supplier_name": supplier.get("name") or "",
            "supplier_biz_no": supplier.get("business_number") or "",
            "supply_amount": record.get("supply_amount") or 0,
            "tax_amount": record.get("tax_amount") or 0,
            "total_amount": record.get("total_amount") or 0,
            "note": record.get("note") or "",
            # 처리 상태
            "status": "pending",
            "payer_name": "",
            "pay_memo": "",
            # 이미지
            "screenshot_urls": storage_urls,
            # 원본 정보
            "email_subject": result.get("email_subject") or "",
            "source_url": result.get("url") or "",
            # 타임스탬프
            "created_at": now_utc,
            "updated_at": now_utc,
        }

        col = _firestore_client.collection("tax_invoices")
        doc_ref = col.add(doc_data)[1]
        logger.info(f"✅ Firestore 저장: {doc_ref.id} | [{platform}] {supplier.get('name')} {record.get('total_amount')}")
        return doc_ref.id

    except Exception as e:
        logger.error(f"Firestore 저장 실패: {e}")
        return None


def save_invoices(results: List[Dict]) -> List[str]:
    """여러 결과 일괄 저장, 성공한 문서 ID 목록 반환"""
    ids = []
    for r in results:
        doc_id = save_invoice(r)
        if doc_id:
            ids.append(doc_id)
    logger.info(f"Firestore 총 {len(ids)}/{len(results)}건 저장")
    return ids


# ─── 상태 업데이트 (입금 처리) ────────────────────────────────────────────────

def update_payment_status(
    doc_id: str,
    status: str,
    payer_name: str = "",
    pay_memo: str = "",
) -> bool:
    """
    입금 완료 처리: status / payer_name / pay_memo 업데이트
    status: "pending" | "paid"
    """
    if not _init_firebase():
        return False
    try:
        doc_ref = _firestore_client.collection("tax_invoices").document(doc_id)
        doc_ref.update({
            "status": status,
            "payer_name": payer_name,
            "pay_memo": pay_memo,
            "updated_at": datetime.now(tz=timezone.utc),
        })
        logger.info(f"상태 업데이트: {doc_id} → {status}")
        return True
    except Exception as e:
        logger.error(f"상태 업데이트 실패: {e}")
        return False


def check_duplicate(invoice_number: str) -> bool:
    """동일 승인번호가 이미 저장돼 있는지 확인 (중복 방지)"""
    if not invoice_number or not _init_firebase():
        return False
    try:
        col = _firestore_client.collection("tax_invoices")
        docs = col.where("invoice_number", "==", invoice_number).limit(1).get()
        return len(docs) > 0
    except Exception as e:
        logger.warning(f"중복 확인 실패: {e}")
        return False
