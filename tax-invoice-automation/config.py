# =============================================================================
# 세계로지스 세금계산서 자동화 툴 v2 - 통합 설정 파일
# 민감 값은 환경 변수만 사용 (코드/저장소에 비밀번호·키를 넣지 않음)
# =============================================================================

import os as _os
import re as _re
from datetime import date as _date
from datetime import datetime as _dt
from datetime import timedelta as _timedelta
from zoneinfo import ZoneInfo

_BASE_DIR = _os.path.dirname(_os.path.abspath(__file__))
_TZ_SEOUL = ZoneInfo("Asia/Seoul")


def _env(key: str, default: str = "") -> str:
    v = _os.environ.get(key)
    if v is None:
        return default
    return v.strip()


def _env_int(key: str, default: int) -> int:
    raw = _os.environ.get(key)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def _env_bool(key: str, default: bool) -> bool:
    raw = _env(key, "")
    if not raw:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


# --- 서비스 계정 JSON 경로 (Firebase / Sheets 공통) ---
_cred_path = (
    _env("TAX_GOOGLE_CREDENTIALS_PATH")
    or _env("GOOGLE_APPLICATION_CREDENTIALS")
)
_CREDENTIALS_FILE = _cred_path if _cred_path else _os.path.join(_BASE_DIR, "google_credentials.json")

# 화물맨 등 tax10.co.kr ~ tax99.co.kr 스타일 발신 메일
_TAX_NUMBER_SENDER_RE = _re.compile(r"@tax\d{1,3}\.", _re.IGNORECASE)

# 콤마 구분 — 발신 주소 문자열에 포함되면 허용 (실제 메일 헤더 도메인을 모를 때)
_EXTRA_SENDER_ALLOW_PATTERNS = [
    x.strip().lower()
    for x in _env("TAX_EXTRA_SENDER_ALLOWLIST", "").split(",")
    if x.strip()
]

# subject_keywords용 tax10 ~ tax40 (제목에 tax16 등만 있는 알림 대비)
_SUBJECT_TAX_NUMBERS = [f"tax{n}" for n in range(10, 41)]

# --- IMAP (Gmail·Daum 한메일 등, 앱 비밀번호는 공백 없이 넣어도 됨) ---
_imap_pw = _env("TAX_IMAP_APP_PASSWORD") or _env("GMAIL_APP_PASSWORD")
_imap_pw_norm = _imap_pw.replace(" ", "") if _imap_pw else ""

_IMAP_EMAIL = (_env("TAX_IMAP_EMAIL") or _env("GMAIL_USER") or "").strip().lower()
_imap_srv_override = _env("TAX_IMAP_SERVER")
if _imap_srv_override:
    _IMAP_SERVER = _imap_srv_override
elif _IMAP_EMAIL.endswith(("@daum.net", "@hanmail.net")):
    _IMAP_SERVER = "imap.daum.net"
else:
    _IMAP_SERVER = "imap.gmail.com"

EMAIL_CONFIG = {
    "imap_server": _IMAP_SERVER,
    "imap_port": _env_int("TAX_IMAP_PORT", 993),
    "email_address": _env("TAX_IMAP_EMAIL") or _env("GMAIL_USER"),
    "app_password": _imap_pw_norm,
}

# --- 이메일 필터 ---
_EMAIL_DAYS = _env("TAX_EMAIL_DAYS_LIMIT", "1825")
try:
    _EMAIL_DAYS_INT = max(1, min(3650, int(_EMAIL_DAYS)))
except ValueError:
    _EMAIL_DAYS_INT = 1825

# 수집 시작일 하한(기본 2026-04-10). TAX_EMAIL_SINCE_MIN 을 "" 로 두면 하한 없음(전체 days_limit 구간).
_env_since = _os.environ.get("TAX_EMAIL_SINCE_MIN")
if _env_since is None:
    _SINCE_MIN_RAW = "2026-04-10"
elif not str(_env_since).strip():
    _SINCE_MIN_RAW = ""
else:
    _SINCE_MIN_RAW = str(_env_since).strip()
