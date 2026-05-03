"""
이메일 읽기 모듈 v2
한메일(IMAP) 등으로 수신된 원콜·운송플랫폼 세금계산서 메일에서
본문 URL(상세보기·확인하기 등)을 추출합니다.
MIME 본문이 표준 text/html · text/plain 이 아니거나,
Content-Disposition 이 attachment 로 잘못 붙은 HTML 등도 최대한 복원합니다.
"""

import imaplib
import email
import base64
import quopri
import re
import logging
from datetime import datetime, timezone
from email.header import decode_header
from email.message import Message
from email.utils import parsedate_to_datetime
from typing import List, Dict, Optional
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup

from config import (
    EMAIL_CONFIG,
    EMAIL_FILTER,
    is_blocked_tax_invoice_url,
    recipient_keyword_required,
    mandatory_tax_invoice_keyword_in_subject_or_sender,
    loose_carrier_or_tax_hint_in_subject_or_sender,
    email_allowed_for_collection,
    get_imap_since_date_str,
    get_effective_mail_window_start_date,
    is_spam_hard_blocked,
    is_blocked_invoice_email,
    passes_etax_or_nts_spam_guard,
)

_KST = ZoneInfo("Asia/Seoul")

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

IMAGE_EXTENSIONS = (
    ".gif",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".svg",
    ".ico",
    ".bmp",
    ".tif",
    ".tiff",
)

QOO10_BLOCK = (
    "university.qoo10.jp",
    "qoo10.jp",
    "qoo10.com",
    "qoo10.co.kr",
)


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

            if any(
                href.lower().split("?")[0].endswith(ext) for ext in IMAGE_EXTENSIONS
            ):
                continue  # 이미지 URL 건너뜀

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


_MAX_BODY_BYTES = 2_000_000
_URL_SCAN_RE = re.compile(r'https?://[^\s<>"\'{}|\\^`\[\]]+', re.I)


def _charset_from_header(raw: str) -> Optional[str]:
    if not raw:
        return None
    m = re.search(r"charset\s*=\s*['\"]?([A-Za-z0-9_\-]+)", raw, re.I)
    return m.group(1).strip().strip('"').strip("'") if m else None


def _charset_candidates(part: Message) -> List[str]:
    out: List[str] = []
    for c in (part.get_content_charset(), _charset_from_header(part.get("Content-Type", ""))):
        if not c:
            continue
        c = str(c).strip().strip('"').strip("'")
        if c.upper() in ("UNKNOWN-8BIT", "BIN"):
            continue
        if c.lower() not in {x.lower() for x in out}:
            out.append(c)
    for fb in ("utf-8", "cp949", "euc-kr", "iso-2022-kr", "johab", "latin-1"):
        if fb.lower() not in {x.lower() for x in out}:
            out.append(fb)
    return out


def _decode_raw_payload(part: Message) -> Optional[bytes]:
    try:
        raw = part.get_payload(decode=True)
        if raw is None:
            return None
        if isinstance(raw, str):
            return raw.encode("utf-8", errors="surrogateescape")
        return raw
    except Exception:
        pass
    try:
        pl = part.get_payload()
        if not isinstance(pl, str):
            return None
        cte = str(part.get("Content-Transfer-Encoding", "") or "").lower().strip()
        if cte == "base64":
            return base64.standard_b64decode(re.sub(r"\s+", "", pl))
        if cte in ("quoted-printable", "qp"):
            return quopri.decodestring(pl.encode("utf-8", errors="ignore"))
    except Exception:
        pass
    return None


def _decode_part_to_string(part: Message) -> Optional[str]:
    raw = _decode_raw_payload(part)
    if not raw:
        return None
    if len(raw) > _MAX_BODY_BYTES:
        raw = raw[:_MAX_BODY_BYTES]
    for cs in _charset_candidates(part):
        try:
            return raw.decode(cs)
        except Exception:
            continue
    return raw.decode("utf-8", errors="replace")


def _should_skip_part_for_body(part: Message) -> bool:
    ct = (part.get_content_type() or "").lower()
    if ct.startswith("multipart/"):
        return True
    cd = str(part.get("Content-Disposition", "") or "").lower()
    if "attachment" in cd:
        if ct == "message/rfc822":
            return False
        if ct in ("text/html", "text/plain") or ct.startswith("text/"):
            return False
        if ct in (
            "application/octet-stream",
            "application/x-unknown-content-type",
            "application/msword",
            "binary/octet-stream",
        ):
            return False
        return True
    return False


def _sniff_html_content(s: str) -> bool:
    if not s or len(s) < 12:
        return False
    sl = s[:8000].lstrip().lower()
    if sl.startswith("<!") or "<html" in sl[:3000] or "<body" in sl[:3000]:
        return True
    if "href=" in sl or "<a " in sl or "<table" in sl:
        return True
    return False


