import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────
// 컬럼 키 정의
// ─────────────────────────────────────────────────────────────
export type ColKey =
  | "date" | "client" | "base_amount" | "discount_amount" | "amount" | "deliveryfee"
  | "payment" | "row_status" | "memo" | "jeeyo" | "bizno" | "duedate"
  | "departure" | "destination" | "vehicle_type" | "driver" | "vehicle_no"
  | "unload_client" | "row_client" | "round_trip";

/** 각 컬럼 키별 인식 후보 헤더명 (앞쪽일수록 우선순위 높음) */
export const COL_HINTS: Record<ColKey, string[]> = {
  date: [
    "날짜", "일자", "거래일", "작성일", "발행일", "배송일", "출고일",
    "인도일", "처리일", "주문일", "거래날짜", "기일", "date",
  ],
  // ★ 신용거래처 컬럼(예: 엑셀 AT열 「거래처명」)
  //   · 셀에 상호가 있으면 → 신용거래처 마감 집계 대상
  //   · 비어 있으면 → 일반(착불) 고객 행으로 보고 집계에서 제외 (고객명·출발/도착 등 다른 열과 무관)
  //   ※ "상호" 단독 힌트는 제외 — "고객명(상호)" 등이 거래처로 오인되는 것 방지
  client: [
    "거래처명", "거래처",
    "업체명",
    "상호명",
    "회사명", "기업명",
    "법인명", "발주처",
    "청구처", "청구거래처", "정산거래처",
    "client",
  ],
  // 집계·청구 금액 (녹원 등: 「요금」 열 — 녹원 「기본」열은 base_amount 가 먼저 잡힘)
  base_amount: [
    "기본", "기본요금", "기본 운임", "기본운임", "표준요금",
  ],
  discount_amount: [
    "할인요금", "할인금액", "할인 액", "할인액", "할인",
    "할인비용", "요금할인",
    "감액", "DC금액", "DC", "D/C",
    "dc", "discount",
  ],
  amount: [
    "요금", "운임요금",
    "합계금액", "청구금액", "결제금액", "총금액", "공급대가",
    "총액", "금액", "청구", "운임", "운임비",
    "공급가액", "세액포함합계", "amount", "total",
  ],
  deliveryfee: [
    "탁송료", "탁송비", "배달료", "배달비", "배송료", "택배비", "택배료",
    "delivery_fee", "deliveryfee",
  ],
  // 신용내역: 「신용」만 집계 — 선불/착불 등 제외 (헤더는 지급기한과 혼동 방지 위해 긴 이름 우선·정확 일치 보조)
  payment: [
    "지급구분", "결제구분", "수금구분", "결제방법", "수금방법", "정산구분",
    "선착불구분", "지급방식", "결제유형", "paytype", "paymenttype",
  ],
  /** 배차/마감 시트 「상태」: 완료만 요금 집계, 문의·취소는 지급이 신용이어도 제외 */
  row_status: [
    "상태", "처리상태", "진행상태", "배차상태", "진행 상태",
    "orderstatus", "deliverystatus",
  ],
  memo: ["비고", "메모", "특이사항", "참고", "내용", "memo", "note", "notes"],
  // 래피드 양식 비고란 등 — 비고 열과 별도
  jeeyo: ["적요", "적요사항", "적 요", "적요내용", "summary", "remarks"],
  bizno: ["사업자번호", "사업자등록번호", "biz_no", "bizno"],
  duedate: ["결제일", "결제일자", "납입일", "지급기한", "납기일", "납기", "만기일", "결제기한", "due_date", "duedate"],
  // ── 거래명세표 세부 항목 컬럼 (출발동·도착동·차량 우선 — 지번/동 단위 열 우선 매핑)
  departure: [
    "출발동", "출발 동", "출발지역", "출발구역", "상차동", "상차 동",
    "출발지", "상차지", "상차", "출발처", "발송지", "from", "출발",
  ],
  destination: [
    "도착동", "도착 동", "도착지역", "도착구역", "하차동", "하차 동",
    "도착지", "목적지", "하차지", "배송지", "도착처", "to", "도착",
  ],
  vehicle_type: [
    "차량", "차량명", "차량종류", "차량형태", "차종",
    "톤수", "톤", "ton", "tonnage",
  ],
  driver:        ["라이더", "라이더명", "기사명", "기사", "운전자", "드라이버", "driver"],
  vehicle_no:    ["차량번호", "차번", "번호판", "차량번", "plate"],
  unload_client: ["하차지고객", "하차고객", "하차처고객", "하차처"],
  row_client:    ["고객명", "고객", "고객명(상호)", "수하인", "customer"],
  round_trip:    ["왕복", "왕복구분", "편도 왕복", "편도왕복", "편도·왕복", "왕·편"],
};

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────
export interface RawRow {
  date: string;       // ISO "YYYY-MM-DD" (없으면 "")
  clientName: string;
  /** 엑셀 기본요금 열 (선택) */
  baseAmount?: number;
  /** 엑셀 할인요금 열 (선택) */
  discountAmount?: number;
  amount: number;
  deliveryFee: number;
  memo: string;
  /** 적요 (래피드 양식 비고 등) */
  jeeyo?: string;
  bizNo: string;
  dueDate: string;
  // 거래명세표 세부 항목 필드
  departure?: string;
  destination?: string;
  vehicleType?: string;
  driver?: string;
  vehicleNo?: string;
  unloadClient?: string;
  rowClient?: string;   // 행별 고객명(상호) — 거래처명과 별도
  roundTrip?: string;
  /** 지급란 원문(신용/선불/착불 등) — 신용 집계 판별용 */
  paymentLabel?: string;
  /** 상태 열 원문(완료/문의/취소 등) — 매핑된 경우만 집계에 사용 */
  statusLabel?: string;
  /** 원본 셀 값 전체 (컬럼 헤더 → 값) */
  _original: Record<string, any>;
}

