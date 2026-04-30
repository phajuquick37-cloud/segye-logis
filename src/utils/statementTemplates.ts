import {
  creditNamesLinkedForProfile,
  normalizeCreditClientCell,
} from "./sheetParser";
import type { SettlementItem, StatementClientProfile, StatementTemplateKey } from "../types/statement";

// ── 셀 표시 헬퍼 (출발·도착 동) ─────────────────────────────
function normStmtCell(s: string): string {
  try {
    return s.normalize("NFKC").trim().replace(/\s+/g, "");
  } catch {
    return String(s ?? "").trim().replace(/\s+/g, "");
  }
}

export function displayDepartureForStatement(item: SettlementItem): string {
  const d = (item.departure ?? "").trim();
  if (!d) return "";
  const ref = normStmtCell(item.row_client || item.description || "");
  if (ref && normStmtCell(d) === ref) return "";
  return d;
}

export function displayDestinationForStatement(item: SettlementItem): string {
  const d = (item.destination ?? "").trim();
  if (!d) return "";
  const ref = normStmtCell(item.row_client || item.description || "");
  if (ref && normStmtCell(d) === ref) return "";
  return d;
}

function lineBaseAmount(item: SettlementItem): number {
  const q = item.quantity || 1;
  const upRaw = item.unit_price ?? 0;
  const up = typeof upRaw === "number" && Number.isFinite(upRaw)
    ? upRaw
    : Number(String(upRaw).replace(/,/g, "").trim());
  const upN = Number.isFinite(up) ? up : 0;
  if (upN > 0) return Math.round(upN * q);
  const sup = item.supply_amount;
  const s =
    typeof sup === "number" && Number.isFinite(sup)
      ? sup
      : Number(String(sup ?? 0).replace(/,/g, "").trim());
  return Number.isFinite(s) ? Math.round(s) : 0;
}

function coerceSupplyAmount(item: SettlementItem): number {
  const sup = item.supply_amount;
  const s =
    typeof sup === "number" && Number.isFinite(sup)
      ? sup
      : Number(String(sup ?? 0).replace(/,/g, "").trim());
  return Number.isFinite(s) ? Math.round(s) : 0;
}

/**
 * 명세 「기본」열: 업로드한 기본 열(base_amount)만 표시. 할인·요금과 섞지 않음.
 * (키가 없으면 레거시: unit_price·supply 기반)
 */