def _merge_body_part(body: Dict[str, str], part: Message) -> None:
    if _should_skip_part_for_body(part):
        return
    ct = (part.get_content_type() or "").lower()

    if ct == "message/rfc822":
        inner = part.get_payload()
        if isinstance(inner, list):
            inner = next((x for x in inner if isinstance(x, Message)), None)
        if isinstance(inner, Message):
            sub = get_email_body(inner)
            if sub["html"]:
                body["html"] += "\n" + sub["html"]
            if sub["text"]:
                body["text"] += "\n" + sub["text"]
        return

    if part.is_multipart():
        return

    s = _decode_part_to_string(part)
    if not s or not s.strip():
        return

    if ct == "text/html":
        body["html"] += "\n" + s
    elif ct == "text/plain":
        body["text"] += "\n" + s
    elif ct in ("text/enriched", "text/rfc822-headers"):
        body["text"] += "\n" + s
    elif ct in (
        "application/octet-stream",
        "application/x-unknown-content-type",
        "binary/octet-stream",
    ) or ("xml" in ct and "html" in s[:200].lower()):
        if _sniff_html_content(s):
            body["html"] += "\n" + s
        else:
            body["text"] += "\n" + s
    elif _sniff_html_content(s):
        body["html"] += "\n" + s
    else:
        body["text"] += "\n" + s


def extract_urls_deep_scan(msg: Message) -> List[str]:
    """
    본문 파싱이 빈약할 때를 대비해, 모든 비바이너리 파트를 디코드해 URL을 훑는다.
    (한메일·중계기에서 Content-Type 이 어긋난 경우 보조)
    """
    found: List[str] = []
    seen = set()
    for part in msg.walk():
        if part.is_multipart():
            continue
        ct = (part.get_content_type() or "").lower()
        if ct.startswith(("image/", "audio/", "video/", "application/pkcs", "application/x-pkcs")):
            continue
        s = _decode_part_to_string(part)
        if not s:
            continue
        for u in _URL_SCAN_RE.findall(s):
            u = u.rstrip(").,;]'\"")
            if any(u.lower().split("?")[0].endswith(ext) for ext in IMAGE_EXTENSIONS):
                continue  # 이미지 URL 건너뜀
            if u not in seen:
                seen.add(u)
                found.append(u)
    return found


def extract_all_links(html: str, text: str) -> List[Dict]:
    """
    HTML + 텍스트에서 모든 링크 수집 (fallback용)
    """
    results = []
    for url in _URL_SCAN_RE.findall(text or ""):
        if any(url.lower().split("?")[0].endswith(ext) for ext in IMAGE_EXTENSIONS):
            continue  # 이미지 URL 건너뜀
        results.append({"url": url, "text": "", "priority": 3})

    # HTML 모든 링크
    if html:
        try:
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.find_all(["a", "area"], href=True):
                href = a["href"]
                if href.startswith("http"):
                    if any(
                        href.lower().split("?")[0].endswith(ext)
                        for ext in IMAGE_EXTENSIONS
                    ):
                        continue  # 이미지 URL 건너뜀
                    results.append(
                        {"url": href, "text": a.get_text(strip=True), "priority": 3}
                    )
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


def get_email_body(msg: Message) -> Dict[str, str]:
    """이메일 본문 추출 (multipart/alternative·related, message/rfc822, attachment 표기 HTML 등)."""
    body: Dict[str, str] = {"html": "", "text": ""}
    try:
        if msg.is_multipart():
            for part in msg.walk():
                _merge_body_part(body, part)
        else:
            _merge_body_part(body, msg)
    except Exception as e:
        logger.warning(f"본문 추출 실패: {e}")
    body["html"] = (body["html"] or "").strip()
    body["text"] = (body["text"] or "").strip()
    return body