_IMAP_SINCE_MIN_DATE = None
if _SINCE_MIN_RAW.strip():
    try:
        p = _SINCE_MIN_RAW.replace(".", "-").split("-")
        if len(p) >= 3:
            _IMAP_SINCE_MIN_DATE = _dt(
                int(p[0]), int(p[1]), int(p[2]), tzinfo=None
            ).date()
    except Exception:
        _IMAP_SINCE_MIN_DATE = None

# /api/status 등에서 표시(리포지토리 기본 하한과 동일 의미)
TAX_EMAIL_SINCE_MIN_RAW = _SINCE_MIN_RAW

# Cloud Run / 스케줄러: 매 1시간(분 단위, 기본 60) — API 서버 시작 시 APScheduler
SCHEDULE_INTERVAL_MINUTES = _env_int("TAX_SCHEDULE_INTERVAL_MINUTES", 60)
if SCHEDULE_INTERVAL_MINUTES < 5:
    SCHEDULE_INTERVAL_MINUTES = 5
if SCHEDULE_INTERVAL_MINUTES > 24 * 60:
    SCHEDULE_INTERVAL_MINUTES = 24 * 60

# IMAP·수신일: 서울 기준 (오늘−N일) ~ … , 단 TAX_EMAIL_SINCE_MIN 이 더 늦은 날이면 그날을 바닥으로
TAX_MAIL_LOOKBACK_DAYS = _env_int("TAX_MAIL_LOOKBACK_DAYS", 30)
if TAX_MAIL_LOOKBACK_DAYS < 1:
    TAX_MAIL_LOOKBACK_DAYS = 1
if TAX_MAIL_LOOKBACK_DAYS > 120:
    TAX_MAIL_LOOKBACK_DAYS = 120

def today_kst_date() -> _date:
    """서울 달력 기준 오늘(로그·상태 확인용)."""
    return _dt.now(_TZ_SEOUL).date()


def get_min_issue_date_for_save() -> _date | None:
    """
    Firestore/홈에 쌓을 최소 발행일 = TAX_EMAIL_SINCE_MIN 과 동일(예: 2026-04-10).
    그 이전 날짜로 추출된 전표는 저장하지 않음. 환경에서 하한이 비면(None) 발행일 필터 없음.
    """
    return _IMAP_SINCE_MIN_DATE


def get_effective_mail_window_start_date() -> _date:
    """
    IMAP SINCE / 메일 Date 필터의 **포함 시작일**(이날 0시 이후 수신분만).

    - ``TAX_EMAIL_SINCE_MIN`` 이 있으면 사용자 하한(예: 2026-04-10) **이후만** 봐야 하므로
      ``오늘−lookback`` 과 **더 늦은(캘린더상 나중) 날 = max** 를 쓴다.
      (이전 ``min()`` 는 lookback이 과거로 더 열려 since_min **이전** 스팸까지 긁는 버그였음.)
    - 하한 미설정 시: 최근 ``TAX_MAIL_LOOKBACK_DAYS`` 일만.
    """
    today = today_kst_date()
    w = today - _timedelta(days=TAX_MAIL_LOOKBACK_DAYS)
    if _IMAP_SINCE_MIN_DATE is None:
        return w
    return max(w, _IMAP_SINCE_MIN_DATE)

# 없는 폴더는 email_reader에서 건너뜀.
# 휴지통 포함: 수집 기간 내 메일이 Trash로 옮겨져도 볼 수 있음.
# Gmail: [Gmail]/Trash — Daum·한메일: Trash / 휴지통 / Deleted Messages 중 서버에 있는 것만 열림.
_default_imap_folders = (
    "INBOX,Trash,휴지통,Deleted Messages"
    if _IMAP_EMAIL.endswith(("@daum.net", "@hanmail.net"))
    else "INBOX,[Gmail]/All Mail,[Gmail]/Trash"
)
_imap_folders_raw = _env("TAX_IMAP_FOLDERS", _default_imap_folders)
_IMAP_FOLDERS = [x.strip() for x in _imap_folders_raw.split(",") if x.strip()]