function statementLineBase(item: SettlementItem): number {
  if (Object.prototype.hasOwnProperty.call(item, "base_amount")) {
    const raw = (item as unknown as Record<string, unknown>).base_amount;
    if (raw == null || raw === "") return 0;
    const n =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : Number(String(raw).replace(/,/g, "").trim());
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return lineBaseAmount(item);
}

/**
 * 명세 「할인」열: 업로드 할인 열 우선. 없으면 (기본표시값 − 집계요금)만 추정.
 * 추정값은 「할인」에만 쓰이고 「기본」에는 반영하지 않음.
 */
function statementLineDiscount(item: SettlementItem): number {
  if (Object.prototype.hasOwnProperty.call(item, "discount_amount")) {
    const raw = (item as unknown as Record<string, unknown>).discount_amount;
    if (raw == null || raw === "") return 0;
    const n =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : Number(String(raw).replace(/,/g, "").trim());
    const v = Number.isFinite(n) ? Math.round(n) : 0;
    return Math.max(0, v);
  }
  const b = statementLineBase(item);
  const sN = coerceSupplyAmount(item);
  return Math.max(0, b - sN);
}

/** 명세 「요금」·「합계」류 금액 열: 업로드 시 저장한 집계 줄 금액(supply_amount = 엑셀 요금 열)·기본·할인과 독립 */
function statementLineFee(item: SettlementItem): number {
  return coerceSupplyAmount(item);
}

/** 금액 열이 라이더·왕복 등에 잘못 들어온 경우 표시 제외 */
function looksLikeNumericFee(s: string): boolean {
  const t = s.replace(/\s/g, "").replace(/원$/u, "");
  if (!t) return false;
  return /^-?\d[\d,]*\.?\d*%?$/.test(t);
}

function roundTripCell(item: SettlementItem): string {
  // 왕복 전용 열이 저장돼 있으면(빈 문자열 포함) 그 값만 쓰고 비고·적요로 채우지 않음
  if (Object.prototype.hasOwnProperty.call(item, "round_trip")) {
    const dedicated = String(item.round_trip ?? "").trim();
    if (looksLikeNumericFee(dedicated)) return "";
    return dedicated;
  }

  const depShown = normStmtCell(displayDepartureForStatement(item));
  const destShown = normStmtCell(displayDestinationForStatement(item));
  const depRaw = normStmtCell((item.departure ?? "").trim());
  const destRaw = normStmtCell((item.destination ?? "").trim());
  const hasAddr = !!(depShown || destShown || depRaw || destRaw);

  const j = (item.jeeyo ?? "").trim();
  const m = (item.memo ?? "").trim();
  const raw = j || (hasAddr ? "" : m);
  if (!raw) return "";
  if (looksLikeNumericFee(raw)) return "";

  const client = normStmtCell(item.row_client || item.description || "");
  const rawN = normStmtCell(raw);
  if (depShown && rawN === depShown) return "";
  if (destShown && rawN === destShown) return "";
  if (depRaw && !depShown && rawN === depRaw) return "";
  if (destRaw && !destShown && rawN === destRaw) return "";
  if (client && rawN === client) return "";
  return raw;
}

function categoryCell(item: SettlementItem): string {
  const m = (item.memo || "").trim();
  if (/신용|선불|착불|착\s*불/.test(m)) {
    const mm = m.match(/(신용|선불|착불|착\s*불)/);
    if (mm) return mm[1].replace(/\s+/g, "");
  }
  return "신용";
}

function riderDisplayName(item: SettlementItem): string {
  const d = (item.driver ?? "").trim();
  if (!d) return "";
  if (looksLikeNumericFee(d)) return "";
  return d;
}

function riderCell(item: SettlementItem): string {
  return riderDisplayName(item);
}

/** 내부 열 키 — 커스텀 양식 저장·복원용 */
export type StatementColumnKey =
  | "order_date"
  | "order_date_alt"
  | "date_simple"
  | "client_name"
  | "client_name_legacy"
  | "dest_site"
  | "round_trip"
  | "dep_dong"
  | "category"
  | "arr_dong"
  | "vehicle"
  | "form"
  | "base_fee"
  | "discount"
  | "fee"
  | "consignment"
  | "rider"
  | "driver_name"
  | "dep_place"
  | "sum_simple"
  | "sum_amount"
  | "unload_client"
  | "vehicle_no"
  | "note";

export const STATEMENT_COLUMN_CATALOG: { key: StatementColumnKey; label: string }[] = [
  { key: "order_date", label: "주문일자" },
  { key: "order_date_alt", label: "오더일자" },
  { key: "date_simple", label: "날짜" },
  { key: "client_name", label: "고객명" },
  { key: "client_name_legacy", label: "고객명(상호)" },
  { key: "dest_site", label: "도착지" },
  { key: "round_trip", label: "왕복" },
  { key: "dep_place", label: "출발지" },
  { key: "dep_dong", label: "출발동" },
  { key: "category", label: "구분" },
  { key: "arr_dong", label: "도착동" },
  { key: "vehicle", label: "차량" },
  { key: "form", label: "형태" },
  { key: "base_fee", label: "기본요금" },
  { key: "discount", label: "할인요금" },
  { key: "fee", label: "요금" },
  { key: "consignment", label: "탁송료" },
  { key: "rider", label: "라이더" },
  { key: "driver_name", label: "기사명" },
  { key: "sum_simple", label: "합계" },
  { key: "sum_amount", label: "합계금액" },
  { key: "unload_client", label: "하차지고객" },
  { key: "vehicle_no", label: "차량번호" },
  { key: "note", label: "비고" },
];

const COLUMN_KEY_SET = new Set<string>(STATEMENT_COLUMN_CATALOG.map((c) => c.key));

export function labelForColumnKey(key: string): string {
  const f = STATEMENT_COLUMN_CATALOG.find((c) => c.key === key);
  return f?.label ?? key;
}

/** 프리셋마다 명세 헤더 글자가 카탈로그와 다를 때 (녹원: 기본·할인) */
export function statementPresetHeaderLabel(
  presetId: StatementTemplateKey,
  key: StatementColumnKey
): string {
  if (presetId === "nokwon" && key === "base_fee") return "기본";
  if (presetId === "nokwon" && key === "discount") return "할인";
  return labelForColumnKey(key);
}

export function parseColumnKeysFromProfile(raw: unknown): StatementColumnKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is StatementColumnKey => typeof k === "string" && COLUMN_KEY_SET.has(k));
}