export interface DetectedCols {
  date: string | null;
  client: string | null;
  base_amount: string | null;
  discount_amount: string | null;
  amount: string | null;
  deliveryfee: string | null;
  payment: string | null;
  row_status: string | null;
  memo: string | null;
  jeeyo: string | null;
  bizno: string | null;
  duedate: string | null;
  departure: string | null;
  destination: string | null;
  vehicle_type: string | null;
  driver: string | null;
  vehicle_no: string | null;
  unload_client: string | null;
  row_client: string | null;
  round_trip: string | null;
  /** 파일 내 전체 헤더 목록 */
  allHeaders: string[];
}

export interface ParseResult {
  rows: RawRow[];
  detected: DetectedCols;
  /** 인식된 헤더 인덱스 (수동 오버라이드용) */
  detectedIdx: Record<ColKey, number>;
  fileName: string;
  sheetName: string;
  warnings: string[];
  /**
   * 거래처명(client) 열이 비어 있어 신용 마감 집계에서 제외된 데이터 행 수.
   * (일반 고객·착불 등 — 금액이 있어도 거래처명이 공란이면 신용거래처로 보지 않음)
   */
  skippedNonCreditRows: number;
  /** 지급란이 신용이 아니거나 공란·지급 열 없음으로 제외된 행 수 */
  skippedNonCreditPaymentRows: number;
  /**
   * 상태 열이 인식된 경우, 「완료」가 아닌(문의·취소·공란·미완료 등) 신용 행 수.
   * (집계에는 넣지 않음 — 업로드 패널·재매핑과 동일 규칙)
   */
  skippedNonCompleteStatusRows: number;
}

// ─────────────────────────────────────────────────────────────
// 헬퍼: 헤더 정규화 (공백·부호 제거, 소문자)
// ─────────────────────────────────────────────────────────────
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-\(\)\[\]（）]/g, "");
}

/** 신용 구분용 거래처명 셀 정규화 (공백·유니코드·제로폭 제거) */
export function normalizeCreditClientCell(val: unknown): string {
  if (val == null || val === "") return "";
  let s = String(val).replace(/[\u200b-\u200d\ufeff]/g, "");
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  return s.trim();
}

/**
 * 엑셀 집계 `ar_records.client_name` ↔ 거래처 정보 `client_profiles.name` ↔ 거래명세표 공급받는자 연동용.
 * (NFKC·제로폭 제거 + 연속 공백을 한 칸으로)
 */