# 플랫폼·발행사 한정(넓은 '세금계산서'·영문 'tax' 제외 — 스팸·해외쇼핑이 대량 통과하던 원인)
# 한메일·다음에서 쓰는 ONEBILL 표기: [원빌] (영문 onebill 과 별개 문자열)
_PRIORITY_TAX_KEYWORDS = [
    "원콜",
    "원빌",
    "onecall",
    "onebill",
    "ONEBILL",
    "24시콜",
    "전국24시",
    "15887924",
    "ysm7924",
    "call24network",
    "call24",
    "화물맨",
    "hwamulman",
    "tax12",
    "tax15",
    "로지노트",
    "로지노트플러스",
    "logynote",
    "loginote",
    "logynote plus",
    "loginote plus",
    "lgnoteplus",
    # 세계로지스 대행·포워드
    "세계로지스앞으로 발행된 세금계산서",
    "세계로지스 앞으로 발행된 세금계산서",
    "세계로지스에게 발행된 세금계산서",
    "세계로지스 귀하로 발행된",
    "(주)세계로지스님",
    "세계로지스님께",
    "(주)세계로지스 님",
    "거래명세서",
    "거래명세",
]

EMAIL_FILTER = {
    "priority_keywords": _PRIORITY_TAX_KEYWORDS,
    "subject_keywords": [
        "세금계산서", "전자세금계산서", "스마트빌", "계산서 발행", "계산서발행",
        "ONEBILL", "원빌", "화물맨", "로지노트", "로지노트플러스", "로지노트 플러스",
        "logynote plus", "loginote plus",
        "전국24시", "24시콜",
        "거래명세서", "거래명세",
        "tax12", "tax15",
        *_SUBJECT_TAX_NUMBERS,
        *_PRIORITY_TAX_KEYWORDS,
    ],
    "button_keywords": [
        "확인하기", "상세보기", "조회하기", "열람",
        "세금계산서 확인", "계산서 보기",
        "승인", "발행", "전자세금계산서",
    ],
    "recipient_keywords": [
        "세계로지스", "세 계 로 지 스",
    ],
    "sender_domain_blocklist": [
        "university.qoo10.jp",
        "qoo10.jp", "qoo10.com", "qoo10.co.kr", "university.qoo10",
        "gmarket.co.kr", "auction.co.kr", "11st.co.kr", "coupang.com",
        "tmon.co.kr", "wemakeprice.com", "interpark.com",
        "amazon.com", "aliexpress.com", "ebay.com",
        "marketing@", "newsletter@",
        "promotions@", "promo@", "ads@", "info@qoo10",
    ],
    "sender_domain_allowlist": [
        "tax12.co.kr", "tax15.co.kr", "hwamulman", "cargo12",
        "onebill", "onecall", "1call", "onbill", "1-bill",
        "loginote", "logynote", "logi-note",
        "logynoteplus", "loginoteplus", "lgnoteplus",
        "plus.logynote", "plus.loginote", "logynote-plus",
        "15887924", "ysm7924", "call24network", "24si.co", "24si",
    ],
    "imap_folders": _IMAP_FOLDERS if _IMAP_FOLDERS else ["INBOX"],
    "unread_only": False,
    "mark_as_read": False,
    "days_limit": _EMAIL_DAYS_INT,
    "tax_invoice_url_blocklist": [
        "university.qoo10.jp",
        "university.qoo10",
        "qoo10.jp",
        "qoo10.com",
        "qoo10.co.kr",
    ],
    "tax_platform_exclude_substrings": [
        "university.qoo10",
        "qoo10.jp",
        "qoo10.com",
        "큐텐",
        "마켓플레이스",
    ],
    "email_body_block_substrings": [
        "q10",
        "qoo10",
        "큐텐",
        "마켓플레이스",
    ],
    "imap_since_min_date": _IMAP_SINCE_MIN_DATE,
    # 수신일 기준(메일 Date 헤더) — IMAP SINCE 누락 대비
    "min_received_date": _IMAP_SINCE_MIN_DATE,
    # TAX_INVOICE_SUBJECT_STRICT: mandatory_tax_invoice_keyword_in_subject_or_sender() 에서 사용
    "invoice_subject_strict": _env_bool("TAX_INVOICE_SUBJECT_STRICT", True),
}