function cellForKey(item: SettlementItem, key: StatementColumnKey): string | number {
  switch (key) {
    case "order_date":
    case "order_date_alt":
    case "date_simple":
      return item.date || "";
    case "client_name":
      return item.row_client || item.description || "";
    case "client_name_legacy":
      return item.row_client || item.description || "";
    case "dest_site":
      return (item.destination ?? "").trim();
    case "round_trip":
      return roundTripCell(item);
    case "dep_place":
      return displayDepartureForStatement(item) || (item.departure ?? "").trim();
    case "dep_dong":
      return displayDepartureForStatement(item);
    case "category":
      return categoryCell(item);
    case "arr_dong":
      return displayDestinationForStatement(item);
    case "vehicle":
      return (item.vehicle_type ?? "").trim();
    case "form":
      return "";
    case "note":
      return (item.jeeyo || "").trim() || "";
    case "unload_client":
      return (item.unload_client || "").trim();
    case "driver_name":
      return riderDisplayName(item);
    case "vehicle_no":
      return (item.vehicle_no || "").trim();
    case "base_fee":
      return statementLineBase(item).toLocaleString();
    case "discount":
      return statementLineDiscount(item).toLocaleString();
    case "fee":
    case "sum_simple":
    case "sum_amount":
      return statementLineFee(item).toLocaleString();
    case "consignment":
      return "0";
    case "rider":
      return riderCell(item);
    default:
      return "";
  }
}

export interface TemplateColModel {
  key: StatementColumnKey;
  header: string;
  width?: string;
  align: "left" | "center" | "right";
}

export interface ResolvedTemplateModel {
  id: StatementTemplateKey;
  label: string;
  cols: TemplateColModel[];
  headerTone: "gray" | "dark";
  totalColumnIndex: number;
  renderRow: (item: SettlementItem) => (string | number)[];
}

function modelFromKeys(
  id: StatementTemplateKey,
  label: string,
  keys: StatementColumnKey[],
  headerTone: "gray" | "dark"
): ResolvedTemplateModel {
  const cols: TemplateColModel[] = keys.map((key) => {
    const cat = STATEMENT_COLUMN_CATALOG.find((c) => c.key === key)!;
    const align: "left" | "center" | "right" =
      key === "base_fee" || key === "discount" || key === "fee" || key === "sum_simple" || key === "sum_amount" || key === "consignment"
        ? "right"
        : key === "order_date" || key === "order_date_alt" || key === "date_simple"
          ? "center"
          : "left";
    const isDate = key === "order_date" || key === "order_date_alt" || key === "date_simple";
    return {
      key,
      header: cat.label,
      align,
      width: isDate ? "80px" : undefined,
    };
  });
  const feeIdx = keys.indexOf("fee");
  const sumAmtIdx = keys.indexOf("sum_amount");
  const sumSimIdx = keys.indexOf("sum_simple");
  let totalColumnIndex = keys.length >= 2 ? keys.length - 2 : 0;
  if (feeIdx >= 0) totalColumnIndex = feeIdx;
  else if (sumAmtIdx >= 0) totalColumnIndex = sumAmtIdx;
  else if (sumSimIdx >= 0) totalColumnIndex = sumSimIdx;

  return {
    id,
    label,
    headerTone,
    cols,
    totalColumnIndex,
    renderRow: (item) => cols.map((c) => cellForKey(item, c.key)),
  };
}

