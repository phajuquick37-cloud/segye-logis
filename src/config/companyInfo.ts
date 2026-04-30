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

/**
 * 신용내역·거래명세 공통: 공급가 = 요금열 집계분 + 탁송 열 값 → 부가세 포함 합계.
 * 요금열 집계분은 업로드 시 (행 금액 − 행 탁송) 합산값.
 */
export function grandTotalVatIncluded(record: { total_amount: number; delivery_fee?: number }): number {
  const supply = record.total_amount + (record.delivery_fee ?? 0);
  return Math.round(supply * (1 + VAT_RATE));
}

/** 명세 상단: 공급가액(요금+탁송) · VAT · 합계 — `grandTotal`은 목록 합계(부가포함)와 동일 */
export function statementSupplyVatGrand(record: { total_amount: number; delivery_fee?: number }) {
  const supplyBase = record.total_amount + (record.delivery_fee ?? 0);
  const grandTotal = Math.round(supplyBase * (1 + VAT_RATE));
  const vatTotal = grandTotal - supplyBase;
  return { supplyBase, vatTotal, grandTotal };
}