# True(기본): 국세청·전자세금계산서 등 공식 전자고지/홈택스 계열만 수집(스팸 완화). 알려진 운송 플랫폼 발신은 생략.
TAX_REQUIRE_ETAX_OR_NTS_SIGNAL = _env_bool("TAX_REQUIRE_ETAX_OR_NTS_SIGNAL", True)


def is_blocked_tax_invoice_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    u = url.lower()
    for pat in EMAIL_FILTER.get("tax_invoice_url_blocklist", []):
        if pat.lower() in u:
            return True
    return False


def url_looks_like_blocked_marketplace(url: str) -> bool:
    """
    Qoo10·쇼핑 URL 등: detect_platform()에서 화물맨/원콜 등 키워드 오인 전에 1차 차단.
    """
    if not url or not isinstance(url, str):
        return False
    u = url.lower()
    for pat in EMAIL_FILTER.get("tax_invoice_url_blocklist", []):
        if pat and pat.lower() in u:
            return True
    for pat in EMAIL_FILTER.get("tax_platform_exclude_substrings", []):
        if pat and pat.lower() in u:
            return True
    return False


def is_excluded_tax_platform(platform: str) -> bool:
    if not platform or not isinstance(platform, str):
        return False
    p = platform.lower()
    for pat in EMAIL_FILTER.get("tax_platform_exclude_substrings", []):
        if pat.lower() in p:
            return True
    return False


def _text_has_shopping_q10_token(s: str) -> bool:
    """큐텐/Qoo10 표기. 'q10' 단독 부분문자열은 ONEBILL·트래킹 URL 오탐이 있어 경계 사용."""
    if not s:
        return False
    sl = s.lower()
    if "qoo10" in sl or "qoo 10" in sl or "큐텐" in s:
        return True
    return bool(_re.search(r"\bq10\b", sl))


def is_spam_hard_blocked(from_addr: str, subject: str) -> bool:
    """
    제목·발신만 보고 즉시 제외 (Q10·광고·쇼핑 등). IMAP 본문 펼치기 전에도 호출 가능.
    """
    frm = (from_addr or "").strip()
    sub = subject or ""
    comb = f"{frm}\n{sub}"
    comb_l = comb.lower()
    if _text_has_shopping_q10_token(comb):
        return True
    if "큐텐" in comb or "qoo10" in comb_l or "coupang" in comb_l:
        return True
    if "광고" in comb:
        return True
    if _re.search(r"\[[^\]]*광고[^\]]*\]", sub):
        return True
    if "쇼핑" in comb or "shopping" in comb_l:
        return True
    if "특가" in comb and ("세일" in comb or "할인" in comb):
        return True
    return False


def is_blocked_invoice_email(
    from_addr: str,
    subject: str,
    body_html: str = "",
    body_text: str = "",
) -> bool:
    """
    Qoo10·큐텐·마켓플레이스 등은 발신·제목·본문 어디에든 있으면 수집 제외.
    """
    if is_spam_hard_blocked(from_addr, subject):
        return True
    if not from_addr:
        from_addr = ""
    fl = from_addr.lower()
    for dom in EMAIL_FILTER.get("sender_domain_blocklist", []):
        if dom and dom.lower() in fl:
            return True

    blob = f"{subject}\n{body_html}\n{body_text}"
    blob_l = blob.lower()
    for pat in EMAIL_FILTER.get("email_body_block_substrings", []):
        if not pat:
            continue
        pl = pat.lower()
        if pl in ("qoo10", "q10"):
            if _text_has_shopping_q10_token(blob):
                return True
        elif pat in blob or pat.lower() in blob_l:
            return True
    # ASCII 대체 표기
    if "marketplace" in blob_l and ("마켓" in blob or "market" in blob_l):
        pass  # 너무 광범위 — 제목/본문에 'marketplace' 단독은 차단하지 않음
    return False