/** 녹원씨앤아이 — 「기본」「할인」 헤더 · 요금 열은 supply_amount(집계 요금) */
function nokwonResolvedModel(): ResolvedTemplateModel {
  const m = modelFromKeys("nokwon", "녹원씨앤아이양식", NOKWON_KEYS, "gray");
  return {
    ...m,
    cols: m.cols.map((c) => {
      if (c.key === "base_fee") return { ...c, header: "기본" };
      if (c.key === "discount") return { ...c, header: "할인" };
      return c;
    }),
  };
}

/** 녹원씨앤아이 — 헤더 회색 */
const NOKWON_KEYS: StatementColumnKey[] = [
  "order_date", "client_name", "round_trip", "dep_dong", "category", "arr_dong",
  "vehicle", "form", "base_fee", "discount", "fee", "consignment", "rider",
];

/** 다빛 · 스노우피크 · 아이엠텍플러스 (동일 열 구성) */
const DABIT_KEYS: StatementColumnKey[] = [
  "order_date", "client_name", "round_trip", "dep_dong", "category", "arr_dong",
  "vehicle", "form", "fee", "consignment", "rider",
];

const BOOK_PERSON_KEYS: StatementColumnKey[] = [
  "order_date_alt", "dep_place", "dep_dong", "arr_dong", "category", "vehicle", "consignment", "sum_simple",
];

const BOOK_CORP_KEYS: StatementColumnKey[] = [
  "order_date_alt", "dep_place", "dep_dong", "arr_dong", "category", "vehicle", "consignment", "sum_amount", "rider",
];

const PRESET_MODELS: Record<Exclude<StatementTemplateKey, "custom">, ResolvedTemplateModel> = {
  basic: modelFromKeys("basic", "기본양식", ["date_simple", "client_name_legacy", "dep_dong", "arr_dong", "vehicle", "fee"], "dark"),
  samil: modelFromKeys("samil", "삼일강업양식", ["date_simple", "client_name_legacy", "dep_dong", "arr_dong", "vehicle", "driver_name", "fee", "vehicle_no"], "dark"),
  jiyoo: modelFromKeys("jiyoo", "지유전자양식", ["date_simple", "client_name", "dep_dong", "unload_client", "arr_dong", "vehicle", "fee"], "dark"),
  rapid: modelFromKeys("rapid", "래피드양식", ["date_simple", "dep_dong", "arr_dong", "note", "fee", "vehicle"], "dark"),
  nokwon: nokwonResolvedModel(),
  dabit: modelFromKeys("dabit", "다빛양식", DABIT_KEYS, "dark"),
  book_person: modelFromKeys("book_person", "(개인)북앤북양식", BOOK_PERSON_KEYS, "dark"),
  book_corp: modelFromKeys("book_corp", "(주)북앤북양식", BOOK_CORP_KEYS, "dark"),
  snowpeak: modelFromKeys("snowpeak", "스노우피크양식", DABIT_KEYS, "dark"),
  imtechplus: modelFromKeys("imtechplus", "주식회사 아이엠텍플러스양식", DABIT_KEYS, "dark"),
};

const SAMIL_NAME_HINTS = ["삼일강업", "(주)삼일", "(주）삼일", "㈜삼일"];
const RAPID_NAME_HINTS = ["래피드", "래피드어드", "래피드어드벤스", "래피어드", "rapid"];

