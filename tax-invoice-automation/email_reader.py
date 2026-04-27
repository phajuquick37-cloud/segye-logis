"""
이메일 읽기 모듈 v2
Gmail IMAP으로 세금계산서 메일을 읽고,
'확인하기' / '상세보기' 버튼 링크를 우선 추출합니다.
"""

import imaplib
import email
import re
import logging
from datetime import datetime
from email.header import decode_header
from email.utils import parsedate_to_datetime
from typing import List, Dict
from bs4 import BeautifulSoup

from config import (
    EMAIL_CONFIG,
    EMAIL_FILTER,
    is_blocked_tax_invoice_url,
    is_blocked_invoice_email,
    sender_matches_allowed_platforms,
    is_carrier_trusted_from_address,
    recipient_keyword_required,
    tax_priority_keywords_match,
    matches_worldlogis_invoice_subject,
    get_imap_since_date_str,
)

logger = logging.getLogger(__name__)


# ─── 문자열 유틸 ───────────────────────────────────────────────────────────────

def decode_str(value: str) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    result = []
    for part, charset in parts:
        if isinstance(part, bytes):
            charset = charset or "utf-8"
            try:
                result.append(part.decode(charset, errors="replace"))
            except Exception:
                result.append(part.decode("utf-8", errors="replace"))
        else:
            result.append(str(part))
    return "".join(result)


# ─── 링크 추출 ────────────────────────────────────────────────────────────────

def extract_button_links(html: str) -> List[Dict]:
    """
    HTML에서 '확인하기', '상세보기' 등 버튼 텍스트를 가진 링크를 우선 추출.
    Returns: [{"url": ..., "text": ..., "priority": 1|2}, ...]
    """
    results = []
    try:
        soup = BeautifulSoup(html, "html.parser")
        button_keywords = EMAIL_FILTER.get("button_keywords", [])

        for tag in soup.find_all(["a", "button"]):
            tag_text = tag.get_text(strip=True)
            href = tag.get("href", "") or tag.get("data-href", "")

            if not href or href.startswith("mailto:") or href.startswith("#"):
                continue

            # 버튼 텍스트 매칭 (높은 우선순위)
            is_button = any(kw in tag_text for kw in button_keywords)
            if is_button:
                results.append({"url": href, "text": tag_text, "priority": 1})
                continue

            # 세금계산서 관련 URL (낮은 우선순위)
            tax_keywords = [
                "invoice", "세금계산서", "tax", "bill", "계산서",
                "hometax", "einvoice", "onebill", "tax12", "tax15",
                "loginote", "logynote",
            ]
            if any(kw in href.lower() for kw in tax_keywords):
                results.append({"url": href, "text": tag_text, "priority": 2})

    except Exception as e:
        logger.error(f"버튼 링크 추출 오류: {e}")

    # 중복 URL 제거, 우선순위 높은 것 유지
    seen = {}
    for item in results:
        url = item["url"]
        if url not in seen or item["priority"] < seen[url]["priority"]:
            seen[url] = item
    return sorted(seen.values(), key=lambda x: x["priority"])


def extract_all_links(html: str, text: str) -> List[Dict]:
    """
    HTML + 텍스트에서 모든 링크 수집 (fallback용)
    """
    results = []
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'

    # 텍스트 URL
    for url in re.findall(url_pattern, text or ""):
        results.append({"url": url, "text": "", "priority": 3})

    # HTML 모든 링크
    if html:
        try:
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if href.startswith("http"):
                    results.append({"url": href, "text": a.get_text(strip=True), "priority": 3})
        except Exception:
            pass

    # 중복 제거
    seen = set()
    unique = []
    for item in results:
        if item["url"] not in seen:
            seen.add(item["url"])
            unique.append(item)
    return unique


def get_email_body(msg) -> Dict[str, str]:
    """이메일 본문 추출"""
    body = {"html": "", "text": ""}
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if "attachment" in cd:
                continue
            try:
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                charset = part.get_content_charset() or "utf-8"
                decoded = payload.decode(charset, errors="replace")
                if ct == "text/html":
                    body["html"] += decoded
                elif ct == "text/plain":
                    body["text"] += decoded
            except Exception as e:
                logger.warning(f"파트 디코딩 실패: {e}")
    else:
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                decoded = payload.decode(charset, errors="replace")
                if msg.get_content_type() == "text/html":
                    body["html"] = decoded
                else:
                    body["text"] = decoded
        except Exception as e:
            logger.warning(f"본문 디코딩 실패: {e}")
    return body