def tax_priority_keywords_match(
    from_addr: str,
    subject: str,
    body_html: str = "",
    body_text: str = "",
) -> bool:
    """원콜·24시콜·화물맨·로지노트·tax숫자·세계로지스 발행 문구 — 발신·제목·본문 전체 (보조용)."""
    blob = f"{from_addr}\n{subject}\n{body_html}\n{body_text}"
    blob_l = blob.lower()
    subj_l = (subject or "").lower()
    if _re.search(r"\btax\s*\d{1,3}\b", subj_l, flags=_re.IGNORECASE):
        return True
    # HTML 랩/본문에서 공백만 다른 동일 문구 매칭
    compact = _re.sub(r"[\s\u200b\xa0]+", "", blob)
    compact_l = compact.lower()
    for kw in EMAIL_FILTER.get("priority_keywords", []):
        if not kw:
            continue
        if kw in blob or kw.lower() in blob_l:
            return True
        kw_compact = _re.sub(r"\s+", "", kw)
        if len(kw_compact) >= 3 and (
            kw_compact in compact or kw_compact.lower() in compact_l
        ):
            return True
    return False


def mandatory_tax_invoice_keyword_in_subject_or_sender(
    from_addr: str, subject: str,
) -> bool:
    """
    수집 대상 필수 조건 — 제목·발신만 (본문 제외).

    허용 키워드: 원콜·24시콜(화물)·화물맨·로지노트(영문 변형 포함)·``tax``+숫자(tax12 등)·@taxNN. 발신
    및 세계로지스 수취 세금계산서 제목.

    ``TAX_INVOICE_SUBJECT_STRICT=true``(기본)일 때 **영문 단독 ``tax``** 는 허용하지 않음
    (Q10·해외 스팸 ``Tax Invoice`` 등 차단). ``false`` 일 때만 ``\\btax\\b`` 완화.
    """
    strict = EMAIL_FILTER.get("invoice_subject_strict", True)
    frm = from_addr or ""
    sub = subject or ""
    blob = frm + "\n" + sub
    compact_blob = _re.sub(r"[\s\u200b\xa0]+", "", blob)
    frm_l = frm.lower()
    sub_l = sub.lower()
    hay = frm_l + "\n" + sub_l

    if matches_worldlogis_invoice_subject(sub):
        return True

    if matches_worldlogis_statement_subject(sub):
        return True

    if "원콜" in blob:
        return True
    if "원빌" in blob:
        return True
    if any(x in hay for x in ("onecall", "onebill", "onbill", "1-bill", "1call")):
        return True

    if "24시콜" in blob or "24시콜화물" in compact_blob or "전국24시콜화물" in compact_blob:
        return True
    if "전국24시" in blob and "콜" in blob:
        return True
    if any(x in hay for x in ("15887924", "ysm7924", "call24network", "call24")):
        return True

    if "화물맨" in blob or "hwamulman" in hay:
        return True

    if "로지노트" in blob or "로지노트플러스" in compact_blob:
        return True
    if any(x in hay for x in ("logynote", "loginote", "lgnoteplus", "logi-note")):
        return True

    if _TAX_NUMBER_SENDER_RE.search(frm):
        return True

    if _re.search(r"\btax\s*\d{1,3}\b", hay, flags=_re.IGNORECASE):
        return True

    if not strict:
        if _re.search(r"\btax\b", hay, flags=_re.IGNORECASE):
            return True

    for frag in (
        "세계로지스앞으로", "세계로지스앞으로발행", "세계로지스 앞으로",
        "세계로지스에게발행", "세계로지스에게", "세계로지스님께",
        "(주)세계로지스님", "세계로지스귀하", "세계로지스 귀하",
    ):
        c = _re.sub(r"[\s\u200b\xa0]+", "", frag)
        if c in compact_blob or frag.lower() in hay:
            return True

    return False