function detectBookKind(nPlain: string, nCompact: string): StatementTemplateKey | null {
  if (!/북앤북/.test(nPlain) && !nCompact.includes("북앤북")) return null;
  if (/\(개인\)/.test(nPlain) || /^개인\s*북앤북/.test(nPlain.replace(/\s+/g, ""))) return "book_person";
  if (/\(주\)/.test(nPlain) || /주식회사/.test(nPlain) || /^（주）/.test(nPlain)) return "book_corp";
  return "book_corp";
}

/** 거래처명·프로필로 표시할 양식 키 결정 */
export function detectStatementTemplate(clientName: string, profile?: StatementClientProfile | null): StatementTemplateKey {
  if (profile?.template === "custom" && profile.custom_statement_columns && profile.custom_statement_columns.length > 0) {
    return "custom";
  }
  if (profile?.template && profile.template !== "basic" && profile.template !== "custom") {
    return profile.template;
  }

  const nRaw = clientName;
  const nCompact = normalizeCreditClientCell(nRaw).replace(/\s+/g, "");
  const nPlain = normalizeCreditClientCell(nRaw);

  if ((SAMIL_NAME_HINTS.some((h) => creditNamesLinkedForProfile(nRaw, h)) || /삼일강업/.test(nCompact)) ||
      /^\(주\)\s*삼일\b/u.test(nPlain) || /^（주）\s*삼일\b/u.test(nPlain))
    return "samil";

  const nLower = nPlain.toLowerCase();
  if (nPlain.includes("지유전자") || (nPlain.includes("지유") && !nPlain.includes("북앤북"))) return "jiyoo";
  if (
    RAPID_NAME_HINTS.some((h) => creditNamesLinkedForProfile(nRaw, h)) ||
    /\brapid\b/i.test(nLower) ||
    nCompact.includes("래피드")
  )
    return "rapid";

  if (/녹원/.test(nPlain) || nCompact.includes("녹원씨앤아이")) return "nokwon";
  if (/다빛/.test(nPlain)) return "dabit";
  const book = detectBookKind(nPlain, nCompact);
  if (book) return book;
  if (/스노우피크|snow\s*peak/i.test(nPlain)) return "snowpeak";
  if (/아이엠텍|아이엠\s*텍|im\s*tech/i.test(nLower)) return "imtechplus";

  return "basic";
}

export function resolveStatementTemplate(
  clientName: string,
  profile?: StatementClientProfile | null
): ResolvedTemplateModel {
  const t = detectStatementTemplate(clientName, profile);
  if (t === "custom") {
    const keys = parseColumnKeysFromProfile(profile?.custom_statement_columns);
    if (keys.length === 0) return PRESET_MODELS.basic;
    return modelFromKeys("custom", "커스텀양식", keys, "dark");
  }
  return PRESET_MODELS[t];
}

/** 거래처 양식 연동 UI · 프리셋과 동일한 열 키 순서 */
export function presetColumnKeys(id: Exclude<StatementTemplateKey, "custom">): StatementColumnKey[] {
  return PRESET_MODELS[id].cols.map((c) => c.key);
}

export const TEMPLATE_LABELS: Record<StatementTemplateKey, string> = {
  basic: "기본양식",
  samil: "삼일강업양식",
  jiyoo: "지유전자양식",
  rapid: "래피드양식",
  nokwon: "녹원씨앤아이양식",
  dabit: "다빛양식",
  book_person: "(개인)북앤북양식",
  book_corp: "(주)북앤북양식",
  snowpeak: "스노우피크양식",
  imtechplus: "주식회사 아이엠텍플러스양식",
  custom: "커스텀양식",
};

/** 엑셀 상단 인사말 (공급자/공급받는자 대체) */
export function excelStatementGreeting(clientDisplayName: string, billingMonth: string): string {
  const parts = billingMonth.split("-");
  const monthNum = parts.length >= 2 ? String(Number(parts[1])) : "";
  const name = (clientDisplayName || "").trim() || "고객";
  return `${name} 고객님 ${monthNum}월 명세서. 이번달도 세계로지스와 함께해주셔서 감사합니다.`;
}
