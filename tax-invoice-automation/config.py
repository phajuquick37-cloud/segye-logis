# =============================================================================
# 세계로지스 세금계산서 자동화 툴 v2 - 통합 설정 파일
# 민감 값은 환경 변수만 사용 (코드/저장소에 비밀번호·키를 넣지 않음)
# =============================================================================

import os as _os
import re as _re
from datetime import datetime as _dt

_BASE_DIR = _os.path.dirname(_os.path.abspath(__file__))


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

# subject_keywords용 tax10 ~ tax40 (제목에 tax16 등만 있는 알림 대비)
_SUBJECT_TAX_NUMBERS = [f"tax{n}" for n in range(10, 41)]

# --- Gmail IMAP (앱 비밀번호는 공백 없이 넣어도 됨) ---
_imap_pw = _env("TAX_IMAP_APP_PASSWORD") or _env("GMAIL_APP_PASSWORD")
_imap_pw_norm = _imap_pw.replace(" ", "") if _imap_pw else ""

EMAIL_CONFIG = {
    "imap_server": _env("TAX_IMAP_SERVER", "imap.gmail.com"),
    "imap_port": _env_int("TAX_IMAP_PORT", 993),
    "email_address": _env("TAX_IMAP_EMAIL") or _env("GMAIL_USER"),
    "app_password": _imap_pw_norm,
}

# --- 이메일 필터 ---
_EMAIL_DAYS = _env("TAX_EMAIL_DAYS_LIMIT", "365")
try:
    _EMAIL_DAYS_INT = max(1, min(3650, int(_EMAIL_DAYS)))
except ValueError:
    _EMAIL_DAYS_INT = 365

# 메일함 전역 하한 (예: 2026-04-10부터 재스캔). 환경 변수를 빈 값으로 두면 days_limit만 사용.
_SINCE_MIN_RAW = _env("TAX_EMAIL_SINCE_MIN", "2026-04-10")
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

_imap_folders_raw = _env("TAX_IMAP_FOLDERS", "INBOX,[Gmail]/All Mail")
_IMAP_FOLDERS = [x.strip() for x in _imap_folders_raw.split(",") if x.strip()]

# 필수 우선 수집: 발신자·제목에 있으면 발신 도메인 제한 없이 2차 검증(세계로지스 등)만 통과하면 수집
_PRIORITY_TAX_KEYWORDS = [
    "원콜", "24시콜", "화물맨", "로지노트", "세금계산서",
    "tax",  # 제목·발신에 포함 (차단 메일은 아래 블록에서 걸러짐)
]

EMAIL_FILTER = {
    "priority_keywords": _PRIORITY_TAX_KEYWORDS,
    "subject_keywords": [
        "세금계산서", "전자세금계산서", "계산서 발행", "계산서발행",
        "ONEBILL", "화물맨", "로지노트", "로지노트플러스", "로지노트 플러스",
        "logynote plus", "loginote plus",
        "전국24시", "24시콜",
        "tax12", "tax15",
        *_SUBJECT_TAX_NUMBERS,
        *_PRIORITY_TAX_KEYWORDS,
    ],
    "button_keywords": [
        "확인하기", "상세보기", "조회하기", "열람",
        "세금계산서 확인", "계산서 보기",
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
        "onebill", "onecall", "1call",
        "loginote", "logynote", "logi-note",
        "logynoteplus", "loginoteplus", "lgnoteplus",
        "plus.logynote", "plus.loginote", "logynote-plus",
        "15887924", "ysm7924", "call24network", "24si.co",
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
        "qoo10",
        "큐텐",
        "마켓플레이스",
    ],
    "imap_since_min_date": _IMAP_SINCE_MIN_DATE,
}


def is_blocked_tax_invoice_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    u = url.lower()
    for pat in EMAIL_FILTER.get("tax_invoice_url_blocklist", []):
        if pat.lower() in u:
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


def is_blocked_invoice_email(
    from_addr: str,
    subject: str,
    body_html: str = "",
    body_text: str = "",
) -> bool:
    """
    Qoo10·큐텐·마켓플레이스 등은 발신·제목·본문 어디에든 있으면 수집 제외.
    """
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
        if pl in ("qoo10",):
            if "qoo10" in blob_l or "qoo 10" in blob_l:
                return True
        elif pat in blob or pat.lower() in blob_l:
            return True
    # ASCII 대체 표기
    if "marketplace" in blob_l and ("마켓" in blob or "market" in blob_l):
        pass  # 너무 광범위 — 제목/본문에 'marketplace' 단독은 차단하지 않음
    return False


def tax_priority_keywords_match(from_addr: str, subject: str) -> bool:
    """원콜·화물맨·24시콜·로지노트·세금·tax — 발신 또는 제목."""
    blob = f"{from_addr}\n{subject}"
    blob_l = blob.lower()
    for kw in EMAIL_FILTER.get("priority_keywords", []):
        if not kw:
            continue
        if kw.lower() == "tax":
            if _re.search(r"\btax\b", blob_l, _re.I):
                return True
        else:
            if kw in blob or kw.lower() in blob_l:
                return True
    return False


def get_imap_since_date_str(days_limit: int) -> str:
    """IMAP SINCE용 날짜 (DD-Mon-YYYY). TAX_EMAIL_SINCE_MIN이 있으면 그날부터만 검색."""
    from datetime import datetime, timedelta

    if EMAIL_FILTER.get("imap_since_min_date"):
        d = EMAIL_FILTER["imap_since_min_date"]
    else:
        d = (datetime.now() - timedelta(days=max(1, days_limit))).date()
    return d.strftime("%d-%b-%Y")


def sender_matches_allowed_platforms(from_addr: str) -> bool:
    """화물맨·24시콜·원콜·로지노트(플러스)·taxNN.co.kr 계열만 True."""
    if not from_addr or not isinstance(from_addr, str):
        return False
    fl = from_addr.lower()
    allow = EMAIL_FILTER.get("sender_domain_allowlist", [])
    if any(a.lower() in fl for a in allow):
        return True
    if _TAX_NUMBER_SENDER_RE.search(fl):
        return True
    return False


# --- 발행 플랫폼 감지 규칙 ---
PLATFORM_RULES = {
    "화물맨": {
        "domains": ["tax12.co.kr", "tax15.co.kr", "hwamulman", "cargo12"],
        "subject_keywords": ["화물맨", "tax12", "tax15"],
        "sender_keywords": ["hwamulman", "tax12", "tax15", "cargo12"],
    },
    "원콜(ONEBILL)": {
        "domains": ["onecall", "onebill", "1call"],
        "subject_keywords": ["ONEBILL", "원콜", "onebill"],
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
        "domains": ["15887924", "ysm7924", "call24network", "24si.co"],
        "subject_keywords": ["전국24시", "24시콜", "15887924"],
        "sender_keywords": ["15887924", "ysm7924", "call24network"],
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
    "input[type='password']",
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