def get_imap_since_date_str(days_limit: int) -> str:
    """
    IMAP SINCE용 날짜 (DD-Mon-YYYY).
    고정 import값 대신: 매 호출마다 get_effective_mail_window_start_date() 사용.
    (days_limit 인자는 하위 호환용으로 남김, 무시)
    """
    d = get_effective_mail_window_start_date()
    return d.strftime("%d-%b-%Y")


def sender_matches_allowed_platforms(from_addr: str) -> bool:
    """화물맨·24시콜·원콜·로지노트(플러스)·taxNN.co.kr 계열만 True."""
    if not from_addr or not isinstance(from_addr, str):
        return False
    fl = from_addr.lower()
    allow = EMAIL_FILTER.get("sender_domain_allowlist", [])
    if any(a.lower() in fl for a in allow):
        return True
    if _EXTRA_SENDER_ALLOW_PATTERNS and any(
        p in fl for p in _EXTRA_SENDER_ALLOW_PATTERNS
    ):
        return True
    if _TAX_NUMBER_SENDER_RE.search(fl):
        return True
    return False


def is_carrier_trusted_from_address(from_addr: str) -> bool:
    """발신이 알려진 운송·세금@taxNN 도메인이면 (제목·본문에 '세계로지스' 없이도 수집)."""
    return sender_matches_allowed_platforms(from_addr)


def recipient_keyword_required(from_addr: str) -> bool:
    """
    화물맨/원콜 등 공식 발신이 아니면 본문·제목에 '세계로지스' 등이 있어야 수집.
    (공식 발신은 공급받는자 문구가 메일에 안 올 수 있음 → 기존 로직이 정본을 버림)
    """
    if is_carrier_trusted_from_address(from_addr):
        return False
    return True


def passes_etax_or_nts_spam_guard(
    from_addr: str,
    subject: str,
    body_html: str = "",
    body_text: str = "",
) -> bool:
    """
    제목/발신에 필수 키워드가 이미 걸린 경우 통과(mandatory 우선).
    그 외에는 본문·제목에서 전자세금·국세청·홈택스 신호 필요.
    """
    if not TAX_REQUIRE_ETAX_OR_NTS_SIGNAL:
        return True
    if mandatory_tax_invoice_keyword_in_subject_or_sender(from_addr, subject):
        return True
    compact = _re.sub(
        r"[\s\u200b\xa0]+", "", f"{subject}\n{body_html}\n{body_text}"
    )
    blob = f"{subject}\n{body_html}\n{body_text}"
    b = blob.lower()
    if "전자세금계산서" in compact or "전자세금계산서" in blob:
        return True
    if "국세청" in blob or "국세청" in compact:
        return True
    if "hometax.go.kr" in b or "teet.hometax" in b:
        return True
    if "전자세금" in compact and "계산서" in compact:
        return True
    return False


def matches_worldlogis_invoice_subject(subject: str) -> bool:
    """
    제목만으로 세계로지스 수취 세금계산서인지 판별.
    예: 'OOO에서 (주)세계로지스 님께 발행한 세금계산서 입니다', '전자세금계산서' 변형 포함.
    """
    if not subject or not isinstance(subject, str):
        return False
    compact = _re.sub(r"[\s\u200b\xa0]+", "", subject)
    if "세계로지스" not in compact:
        return False
    if "발행" not in compact:
        return False
    if "세금계산서" not in compact and "전자세금" not in compact:
        return False
    # 수취인 표기(쇼핑몰 '세금계산서' 단독 제목 배제)
    if not any(
        p in compact
        for p in (
            "님께",
            "귀하",
            "귀사",
            "세계로지스앞으로",
            "세계로지스에게",
            "세계로지스님",
            "(주)세계로지스님",
            "귀에게",
            "에게발행",
        )
    ):
        return False
    return True


def matches_worldlogis_statement_subject(subject: str) -> bool:
    """
    세계로지스 명의 월 거래명세서 등 자사 알림 메일.
    (기존 세금계산서 제목 규칙은 '발행'·'세금계산서' 필수라 명세서가 탈락하던 문제 보완)
    """
    if not subject or not isinstance(subject, str):
        return False
    compact = _re.sub(r"[\s\u200b\xa0]+", "", subject)
    if "세계로지스" not in compact:
        return False
    if "거래명세" not in compact:
        return False
    return True


