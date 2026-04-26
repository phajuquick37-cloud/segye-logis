// ──────────────────────────────────────────────────────────
// 세계로지스 공급자 정보 — 거래명세서에 표시되는 상수값
// 변경이 필요하면 이 파일만 수정하세요.
// ──────────────────────────────────────────────────────────

export const SUPPLIER = {
  name:           "세계로지스",
  biz_no:         "141-81-42561",
  representative: "대 표 자",
  address:        "경기도 파주시 등원로427",
  phone:          "1588-7185",
  fax:            "",
  email:          "phajuquick37@gmail.com",
  business_type:  "운수업",
  business_item:  "화물운송",
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