def extract_inline_images(msg: Message) -> List[Dict]:
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
            srv = EMAIL_CONFIG.get("imap_server", "")
            logger.info("✅ IMAP 연결 성공 (%s, %s)", srv, addr.split("@")[-1] if "@" in addr else "")
            return True
        except Exception as e:
            logger.error(f"❌ IMAP 연결 실패 ({EMAIL_CONFIG.get('imap_server')}): {e}")
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

                        if is_spam_hard_blocked(from_addr, subject):
                            if not loose_carrier_or_tax_hint_in_subject_or_sender(
                                from_addr, subject
                            ):
                                logger.info(
                                    f"⏭ 스팸 제목·발신 차단 — [{subject[:50]}]"
                                )
                                continue

                        try:
                            received_date = parsedate_to_datetime(date_str)
                            if received_date.tzinfo is None:
                                received_date = received_date.replace(
                                    tzinfo=timezone.utc
                                )
                            received_date = received_date.astimezone(_KST)
                        except Exception:
                            logger.info(
                                f"⏭ Date 헤더 없음/파싱 실패 — 제목:[{subject[:45]}]"
                            )
                            continue

                        min_recv = get_effective_mail_window_start_date()
                        recv_day = received_date.date()
                        if recv_day < min_recv:
                            logger.info(
                                f"⏭ 수신일이 창 시작 이전 — {recv_day} < {min_recv}(KST) — [{subject[:40]}]"
                            )
                            continue

                        body = get_email_body(msg)

                        if not email_allowed_for_collection(
                            from_addr,
                            subject,
                            body["html"],
                            body["text"],
                        ):
                            why = "기타"
                            if is_blocked_invoice_email(
                                from_addr, subject, body["html"], body["text"]
                            ):
                                why = "쇼핑·광고·차단도메인·본문차단키워드"
                            elif not mandatory_tax_invoice_keyword_in_subject_or_sender(
                                from_addr, subject
                            ) and not loose_carrier_or_tax_hint_in_subject_or_sender(
                                from_addr, subject
                            ):
                                why = "제목·발신 필수키워드 없음(원콜·세금·거래명세 등)"
                            elif not passes_etax_or_nts_spam_guard(
                                from_addr,
                                subject,
                                body["html"],
                                body["text"],
                            ):
                                why = "본문·제목에 전자세금·국세청 신호 없음"
                            logger.info(
                                "⏭ 수집 제외 [%s] — [%s]", why, subject[:50]
                            )
                            continue

                        # 공식 발신이 아니면 공급받는자(세계로지스)가 제목·본문에 있는지 검증
                        # 운송·브랜드 느슨 힌트가 있으면 본문에 세계로지스 없이도 후보 유지(발신만으로도 처리)
                        recipient_kws = EMAIL_FILTER.get("recipient_keywords", [])
                        if (
                            recipient_kws
                            and recipient_keyword_required(from_addr)
                            and not loose_carrier_or_tax_hint_in_subject_or_sender(
                                from_addr, subject
                            )
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

                        tax_url_kws = [
                            "invoice", "세금", "tax", "bill", "계산서",
                            "hometax", "onebill", "onecall", "1call", "tax12", "tax15",
                            "loginote", "logynote",
                        ]

                        # 2순위: fallback — 모든 링크에서 세금계산서 관련 URL 필터링
                        if not links:
                            all_links = extract_all_links(body["html"], body["text"])
                            links = [lnk for lnk in all_links
                                     if any(kw in lnk["url"].lower() for kw in tax_url_kws)]

                        # 3순위: 비표준 MIME·깨진 Content-Type — 전 파트 원문에서 URL 스캔 (한메일 등)
                        if not links:
                            for u in extract_urls_deep_scan(msg):
                                if is_blocked_tax_invoice_url(u):
                                    continue
                                if any(kw in u.lower() for kw in tax_url_kws):
                                    links.append({"url": u, "text": "", "priority": 4})
                            if links:
                                logger.info(
                                    "MIME 심층 스캔으로 링크 %d건 복원 — [%s]",
                                    len(links),
                                    subject[:40],
                                )

                        # 차단 URL 제거 (허용 발신자 메일에 마켓/교육 링크가 섞인 경우)
                        before_n = len(links)
                        links = [lnk for lnk in links if not is_blocked_tax_invoice_url(lnk.get("url", ""))]

                        # Qoo10 계열 URL 제거 (최종 확정 직전 추가 차단)
                        links = [
                            lnk
                            for lnk in links
                            if not any(
                                b in lnk.get("url", "").lower()
                                for b in QOO10_BLOCK
                            )
                        ]

                        # 이미지형 메일 — 인라인/첨부 이미지 추출
                        images = extract_inline_images(msg)
                        # 링크는 있었으나 전부 차단(예: Qoo10)인 경우: 이미지가 있어도 동일 메일로 스팸
                        # (마케팅 이미지 + 쇼핑 링크가 동시에 있는 경우) → 수집하지 않음
                        if before_n > 0 and not links:
                            logger.info(
                                f"🚫 수집 가능 링크 없음(전부 차단 URL) — "
                                f"제목: [{subject[:40]}] · 이미지{len(images)}개 무시"
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
                if (
                    mandatory_tax_invoice_keyword_in_subject_or_sender(
                        e.get("from", ""),
                        e.get("subject", ""),
                    )
                    or loose_carrier_or_tax_hint_in_subject_or_sender(
                        e.get("from", ""),
                        e.get("subject", ""),
                    )
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