export function normalizeCreditNameForLink(name: string): string {
  return normalizeCreditClientCell(name).replace(/\s+/g, " ");
}

/** 집계·아이템 행 이름 비교에는 그대로 `normalizeCreditNameForLink` 사용 */

/**
 * `ar_records.client_name`(엑셀 집계)과 `client_profiles.name`(거래처정보)이 같은 업체로 묶어도 되는지.
 * (공백·(주)·「삼일」vs「삼일강업」·래피드 표기 차이 등)
 */
export function creditNamesLinkedForProfile(aggregatedName: string, profileName: string): boolean {
  const a = normalizeCreditNameForLink(aggregatedName);
  const b = normalizeCreditNameForLink(profileName);
  if (!a || !b) return false;
  if (a === b) return true;

  const stripLeadingCorp = (s: string) =>
    s
      .replace(/^\(주\)\s*/i, "")
      .replace(/^（주）\s*/u, "")
      .replace(/^주식회사\s+/u, "")
      .trim();

  const compact = (s: string) => stripLeadingCorp(s).replace(/\s+/g, "");
  const ca = compact(a);
  const cb = compact(b);
  if (ca === cb) return true;

  /** 말미 「강업」만 다른 경우 — 삼일강업 ↔ 삼일 / (주)삼일강업 ↔ 삼일 */
  const stripGangUp = (s: string) => s.replace(/강업$/u, "");
  const coreCa = stripGangUp(ca);
  const coreCb = stripGangUp(cb);
  if (coreCa.length >= 2 && coreCa === coreCb) return true;

  const shorter = ca.length <= cb.length ? ca : cb;
  const longer = ca.length > cb.length ? ca : cb;
  if (shorter.length >= 3 && longer.includes(shorter)) return true;

  return false;
}

/**
 * Firestore 저장·직접 조회용: 같은 업체 이름을 한 문자열로 묶음(자동 반영 매칭).
 * `creditNamesLinkedForProfile`과 동일 근거(corp 접두·말미 강업)지만 짧은 문자열 하나로 귀속.
 */
export function creditAggregationLinkKey(raw: string): string {
  const a = normalizeCreditNameForLink(raw);
  if (!a) return "";
  let c = a
    .replace(/^\(주\)\s*/iu, "")
    .replace(/^（주）\s*/u, "")
    .replace(/^주식회사\s+/u, "")
    .trim()
    .replace(/\s+/g, "");
  c = c.replace(/강업$/u, "").toLowerCase();
  return c;
}

/** 집계 `client_name`(ar_records) ↔ 거래처 `name` 등이 같은 건으로 볼 때 */
export function profileMatchesAggregatedName(
  profileName: string,
  aggregatedClientName: string
): boolean {
  const pk = creditAggregationLinkKey(profileName);
  const ak = creditAggregationLinkKey(aggregatedClientName);
  if (pk && ak && pk === ak) return true;
  return creditNamesLinkedForProfile(aggregatedClientName, profileName);
}

/**
 * 신용내역 거래처명에 맞는 `client_profiles` 문서 하나 선택(Firestore 전체 목록 순회용).
 */
export function matchClientProfileToAggregated<
  T extends { id?: string; name?: unknown; aggregation_link_key?: unknown }
>(
  profiles: T[],
  aggregatedClientName: string
): T | undefined {
  const want = creditAggregationLinkKey(aggregatedClientName);
  if (want) {
    const byKey = profiles.find((p) => {
      const k =
        typeof p.aggregation_link_key === "string" ? String(p.aggregation_link_key).trim() : "";
      const inferred =
        k || creditAggregationLinkKey(String(p.name ?? ""));
      return inferred === want;
    });
    if (byKey) return byKey;
  }
  return profiles.find((p) => creditNamesLinkedForProfile(aggregatedClientName, String(p.name ?? "")));
}

/**
 * 정규화된 거래처명이 비어 있거나 공란으로 볼 값이면 true → 일반 고객(신용 집계 제외)
 * (normalizeCreditClientCell 적용 후 문자열을 넣을 것)
 */
