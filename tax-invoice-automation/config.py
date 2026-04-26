# =============================================================================
# 세계로지스 세금계산서 자동화 툴 v2 - 통합 설정 파일
# =============================================================================

import os as _os
import re as _re

# config.py가 위치한 디렉터리 → Windows/Linux 양쪽에서 절대 경로 보장
_BASE_DIR = _os.path.dirname(_os.path.abspath(__file__))
_CREDENTIALS_FILE = _os.path.join(_BASE_DIR, "google_credentials.json")

# 화물맨 등 tax10.co.kr ~ tax99.co.kr 스타일 발신 메일
_TAX_NUMBER_SENDER_RE = _re.compile(r"@tax\d{1,3}\.", _re.IGNORECASE)

# subject_keywords용 tax10 ~ tax40 (제목에 tax16 등만 있는 알림 대비)
_SUBJECT_TAX_NUMBERS = [f"tax{n}" for n in range(10, 41)]

# --- 이메일 설정 (Gmail IMAP) ---
EMAIL_CONFIG = {
    "imap_server": "imap.gmail.com",
    "imap_port": 993,
    "email_address": "phajuquick37@gmail.com",
    "app_password": "mflc bqcl fkbe rfsn",
}

# --- 이메일 필터 ---
_EMAIL_DAYS = _os.environ.get("TAX_EMAIL_DAYS_LIMIT", "365").strip()
try:
    _EMAIL_DAYS_INT = max(1, min(3650, int(_EMAIL_DAYS)))
except ValueError:
    _EMAIL_DAYS_INT = 365