def email_allowed_for_collection(
    from_addr: str,
    subject: str,
    body_html: str = "",
    body_text: str = "",
) -> bool:
    """
    (0) Q10·광고·쇼핑 등 — ``is_blocked_invoice_email`` 내부에서 제목·발신·본문 처리
    (1) ``TAX_INVOICE_SUBJECT_STRICT`` 반영 필수 키워드
    (2) TAX_REQUIRE_ETAX_OR_NTS_SIGNAL 시 세금 신호
    """
    if is_blocked_invoice_email(from_addr, subject, body_html, body_text):
        return False
    if not mandatory_tax_invoice_keyword_in_subject_or_sender(from_addr, subject):
        return False
    return passes_etax_or_nts_spam_guard(
        from_addr, subject, body_html, body_text
    )


# --- 발행 플랫폼 감지 규칙 ---
PLATFORM_RULES = {
    "화물맨": {
        "domains": ["tax12.co.kr", "tax15.co.kr", "hwamulman", "cargo12"],
        "subject_keywords": ["화물맨", "tax12", "tax15"],
        "sender_keywords": ["hwamulman", "tax12", "tax15", "cargo12"],
    },
    "원콜(ONEBILL)": {
        "domains": ["onecall", "onebill", "1call"],
        "subject_keywords": ["ONEBILL", "원콜", "원빌", "onebill"],
        "sender_keywords": ["onecall", "onebill", "1call"],
    },
    "로지노트플러스": {
        "domains": ["logynoteplus", "loginoteplus", "lgnoteplus", "plus.logynote", "plus.loginote"],
        "subject_keywords": ["로지노트플러스", "로지노트 플러스", "logynote plus"],
        "sender_keywords": ["logynoteplus", "loginoteplus", "plus.logynote", "plus.loginote"],
    },
    "로지노트": {
        "domains": ["loginote", "logynote", "logi-note"],
        "subject_keywords": ["로지노트", "loginote"],
        "sender_keywords": ["loginote", "logynote", "logi-note"],
    },
    "전국24시콜화물": {
        "domains": ["15887924", "ysm7924", "call24network", "24si.co", "24si"],
        "subject_keywords": ["전국24시", "24시콜", "15887924", "전국24시콜", "콜화물"],
        "sender_keywords": ["15887924", "ysm7924", "call24network", "24si"],
    },
}

# --- 사업자 정보 (조회·입력용, 비밀 아님) ---
_bn = _env("TAX_BUSINESS_NUMBER")
_fmt = _env("TAX_BUSINESS_NUMBER_FORMATTED")
if _bn and not _fmt and len(_bn.replace("-", "")) == 10:
    d = _bn.replace("-", "")
    _fmt = f"{d[:3]}-{d[3:5]}-{d[5:]}"
if _fmt and not _bn:
    _bn = _fmt.replace("-", "").replace(" ", "")
if not _bn:
    _bn = "1418142581"
if not _fmt:
    _fmt = "141-81-42581"

BUSINESS_CONFIG = {
    "business_number": _bn,
    "business_number_formatted": _fmt,
    "company_name": _env("TAX_COMPANY_NAME", "세계로지스"),
    "representative": _env("TAX_REPRESENTATIVE", "유병철"),
}

# --- Firebase Admin SDK ---
FIREBASE_ADMIN_CONFIG = {
    "credentials_file": _CREDENTIALS_FILE,
    "project_id": _env("FIREBASE_PROJECT_ID")
    or _env("TAX_FIREBASE_PROJECT_ID", "gen-lang-client-0127550748"),
    "storage_bucket": _env("FIREBASE_STORAGE_BUCKET")
    or _env("TAX_FIREBASE_STORAGE_BUCKET", "gen-lang-client-0127550748.firebasestorage.app"),
    "database_id": _env("FIRESTORE_DATABASE_ID")
    or _env("TAX_FIRESTORE_DATABASE_ID", "ai-studio-08ae3b29-6eb5-4e08-8bb0-f20ab80e5ffc"),
}