export function isBlankCreditClientName(normalized: string): boolean {
  if (!normalized) return true;
  const compact = normalized.replace(/[\s\u00a0]+/g, "");
  if (!compact) return true;
  if (/^[-–—‧·.]+$/.test(compact)) return true;
  if (/^(n\/a|#n\/a|na|none|없음|무|null)$/i.test(compact)) return true;
  return false;
}

/** 지급란 셀 정규화 */
export function normalizePaymentCell(val: unknown): string {
  if (val == null || val === "") return "";
  let s = String(val).replace(/[\u200b-\u200d\ufeff]/g, "");
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  return s.trim();
}

/**
 * 신용내역 집계 대상 지급 여부:
 * · 지급란에 선불·착불·선착불이 있으면 거래처명이 있어도 제외
 * · 「신용」이 있어야 집계 (비신용 제외)
 */
export function isCreditPaymentForSettlement(val: unknown): boolean {
  const s = normalizePaymentCell(val);
  if (!s) return false;
  const c = s.replace(/\s+/g, "");
  if (/비신용/.test(c)) return false;
  if (/선착불|선불|착불/.test(c)) return false;
  return /신용/.test(c);
}

/**
 * 신용 요금 집계 시 상태 열이 매핑된 경우에만 적용.
 * · 「완료」를 포함하고 문의·취소·미완료가 없으면 포함 (예: 배송완료, 처리완료)
 * · 문의·취소가 셀에 있으면 지급이 신용이어도 제외
 * · 열 미매핑이면 상태와 무관하게 기존처럼 지급·신용만으로 판단
 */
export function isIncludedStatusForCreditSettlement(cell: unknown, statusColumnMapped: boolean): boolean {
  if (!statusColumnMapped) return true;
  const s = normalizePaymentCell(cell).replace(/\s+/g, "");
  if (!s) return false;
  if (/문의/u.test(s)) return false;
  if (/취소/u.test(s)) return false;
  if (/미완료|미\s*완료/u.test(s)) return false;
  return /완료/u.test(s);
}

/** 「지급」 단일 헤더는 지급기한 등과 혼동되지 않게 정확 일치로만 매핑 */
const PAYMENT_HEADER_EXACT = [
  "지급",
  "지급구분",
  "결제구분",
  "수금구분",
  "결제방법",
  "수금방법",
  "정산구분",
  "선착불",
  "선착불구분",
] as const;

/** 「상태」열 — 지급·신용과 별도로 완료 건만 요금 반영 */
const STATUS_HEADER_EXACT = [
  "상태",
  "처리상태",
  "진행상태",
] as const;

/** 신용 마감 기준 열: 헤더가 이 목록과 정확히 일치하면 최우선 매핑 */
const CLIENT_HEADER_PREFERRED = [
  "거래처명",
  "신용거래처",
  "신용거래처명",
  "정산거래처명",
  "청구거래처명",
  "청구거래처",
] as const;

/** 헤더 배열에서 가장 잘 맞는 컬럼 인덱스 반환 (없으면 -1) */
function bestColIdx(headers: string[], hints: string[]): number {
  let best = -1;
  let bestScore = 0;
  headers.forEach((h, i) => {
    const hn = norm(h);
    if (!hn) return;
    hints.forEach((hint, priority) => {
      const hintN = norm(hint);
      let score = 0;
      if (hn === hintN) score = 200 - priority;          // 완전 일치
      else if (hn.includes(hintN) || hintN.includes(hn)) score = 100 - priority; // 부분 일치
      if (score > bestScore) { bestScore = score; best = i; }
    });
  });
  return best;
}

// ─────────────────────────────────────────────────────────────
// 날짜 파서
// ─────────────────────────────────────────────────────────────
function parseDate(val: any): string {
  if (val == null || val === "") return "";

  // Excel 시리얼 날짜
  if (typeof val === "number") {
    const utc = (val - 25569) * 86400 * 1000;
    const d = new Date(utc);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  const s = String(val).trim();

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  const m1 = s.match(/^(\d{4})[-./년](\d{1,2})[-./월](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;

  // YYYYMMDD
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  // MM/DD/YYYY
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m3) return `${m3[3]}-${m3[1].padStart(2, "0")}-${m3[2].padStart(2, "0")}`;

  // "N일" 형식 (예: "5일", "15일") → 그대로 보존 (aggregateToRecords에서 billing_month 기준으로 변환)
  const mDay = s.match(/^(\d{1,2})일$/);
  if (mDay) return `day:${mDay[1].padStart(2, "0")}`;

  return s; // 변환 불가 시 원문 반환
}

// ─────────────────────────────────────────────────────────────
// 금액 파서 (쉼표·원기호·공백 제거, NaN → 0)
// ─────────────────────────────────────────────────────────────
function parseAmount(val: any): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.abs(val);
  const s = String(val).replace(/[^0-9.-]/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

// ─────────────────────────────────────────────────────────────
// 시트 → ParseResult 변환 (핵심 로직)
// ─────────────────────────────────────────────────────────────
function sheetToResult(
  ws: XLSX.WorkSheet,
  fileName: string,
  sheetName: string
): ParseResult {
  const warnings: string[] = [];
  let skippedNonCreditRows = 0;

  // 2차원 배열로 변환
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (aoa.length === 0) {
    return emptyResult(fileName, sheetName, ["시트에 데이터가 없습니다."]);
  }

  // 헤더 행 자동 탐색 (최대 6행 스캔 — 상단에 로고·제목이 있는 파일 대응)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(6, aoa.length); i++) {
    const nonEmpty = aoa[i].filter((c: any) => String(c).trim()).length;
    if (nonEmpty >= 2) { headerIdx = i; break; }
  }

  const headers: string[] = aoa[headerIdx].map((h: any) => String(h).trim());

  // 컬럼 자동 매핑 (중요도 순서로 처리 → 이미 선택된 인덱스는 재사용 불가)
  const usedIdx = new Set<number>();
  function pickBest(hints: string[]): number {
    // 점수가 가장 높고 아직 미사용인 컬럼 선택
    let best = -1, bestScore = 0;
    headers.forEach((h, i) => {
      if (usedIdx.has(i)) return;
      const hn = norm(h);
      if (!hn) return;
      hints.forEach((hint, priority) => {
        const hintN = norm(hint);
        let score = 0;
        if (hn === hintN) score = 200 - priority;
        else if (hn.includes(hintN) || hintN.includes(hn)) score = 100 - priority;
        if (score > bestScore) { bestScore = score; best = i; }
      });
    });
    if (best !== -1) usedIdx.add(best);
    return best;
  }

  /** 「거래처명」 등 정확 일치 열을 먼저 잡고, 없을 때만 힌트 부분 일치 (상호·업체명 오인 방지) */
  function pickClientColumn(): number {
    for (const ph of CLIENT_HEADER_PREFERRED) {
      const target = norm(ph);
      for (let i = 0; i < headers.length; i++) {
        if (usedIdx.has(i)) continue;
        const hn = norm(String(headers[i] ?? ""));
        if (hn && hn === target) {
          usedIdx.add(i);
          return i;
        }
      }
    }
    return pickBest(COL_HINTS.client);
  }

  function pickPaymentColumn(): number {
    for (const ph of PAYMENT_HEADER_EXACT) {
      const target = norm(ph);
      for (let i = 0; i < headers.length; i++) {
        if (usedIdx.has(i)) continue;
        const hn = norm(String(headers[i] ?? ""));
        if (hn && hn === target) {
          usedIdx.add(i);
          return i;
        }
      }
    }
    return pickBest(COL_HINTS.payment);
  }

  function pickStatusColumn(): number {
    for (const ph of STATUS_HEADER_EXACT) {
      const target = norm(ph);
      for (let i = 0; i < headers.length; i++) {
        if (usedIdx.has(i)) continue;
        const hn = norm(String(headers[i] ?? ""));
        if (hn && hn === target) {
          usedIdx.add(i);
          return i;
        }
      }
    }
    return pickBest(COL_HINTS.row_status);
  }

  const detectedIdx: Record<ColKey, number> = {
    client:       pickClientColumn(),
    base_amount:  pickBest(COL_HINTS.base_amount),
    discount_amount: pickBest(COL_HINTS.discount_amount),
    amount:       pickBest(COL_HINTS.amount),
    deliveryfee:  pickBest(COL_HINTS.deliveryfee),
    date:         pickBest(COL_HINTS.date),
    duedate:      pickBest(COL_HINTS.duedate),
    payment:      pickPaymentColumn(),
    row_status:   pickStatusColumn(),
    memo:         pickBest(COL_HINTS.memo),
    jeeyo:        pickBest(COL_HINTS.jeeyo),
    bizno:        pickBest(COL_HINTS.bizno),
    departure:    pickBest(COL_HINTS.departure),
    destination:  pickBest(COL_HINTS.destination),
    vehicle_type: pickBest(COL_HINTS.vehicle_type),
    driver:       pickBest(COL_HINTS.driver),
    vehicle_no:   pickBest(COL_HINTS.vehicle_no),
    unload_client:pickBest(COL_HINTS.unload_client),
    row_client:   pickBest(COL_HINTS.row_client),
    round_trip:   pickBest(COL_HINTS.round_trip),
  };

  if (detectedIdx.date    === -1) warnings.push("날짜 컬럼을 자동으로 찾지 못했습니다. 수동으로 지정해주세요.");
  if (detectedIdx.client  === -1) warnings.push("거래처명 컬럼을 자동으로 찾지 못했습니다. 수동으로 지정해주세요.");
  if (detectedIdx.amount  === -1) warnings.push("금액 컬럼을 자동으로 찾지 못했습니다. 수동으로 지정해주세요.");
  if (detectedIdx.payment === -1) {
    warnings.push(
      "「지급」열을 자동으로 찾지 못했습니다. 신용내역에는 지급란에 「신용」인 행만 포함됩니다. 컬럼 매핑에서 지급 열을 지정하세요."
    );
  }

  if (detectedIdx.client !== -1) {
    const ch = norm(String(headers[detectedIdx.client] ?? ""));
    const preferredNorms = new Set(CLIENT_HEADER_PREFERRED.map((p) => norm(p)));
    if (ch && !preferredNorms.has(ch)) {
      warnings.push(
        "자동 인식된 거래처 열이 「거래처명」과 다를 수 있습니다. 신용/일반 구분은 반드시 「거래처명」 공란 기준이므로, 아래 컬럼 매핑에서 「거래처명」 열을 확인하세요."
      );
    }
  }

  const h = (k: ColKey) => detectedIdx[k] !== -1 ? headers[detectedIdx[k]] : null;
  const detected: DetectedCols = {
    date:         h("date"),
    client:       h("client"),
    base_amount:  h("base_amount"),
    discount_amount: h("discount_amount"),
    amount:       h("amount"),
    deliveryfee:  h("deliveryfee"),
    payment:      h("payment"),
    row_status:   h("row_status"),
    memo:         h("memo"),
    jeeyo:        h("jeeyo"),
    bizno:        h("bizno"),
    duedate:      h("duedate"),
    departure:    h("departure"),
    destination:  h("destination"),
    vehicle_type: h("vehicle_type"),
    driver:       h("driver"),
    vehicle_no:   h("vehicle_no"),
    unload_client:h("unload_client"),
    row_client:   h("row_client"),
    round_trip:   h("round_trip"),
    allHeaders:   headers,
  };

  const get = (row: any[], key: ColKey, override?: number) => {
    const idx = override !== undefined && override !== -1 ? override : detectedIdx[key];
    return idx !== -1 ? row[idx] : "";
  };

  // 데이터 행 파싱
  const rows: RawRow[] = [];
  let skippedNonCreditPaymentRows = 0;
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row: any[] = aoa[i];
    // 빈 행 건너뜀
    if (!row.some((c: any) => String(c).trim())) continue;

    const clientName = normalizeCreditClientCell(get(row, "client"));
    if (isBlankCreditClientName(clientName)) {
      skippedNonCreditRows++;
      continue;
    }

    if (detectedIdx.payment === -1) {
      skippedNonCreditPaymentRows++;
      continue;
    }
    const payRaw = get(row, "payment");
    if (!isCreditPaymentForSettlement(payRaw)) {
      skippedNonCreditPaymentRows++;
      continue;
    }
    const paymentLabel = normalizePaymentCell(payRaw) || undefined;
    const statusLabel =
      detectedIdx.row_status !== -1
        ? normalizePaymentCell(get(row, "row_status")) || ""
        : undefined;

    const _original: Record<string, any> = {};
    headers.forEach((h, idx) => { if (h) _original[h] = row[idx]; });

    const str = (k: ColKey) => { const v = get(row, k); return v != null ? String(v).trim() : ""; };
    rows.push({
      date:         parseDate(get(row, "date")),
      clientName,
      baseAmount:
        detectedIdx.base_amount !== -1
          ? parseAmount(get(row, "base_amount"))
          : undefined,
      discountAmount:
        detectedIdx.discount_amount !== -1
          ? parseAmount(get(row, "discount_amount"))
          : undefined,
      amount:       parseAmount(get(row, "amount")),
      deliveryFee:  parseAmount(get(row, "deliveryfee")),
      paymentLabel,
      statusLabel,
      memo:         str("memo"),
      jeeyo:        str("jeeyo") || undefined,
      bizNo:        str("bizno"),
      dueDate:      parseDate(get(row, "duedate")),
      departure:    str("departure")    || undefined,
      destination:  str("destination")  || undefined,
      vehicleType:  str("vehicle_type") || undefined,
      driver:       str("driver")       || undefined,
      vehicleNo:    str("vehicle_no")   || undefined,
      unloadClient: str("unload_client")|| undefined,
      rowClient:    str("row_client")   || undefined,
      roundTrip:
        detectedIdx.round_trip !== -1
          ? str("round_trip")
          : undefined,
      _original,
    });
  }

  const statusMapped = detectedIdx.row_status !== -1;
  const skippedNonCompleteStatusRows = statusMapped
    ? rows.filter((r) => !isIncludedStatusForCreditSettlement(r.statusLabel ?? "", true)).length
    : 0;

  return {
    rows, detected, detectedIdx, fileName, sheetName, warnings,
    skippedNonCreditRows, skippedNonCreditPaymentRows, skippedNonCompleteStatusRows,
  };
}

function emptyResult(fileName: string, sheetName: string, warnings: string[]): ParseResult {
  return {
    rows: [],
    detected: {
      date: null, client: null, base_amount: null, discount_amount: null, amount: null, deliveryfee: null, payment: null, row_status: null, memo: null, jeeyo: null, bizno: null, duedate: null,
      departure: null, destination: null, vehicle_type: null, driver: null, vehicle_no: null,
      unload_client: null, row_client: null, round_trip: null, allHeaders: [],
    },
    detectedIdx: {
      date: -1, client: -1, base_amount: -1, discount_amount: -1, amount: -1, deliveryfee: -1, payment: -1, row_status: -1, memo: -1, jeeyo: -1, bizno: -1, duedate: -1,
      departure: -1, destination: -1, vehicle_type: -1, driver: -1, vehicle_no: -1,
      unload_client: -1, row_client: -1, round_trip: -1,
    },
    fileName,
    sheetName,
    warnings,
    skippedNonCreditRows: 0,
    skippedNonCreditPaymentRows: 0,
    skippedNonCompleteStatusRows: 0,
  };
}

// ─────────────────────────────────────────────────────────────
// 공개 API: 파일 파싱 진입점
// ─────────────────────────────────────────────────────────────

/**
 * .csv / .xlsx / .xls 파일을 받아 ParseResult 반환.
 * CSV는 EUC-KR → UTF-8 순서로 인코딩을 자동 감지합니다.
 */
export function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv") {
    return new Promise((resolve, reject) => {
      const tryEnc = (encoding: string) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          // 깨진 문자(U+FFFD)가 많으면 반대 인코딩으로 재시도
          const broken = (text.match(/\uFFFD/g) ?? []).length;
          if (broken > 5 && encoding === "euc-kr") {
            tryEnc("utf-8");
            return;
          }
          try {
            const wb = XLSX.read(text, { type: "string" });
            const sn = wb.SheetNames[0];
            resolve(sheetToResult(wb.Sheets[sn], file.name, sn));
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsText(file, encoding);
      };
      tryEnc("euc-kr");
    });
  }

  // XLSX / XLS
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const wb = XLSX.read(data, { type: "array" });
        const sn = wb.SheetNames[0];
        resolve(sheetToResult(wb.Sheets[sn], file.name, sn));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 수동 컬럼 오버라이드를 반영해 rows 재파싱.
 * 이미 ParseResult가 있을 때 특정 컬럼만 바꾸고 싶을 때 사용.
 */
export function reapplyColMap(
  file: File,
  overrides: Partial<Record<ColKey, number>>
): Promise<ParseResult> {
  // 간단하게 파일을 다시 읽되, sheetToResult 전 detectedIdx를 override로 패치
  // → 실제로는 결과를 캐싱하고 detectedIdx만 갱신해도 되지만
  //   여기서는 재파싱으로 단순화
  return parseFile(file).then((result) => {
    const patched = { ...result.detectedIdx, ...overrides };
    // row를 새 인덱스로 재계산
    const headers = result.detected.allHeaders;
    const get = (row: Record<string, any>, key: ColKey) => {
      const idx = patched[key];
      return idx !== -1 ? row[headers[idx]] ?? "" : "";
    };

    const str2 = (v: any) => v != null ? String(v).trim() : "";
    // _original을 이용해 재파싱
    const rows: RawRow[] = result.rows.map((r) => ({
      date:         parseDate(get(r._original, "date")),
      clientName:   normalizeCreditClientCell(get(r._original, "client")),
      baseAmount:
        patched.base_amount !== -1
          ? parseAmount(get(r._original, "base_amount"))
          : undefined,
      discountAmount:
        patched.discount_amount !== -1
          ? parseAmount(get(r._original, "discount_amount"))
          : undefined,
      amount:       parseAmount(get(r._original, "amount")),
      deliveryFee:  parseAmount(get(r._original, "deliveryfee")),
      paymentLabel: normalizePaymentCell(get(r._original, "payment")) || undefined,
      memo:         str2(get(r._original, "memo")),
      jeeyo:        str2(get(r._original, "jeeyo")) || undefined,
      bizNo:        str2(get(r._original, "bizno")),
      dueDate:      parseDate(get(r._original, "duedate")),
      departure:    str2(get(r._original, "departure"))    || undefined,
      destination:  str2(get(r._original, "destination"))  || undefined,
      vehicleType:  str2(get(r._original, "vehicle_type")) || undefined,
      driver:       str2(get(r._original, "driver"))       || undefined,
      vehicleNo:    str2(get(r._original, "vehicle_no"))   || undefined,
      unloadClient: str2(get(r._original, "unload_client"))|| undefined,
      rowClient:    str2(get(r._original, "row_client"))   || undefined,
      roundTrip:
        patched.round_trip !== -1
          ? str2(get(r._original, "round_trip"))
          : undefined,
      statusLabel:
        patched.row_status !== -1
          ? normalizePaymentCell(get(r._original, "row_status")) || ""
          : undefined,
      _original:    r._original,
    })).filter((r) => {
      if (isBlankCreditClientName(r.clientName)) return false;
      if (patched.payment === -1) return false;
      if (!isCreditPaymentForSettlement(get(r._original, "payment"))) return false;
      return isIncludedStatusForCreditSettlement(
        patched.row_status !== -1 ? r.statusLabel ?? "" : null,
        patched.row_status !== -1
      );
    });

    const skippedNonCompleteStatusRows =
      patched.row_status !== -1
        ? result.rows.filter((orig) => {
            const clientName = normalizeCreditClientCell(get(orig._original, "client"));
            if (isBlankCreditClientName(clientName)) return false;
            if (patched.payment === -1) return false;
            if (!isCreditPaymentForSettlement(get(orig._original, "payment"))) return false;
            const st = normalizePaymentCell(get(orig._original, "row_status")) || "";
            return !isIncludedStatusForCreditSettlement(st, true);
          }).length
        : 0;

    return {
      ...result,
      rows,
      detectedIdx: patched,
      detected: {
        ...result.detected,
        row_status:
          patched.row_status !== -1
            ? result.detected.allHeaders[patched.row_status] ?? null
            : null,
      },
      skippedNonCompleteStatusRows,
    };
  });
}
