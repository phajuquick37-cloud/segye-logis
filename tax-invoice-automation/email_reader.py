"""
이메일 읽기 모듈 v2
Gmail IMAP으로 세금계산서 메일을 읽고,
'확인하기' / '상세보기' 버튼 링크를 우선 추출합니다.
"""

import imaplib
import email
import re
import logging
from datetime import datetime, timedelta
from email.header import decode_header
from email.utils import parsedate_to_datetime
from typing import List, Dict
from bs4 import BeautifulSoup

from config import EMAIL_CONFIG, EMAIL_FILTER

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
        try:
            self.mail = imaplib.IMAP4_SSL(
                EMAIL_CONFIG["imap_server"],
                EMAIL_CONFIG["imap_port"]
            )
            self.mail.login(
                EMAIL_CONFIG["email_address"],
                EMAIL_CONFIG["app_password"]
            )
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

    def fetch_tax_invoice_emails(self) -> List[Dict]:
        if not self.mail:
            return []

        results = []
        try:
            self.mail.select("INBOX")

            # 검색 조건 구성
            criteria_parts = []
            if EMAIL_FILTER.get("unread_only"):
                criteria_parts.append("UNSEEN")
            days = EMAIL_FILTER.get("days_limit", 0)
            if days > 0:
                since = (datetime.now() - timedelta(days=days)).strftime("%d-%b-%Y")
                criteria_parts.append(f'SINCE "{since}"')
            criteria = " ".join(criteria_parts) if criteria_parts else "ALL"

            logger.info(f"이메일 검색 조건: {criteria}")
            _, msg_ids = self.mail.search(None, criteria)
            ids = msg_ids[0].split()
            logger.info(f"검색된 메일 수: {len(ids)}개")

            keywords = EMAIL_FILTER.get("subject_keywords", [])

            for msg_id in ids:
                try:
                    _, data = self.mail.fetch(msg_id, "(RFC822)")
                    msg = email.message_from_bytes(data[0][1])

                    subject = decode_str(msg.get("Subject", ""))
                    from_addr = decode_str(msg.get("From", ""))
                    date_str = msg.get("Date", "")
                    from_lower = from_addr.lower()
                    subj_lower = subject.lower()

                    # ── 1순위: 발신자 도메인 차단 (blocklist) ─────────────────
                    # 블랙리스트에 해당하면 키워드·허용목록 검사 없이 즉시 제외
                    blocklist = EMAIL_FILTER.get("sender_domain_blocklist", [])
                    if blocklist and any(bk.lower() in from_lower for bk in blocklist):
                        logger.info(f"🚫 차단 발신자: [{from_addr[:50]}] / 제목: [{subject[:40]}]")
                        continue

                    # ── 2순위: 발신자 도메인 허용 (allowlist) ─────────────────
                    # allowlist가 있으면 발신자가 목록에 없는 메일은 제외
                    # ※ 제목 키워드로는 우회 불가 — 발신자만 검사
                    allowlist = EMAIL_FILTER.get("sender_domain_allowlist", [])
                    if allowlist:
                        sender_allowed = any(ak.lower() in from_lower for ak in allowlist)
                        if not sender_allowed:
                            logger.info(f"⛔ 허용목록 미해당: [{from_addr[:50]}] / 제목: [{subject[:40]}]")
                            continue

                    # ── 3순위: 제목 키워드 필터 ───────────────────────────────
                    if keywords and not any(kw.lower() in subj_lower for kw in keywords):
                        continue

                    try:
                        received_date = parsedate_to_datetime(date_str)
                    except Exception:
                        received_date = datetime.now()

                    body = get_email_body(msg)

                    # ── 4순위: 공급받는자 검증 ─────────────────────────────────
                    # 이메일 본문에 "세계로지스"가 없으면 당사 앞으로 발행된
                    # 계산서가 아니므로 제외
                    recipient_kws = EMAIL_FILTER.get("recipient_keywords", [])
                    if recipient_kws:
                        body_all = (body["html"] + body["text"]).lower()
                        if not any(rk.lower() in body_all for rk in recipient_kws):
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
                        tax_kws = ["invoice", "세금", "tax", "bill", "계산서",
                                   "hometax", "onebill", "tax12", "tax15", "loginote"]
                        links = [lnk for lnk in all_links
                                 if any(kw in lnk["url"].lower() for kw in tax_kws)]

                    # 3순위: 이미지형 메일 — 인라인/첨부 이미지 추출
                    images = extract_inline_images(msg)

                    # 링크도 없고 이미지도 없으면 건너뜀
                    if not links and not images:
                        logger.warning(f"링크·이미지 모두 없음 — [{subject}]")
                        continue

                    email_type = "link" if links else "image"
                    email_info = {
                        "msg_id": msg_id.decode(),
                        "subject": subject,
                        "from": from_addr,
                        "date": received_date.isoformat(),
                        "links": links,          # [{"url":..., "text":..., "priority":...}]
                        "images": images,        # [{"data": bytes, "ext": str, ...}]
                        "email_type": email_type,
                        "html_body": body["html"],
                        "text_body": body["text"],
                    }
                    results.append(email_info)
                    logger.info(
                        f"📧 [{subject[:40]}] | 발신: {from_addr[:30]} "
                        f"| 유형: {email_type} | 링크 {len(links)}개 | 이미지 {len(images)}개"
                    )

                    if EMAIL_FILTER.get("mark_as_read"):
                        self.mail.store(msg_id, "+FLAGS", "\\Seen")

                except Exception as e:
                    logger.error(f"메일 처리 오류 (id={msg_id}): {e}")

        except Exception as e:
            logger.error(f"메일 조회 실패: {e}")

        return results

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *_):
        self.disconnect()