EMAIL_FILTER = {
    # ── 제목 키워드: 세금계산서 발행 알림만 수집 ───────────────────────────
    "subject_keywords": [
        "세금계산서", "전자세금계산서", "계산서 발행", "계산서발행",
        "ONEBILL", "화물맨", "로지노트", "로지노트플러스", "로지노트 플러스",
        "logynote plus", "loginote plus",
        "전국24시", "24시콜",
        "tax12", "tax15",
        *_SUBJECT_TAX_NUMBERS,
    ],
    # ── 본문 링크 텍스트 키워드 (버튼명) ──────────────────────────────────
    "button_keywords": [
        "확인하기", "상세보기", "조회하기", "열람",
        "세금계산서 확인", "계산서 보기",
    ],
    # ── 공급받는자 검증 키워드 ─────────────────────────────────────────────
    # 이메일 본문에 아래 키워드 중 하나 이상이 있어야 수집
    # → (주)세계로지스에게 발행된 계산서만 수집
    "recipient_keywords": [
        "세계로지스", "세 계 로 지 스",
    ],
    # ── 발신자 도메인 차단 목록 ──────────────────────────────────────────────
    # 허용목록으로 대부분 걸러지지만, 아래는 무조건 차단 (피싱/스팸 방어)
    # 허용 발신자가 아닌 메일만 걸러냄 (noreply@ 단독 금지는 넣지 않음 — tax12 알림이 noreply인 경우 많음)
    "sender_domain_blocklist": [
        "qoo10.jp", "qoo10.com", "qoo10.co.kr", "university.qoo10",
        "gmarket.co.kr", "auction.co.kr", "11st.co.kr", "coupang.com",
        "tmon.co.kr", "wemakeprice.com", "interpark.com",
        "amazon.com", "aliexpress.com", "ebay.com",
        "marketing@", "newsletter@",
        "promotions@", "promo@", "ads@", "info@qoo10",
    ],
    # ── 발신자 허용 목록 ──────────────────────────────────────────────────
    # 화물맨·전국24시콜·원콜·로지노트(플러스)·tax(숫자) 도메인 만 (그 외 발신은 무시)
    "sender_domain_allowlist": [
        "tax12.co.kr", "tax15.co.kr", "hwamulman", "cargo12",
        "onebill", "onecall", "1call",
        "loginote", "logynote", "logi-note",
        "logynoteplus", "loginoteplus", "lgnoteplus",
        "plus.logynote", "plus.loginote", "logynote-plus",
        "15887924", "ysm7924", "call24network", "24si.co",
    ],
    # 휴지통은 보지 않음. 보관함만 보려면 INBOX 만; 보관·전체(휴지통 제외)까지 보려면 All Mail 추가
    "imap_folders": ["INBOX", "[Gmail]/All Mail"],
    "unread_only": False,
    "mark_as_read": False,
    "days_limit": _EMAIL_DAYS_INT,
    # ── 본문/버튼 링크 URL 차단 (발신자는 허용돼도 링크가 Qoo10 등이면 제외) ──
    "tax_invoice_url_blocklist": [
        "university.qoo10.jp",
        "university.qoo10",
        "qoo10.jp",
        "qoo10.com",
        "qoo10.co.kr",
    ],
    # ── 저장 제외할 발행출처 문자열 (부분 일치, 소문자 비교) ──
    # 예: 플랫폼명 "기타(university.qoo10.jp)" 전체 제외
    "tax_platform_exclude_substrings": [
        "university.qoo10",
        "qoo10.jp",
    ],
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

# --- 사업자 정보 ---
BUSINESS_CONFIG = {
    "business_number": "1418142581",   # 하이픈 없는 10자리
    "business_number_formatted": "141-81-42581",
    "company_name": "세계로지스",
    "representative": "유병철",
}

# --- Firebase Admin SDK 설정 ---
FIREBASE_ADMIN_CONFIG = {
    # 절대 경로 사용 — 서버 작업 디렉터리와 무관하게 파일을 찾음
    "credentials_file": _CREDENTIALS_FILE,
    # 실제 홈페이지 Firebase 프로젝트
    "project_id": "gen-lang-client-0127550748",
    # Firebase Storage 버킷명
    "storage_bucket": "gen-lang-client-0127550748.firebasestorage.app",
    # 커스텀 Firestore 데이터베이스 ID (기본값이 아닌 경우 필수)
    "database_id": "ai-studio-08ae3b29-6eb5-4e08-8bb0-f20ab80e5ffc",
}

# --- 브라우저 설정 ---
BROWSER_CONFIG = {
    "browser": "chromium",
    "headless": True,           # Linux 서버에서는 True (창 없이 실행)
    "viewport": {"width": 1280, "height": 900},
    "timeout": 60000,
    "slow_mo": 400,
    "full_page_screenshot": True,
}

# --- 사업자번호 입력창 감지 선택자 (공통 속성 기반) ---
BIZ_NUMBER_INPUT_SELECTORS = [
    # type 기반
    "input[type='text']",
    "input[type='number']",
    "input[type='tel']",
    # placeholder 기반 (한국어)
    "input[placeholder*='사업자']",
    "input[placeholder*='번호']",
    "input[placeholder*='등록']",
    # name/id 기반
    "input[name*='biz']", "input[name*='Biz']",
    "input[name*='corp']", "input[name*='Corp']",
    "input[name*='reg']",  "input[id*='biz']",
    "input[id*='corp']",   "input[id*='reg']",
    # 비밀번호 형식 입력창 (일부 사이트에서 사용)
    "input[type='password']",
]

# --- 확인 버튼 감지 선택자 ---
CONFIRM_BUTTON_SELECTORS = [
    # 버튼 텍스트 기반 (Playwright :text() 사용)
    "button:has-text('확인')",
    "button:has-text('조회')",
    "button:has-text('확인하기')",
    "button:has-text('검색')",
    "button:has-text('열람')",
    "button:has-text('Submit')",
    "button:has-text('OK')",
    # input submit
    "input[type='submit']",
    "input[type='button'][value*='확인']",
    "input[type='button'][value*='조회']",
    # 일반 class/id
    ".btn-confirm", ".btn-submit", ".btn-ok",
    "#btnConfirm", "#btnSubmit", "#btnOk",
    "a.btn:has-text('확인')",
]

# --- OCR 설정 ---
import platform as _platform
OCR_CONFIG = {
    "enabled": True,
    # "tesseract" 또는 "easyocr"
    "engine": "tesseract",
    # OS에 따라 자동으로 tesseract 경로 설정
    "tesseract_path": (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if _platform.system() == "Windows"
        else "/usr/bin/tesseract"
    ),
    # 언어 설정
    "languages": "kor+eng",
    # 테이블 캡처 여부
    "capture_tables": True,
}

# --- 저장 경로 ---
STORAGE_CONFIG = {
    "output_dir": "output",
    # 세금계산서 작성일 기준 연/월/일/플랫폼 폴더 구조
    "folder_structure": "{year}/{month}/{day}/{platform}",
    "summary_filename": "summary_{date}.json",
}

# --- Google Sheets 설정 ---
SHEETS_CONFIG = {
    "enabled": True,
    # 절대 경로 사용 — 서버 작업 디렉터리와 무관하게 파일을 찾음
    "credentials_file": _CREDENTIALS_FILE,
    # 스프레드시트 ID (URL에서 추출: /spreadsheets/d/[ID]/edit)
    "spreadsheet_id": "",   # ← 실제 스프레드시트 ID 입력
    # 데이터 기록할 시트 이름
    "sheet_name": "세금계산서",
    # 헤더 행 (최초 1회 자동 생성)
    "headers": [
        "처리일시", "발행출처", "발행일자", "승인번호",
        "공급자", "공급자_사업자번호",
        "공급가액", "세액", "합계금액",
        "비고", "이메일_제목", "원본_URL",
        "스크린샷_경로", "JSON_경로",
    ],
}