# --- 브라우저 설정 ---
BROWSER_CONFIG = {
    "browser": "chromium",
    "headless": True,
    "viewport": {"width": 1280, "height": 900},
    "timeout": 60000,
    "slow_mo": 400,
    "full_page_screenshot": True,
    "ignore_https_errors": True,
    "image_load_wait_ms": 30_000,
    "issue_approve_hunt_ms": 30_000,
    "confirm_selector_timeout_ms": 10_000,
}

BIZ_NUMBER_INPUT_SELECTORS = [
    "input[type='text']",
    "input[type='number']",
    "input[type='tel']",
    "input[placeholder*='사업자']",
    "input[placeholder*='번호']",
    "input[placeholder*='등록']",
    "input[name*='biz']", "input[name*='Biz']",
    "input[name*='corp']", "input[name*='Corp']",
    "input[name*='reg']",  "input[id*='biz']",
    "input[id*='corp']",   "input[id*='reg']",
]

CONFIRM_BUTTON_SELECTORS = [
    "button:has-text('확인')",
    "button:has-text('조회')",
    "button:has-text('확인하기')",
    "button:has-text('검색')",
    "button:has-text('열람')",
    "button:has-text('Submit')",
    "button:has-text('OK')",
    "input[type='submit']",
    "input[type='button'][value*='확인']",
    "input[type='button'][value*='조회']",
    ".btn-confirm", ".btn-submit", ".btn-ok",
    "#btnConfirm", "#btnSubmit", "#btnOk",
    "a.btn:has-text('확인')",
]

# 원콜·전자세금 뷰어(메일 링크) — 공동인증 없이 노출되는 승인/발행 UI만 대상
ISSUE_APPROVE_BUTTON_SELECTORS = [
    "button:has-text('승인')",
    "button:has-text('발행')",
    "button:has-text('전자세금계산서 승인')",
    "a:has-text('승인')",
    "a:has-text('발행')",
    "a:has-text('전자세금계산서 승인')",
    "[role='button']:has-text('승인')",
    "[role='button']:has-text('발행')",
    "input[type='button'][value*='승인']",
    "input[type='submit'][value*='승인']",
    "input[type='button'][value*='발행']",
    "input[type='submit'][value*='발행']",
]

# --- OCR ---
import platform as _platform

_tesseract_path = _env("TESSERACT_PATH")
OCR_CONFIG = {
    "enabled": _env_bool("TAX_OCR_ENABLED", True),
    "engine": _env("TAX_OCR_ENGINE", "tesseract"),
    "tesseract_path": (
        _tesseract_path
        if _tesseract_path
        else (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe"
            if _platform.system() == "Windows"
            else "/usr/bin/tesseract"
        )
    ),
    "languages": _env("TESSERACT_LANGUAGES", "kor+eng"),
    "capture_tables": _env_bool("TAX_OCR_CAPTURE_TABLES", True),
}

STORAGE_CONFIG = {
    "output_dir": _env("TAX_OUTPUT_DIR", "output"),
    "folder_structure": "{year}/{month}/{day}/{platform}",
    "summary_filename": "summary_{date}.json",
}

_sheets_cred = _env("TAX_SHEETS_CREDENTIALS_PATH")
SHEETS_CONFIG = {
    "enabled": _env_bool("TAX_SHEETS_ENABLED", True),
    "credentials_file": _sheets_cred if _sheets_cred else _CREDENTIALS_FILE,
    "spreadsheet_id": _env("TAX_SHEETS_SPREADSHEET_ID") or _env("GOOGLE_SHEETS_SPREADSHEET_ID", ""),
    "sheet_name": _env("TAX_SHEETS_SHEET_NAME", "세금계산서"),
    "headers": [
        "처리일시", "발행출처", "발행일자", "승인번호",
        "공급자", "공급자_사업자번호",
        "공급가액", "세액", "합계금액",
        "비고", "이메일_제목", "원본_URL",
        "스크린샷_경로", "JSON_경로",
    ],
}