def extract_inline_images(msg) -> List[Dict]:
    """
    이메일에서 인라인/첨부 이미지 추출.
    이미지형 세금계산서 메일 (링크 없이 이미지만 있는 경우) 대응.
    Returns: [{"data": bytes, "ext": str, "content_type": str}, ...]
    """
    images = []
    if not msg.is_multipart():
        return images

    for part in msg.walk():
        ct = part.get_content_type()
        if not ct.startswith("image/"):
            continue

        try:
            data = part.get_payload(decode=True)
            if not data:
                continue

            # 확장자 결정
            ext = ct.split("/")[-1].lower()
            ext_map = {"jpeg": "jpg", "jpg": "jpg", "png": "png",
                       "gif": "gif", "webp": "webp", "tiff": "tif"}
            ext = ext_map.get(ext, "png")

            images.append({"data": data, "ext": ext, "content_type": ct})
            logger.debug(f"이미지 파트 발견: {ct} ({len(data)} bytes)")
        except Exception as e:
            logger.warning(f"이미지 파트 추출 실패: {e}")

    return images


# ─── 메인 리더 클래스 ─────────────────────────────────────────────────────────

class EmailReader:

    def __init__(self):
        self.mail = None

    def connect(self) -> bool:
        addr = (EMAIL_CONFIG.get("email_address") or "").strip()
        pwd = EMAIL_CONFIG.get("app_password") or ""
        if not addr or not pwd:
            logger.error(
                "IMAP 계정이 없습니다. TAX_IMAP_EMAIL·TAX_IMAP_APP_PASSWORD "
                "(또는 GMAIL_USER·GMAIL_APP_PASSWORD) 환경 변수를 설정하세요."
            )
            return False
        try:
            self.mail = imaplib.IMAP4_SSL(
                EMAIL_CONFIG["imap_server"],
                EMAIL_CONFIG["imap_port"]
            )
            self.mail.login(addr, pwd)
            logger.info("✅ Gmail IMAP 연결 성공")
            return True
        except Exception as e:
            logger.error(f"❌ Gmail 연결 실패: {e}")
            return False

    def disconnect(self):
        if self.mail:
            try:
                self.mail.logout()
            except Exception:
                pass

    @staticmethod
    def _select_imap_folder(mail: imaplib.IMAP4_SSL, folder: str) -> bool:
        """Gmail 등에서 폴더명 인용 시도."""
        name = (folder or "INBOX").strip()
        for candidate in (name, f'"{name}"'):
            try:
                typ, _ = mail.select(candidate)
                if typ == "OK":
                    return True
            except Exception:
                continue
        return False

    def fetch_tax_invoice_emails(self) -> List[Dict]:
        if not self.mail:
            return []

        results = []
        seen_dedupe_keys = set()

        # 검색 조건 구성 (폴더 공통)
        criteria_parts = []
        if EMAIL_FILTER.get("unread_only"):
            criteria_parts.append("UNSEEN")
        days = EMAIL_FILTER.get("days_limit", 0)
        if days > 0 or EMAIL_FILTER.get("imap_since_min_date"):
            since = get_imap_since_date_str(days if days > 0 else 365)
            criteria_parts.append(f'SINCE "{since}"')
        criteria = " ".join(criteria_parts) if criteria_parts else "ALL"

        folders = EMAIL_FILTER.get("imap_folders") or ["INBOX"]
        keywords = EMAIL_FILTER.get("subject_keywords", [])

        try:
            for folder in folders:
                if not self._select_imap_folder(self.mail, folder):
                    logger.warning(f"IMAP 폴더를 열 수 없습니다 (건너뜀): {folder}")
                    continue

                logger.info(f"[{folder}] 이메일 검색 조건: {criteria}")
                _, msg_ids = self.mail.search(None, criteria)
                ids = msg_ids[0].split()
                logger.info(f"[{folder}] 검색된 메일 수: {len(ids)}개")

                for msg_id in ids:
                    try:
                        _, data = self.mail.fetch(msg_id, "(RFC822)")
                        msg = email.message_from_bytes(data[0][1])

                        mid_raw = msg.get("Message-ID", "") or ""
                        mid = decode_str(mid_raw).strip()
                        dedupe_key = mid if mid else f"{folder}:{msg_id.decode()}"
                        if dedupe_key in seen_dedupe_keys:
                            continue

                        subject = decode_str(msg.get("Subject", ""))
                        from_addr = decode_str(msg.get("From", ""))
                        date_str = msg.get("Date", "")
                        subj_lower = subject.lower()

                        body = get_email_body(msg)

                        # 차단(Qoo10·큐텐·마켓플레이스 등): 발신·제목·본문
                        if is_blocked_invoice_email(
                            from_addr, subject, body["html"], body["text"]
                        ):
                            logger.info(
                                f"🚫 차단 목록 메일 스킵: [{subject[:40]}] | {from_addr[:40]}"
                            )
                            continue

                        # 기본: 제목이 「…세계로지스…님께/귀하…발행…세금계산서」 형태일 때만 (스팸·다른 쇼핑 제거)
                        if EMAIL_FILTER.get("invoice_subject_strict", True):
                            if not matches_worldlogis_invoice_subject(subject):
                                logger.info(
                                    f"⏭ 제목 패턴 제외(세계로지스·발행·세금계산서·수취호칭): "
                                    f"[{subject[:55]}]"
                                )
                                continue
                        else:
                            priority = tax_priority_keywords_match(
                                from_addr,
                                subject,
                                body["html"],
                                body["text"],
                            )
                            allowed_sender = sender_matches_allowed_platforms(
                                from_addr
                            )
                            if not allowed_sender and not priority:
                                logger.info(
                                    f"⛔ 수집 대상 발신/키워드 아님: "
                                    f"[{from_addr[:50]}] / [{subject[:40]}]"
                                )
                                continue

                            if keywords and not any(
                                kw.lower() in subj_lower for kw in keywords
                            ):
                                if not priority and not is_carrier_trusted_from_address(
                                    from_addr
                                ):
                                    continue

                        try:
                            received_date = parsedate_to_datetime(date_str)
                        except Exception:
                            received_date = datetime.now()

                        min_recv = EMAIL_FILTER.get("min_received_date")
                        if min_recv and received_date.date() < min_recv:
                            logger.info(
                                f"⏭ 수신일이 수집 시작 이전 — {received_date.date()} < {min_recv} — {subject[:40]}"
                            )
                            continue

                        # ── 공급받는자 검증(제목 엄격 모드일 땐 제목에 이미 반영됨)
                        recipient_kws = EMAIL_FILTER.get("recipient_keywords", [])
                        if (
                            not EMAIL_FILTER.get("invoice_subject_strict", True)
                            and recipient_kws
                            and recipient_keyword_required(from_addr)
                        ):
                            recipient_blob = (
                                subject + body["html"] + body["text"]
                            ).lower()
                            if not any(
                                rk.lower() in recipient_blob for rk in recipient_kws
                            ):
                                logger.info(
                                    f"⏭ 수신자 미일치 (세계로지스 미포함) — 제목: [{subject[:40]}]"
                                )
                                continue

                        # 1순위: 버튼 텍스트 링크
                        links = []
                        if body["html"]:
                            links = extract_button_links(body["html"])

                        # 2순위: fallback — 모든 링크에서 세금계산서 관련 URL 필터링
                        if not links:
                            all_links = extract_all_links(body["html"], body["text"])
                            tax_kws = [
                                "invoice", "세금", "tax", "bill", "계산서",
                                "hometax", "onebill", "tax12", "tax15", "loginote", "logynote",
                            ]
                            links = [lnk for lnk in all_links
                                     if any(kw in lnk["url"].lower() for kw in tax_kws)]

                        # 차단 URL 제거 (허용 발신자 메일에 마켓/교육 링크가 섞인 경우)
                        before_n = len(links)
                        links = [lnk for lnk in links if not is_blocked_tax_invoice_url(lnk.get("url", ""))]

                        # 이미지형 메일 — 인라인/첨부 이미지 추출
                        images = extract_inline_images(msg)
                        if before_n > 0 and not links and not images:
                            logger.info(
                                f"🚫 차단 URL만 있음 — 제목: [{subject[:40]}]"
                            )
                            continue

                        # 링크도 없고 이미지도 없으면 건너뜀
                        if not links and not images:
                            logger.warning(f"링크·이미지 모두 없음 — [{subject}]")
                            continue

                        email_type = "link" if links else "image"
                        email_info = {
                            "msg_id": msg_id.decode(),
                            "rfc_message_id": mid,
                            "subject": subject,
                            "from": from_addr,
                            "date": received_date.isoformat(),
                            "links": links,
                            "images": images,
                            "email_type": email_type,
                            "html_body": body["html"],
                            "text_body": body["text"],
                        }
                        results.append(email_info)
                        seen_dedupe_keys.add(dedupe_key)
                        logger.info(
                            f"📧 [{subject[:40]}] | 발신: {from_addr[:30]} "
                            f"| 유형: {email_type} | 링크 {len(links)}개 | 이미지 {len(images)}개"
                        )

                        if EMAIL_FILTER.get("mark_as_read"):
                            self.mail.store(msg_id, "+FLAGS", "\\Seen")

                    except Exception as e:
                        logger.error(f"메일 처리 오류 (folder={folder}, id={msg_id}): {e}")

        except Exception as e:
            logger.error(f"메일 조회 실패: {e}")

        # 우선 키워드(원콜·화물맨 등) 메일을 먼저 처리
        results.sort(
            key=lambda e: (
                0
                if tax_priority_keywords_match(
                    e.get("from", ""),
                    e.get("subject", ""),
                    e.get("html_body", ""),
                    e.get("text_body", ""),
                )
                else 1,
                e.get("date") or "",
            )
        )
        return results

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *_):
        self.disconnect()
