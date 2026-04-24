# =============================================================================
# 세계로지스 세금계산서 자동화 툴 v2 - 통합 설정 파일
# =============================================================================

# --- 이메일 설정 (Gmail IMAP) ---
EMAIL_CONFIG = {
    "imap_server": "imap.gmail.com",
    "imap_port": 993,
    "email_address": "phajuquick37@gmail.com",
    "app_password": "mflc bqcl fkbe rfsn",
}

# --- 이메일 필터 ---
EMAIL_FILTER = {
    # 제목에 포함된 키워드 — 세금계산서 관련만 엄격하게 필터링
    "subject_keywords": [
        "세금계산서", "전자세금계산서", "계산서발행",
        "ONEBILL", "화물맨", "로지노트", "tax12", "tax15",
    ],
    # 본문 링크 텍스트 키워드 (버튼명)
    "button_keywords": [
        "확인하기", "상세보기", "조회하기", "열람",
        "세금계산서 확인", "계산서 보기",
    ],
    # 정상 운영 모드: 읽지 않은 메일만, 최근 7일
    "unread_only": True,
    "mark_as_read": True,
    "days_limit": 7,
}

# --- 발행 플랫폼 감지 규칙 ---
PLATFORM_RULES = {
    "화물맨": {
        "domains": ["tax12.co.kr", "tax15.co.kr", "hwamulman", "cargo12"],
        "subject_keywords": ["화물맨", "tax12", "tax15"],
        "sender_keywords": ["hwamulman", "tax12", "tax15"],
    },
    "원콜(ONEBILL)": {
        "domains": ["onecall", "onebill", "1call"],
        "subject_keywords": ["ONEBILL", "원콜", "onebill"],
        "sender_keywords": ["onecall", "onebill"],
    },
    "로지노트": {
        "domains": ["loginote", "logynote", "logi-note"],
        "subject_keywords": ["로지노트", "loginote"],
        "sender_keywords": ["loginote", "logynote"],
    },
    "홈택스": {
        "domains": ["hometax.go.kr", "nts.go.kr"],
        "subject_keywords": ["국세청", "홈택스"],
        "sender_keywords": ["nts.go.kr", "hometax"],
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
    # Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 후 저장
    "credentials_file": "google_credentials.json",
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
    "timeout": 30000,
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
    "folder_structure": "{year}/{month}/{platform}",
    "summary_filename": "summary_{date}.json",
}

# --- Google Sheets 설정 ---
SHEETS_CONFIG = {
    "enabled": True,
    # Google Cloud 서비스 계정 JSON 파일 경로
    "credentials_file": "google_credentials.json",
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
