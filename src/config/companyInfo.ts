// ──────────────────────────────────────────────────────────
// 세계로지스 공급자 정보 — 거래명세서에 표시되는 상수값
// 변경이 필요하면 이 파일만 수정하세요.
// ──────────────────────────────────────────────────────────

export const SUPPLIER = {
  name:           "세계로지스",
  biz_no:         "000-00-00000",      // ← 실제 사업자번호로 교체
  representative: "대 표 자",          // ← 대표자 성명
  address:        "경기도 파주시 ○○로 ○○○",  // ← 실제 주소
  phone:          "031-000-0000",       // ← 대표 전화
  fax:            "031-000-0001",       // ← 팩스 (없으면 빈 문자열)
  email:          "phajuquick37@gmail.com",
  business_type:  "운수업",             // 업태
  business_item:  "화물운송",           // 종목
};

// ──────────────────────────────────────────────────────────
// EmailJS 설정
// https://www.emailjs.com/ 에서 Service ID / Template ID 확인
// PUBLIC_KEY = EmailJS 대시보드 → Account → Public Key
// ──────────────────────────────────────────────────────────
export const EMAILJS = {
  SERVICE_ID:  "service_xxxxxxx",   // ← EmailJS 서비스 ID 교체
  TEMPLATE_ID: "template_xxxxxxx", // ← EmailJS 템플릿 ID 교체
  PUBLIC_KEY:  "xxxxxxxxxxxxxxxx",  // ← EmailJS Public Key 교체
};

// ──────────────────────────────────────────────────────────
// 부가세 설정
// ──────────────────────────────────────────────────────────
export const VAT_RATE = 0.1; // 10%
