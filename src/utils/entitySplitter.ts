import { RawRow } from "./sheetParser";

// ─────────────────────────────────────────────────────────────
// 패턴 감지
//   지원 형식:
//     "선진씨앤디(써피스)"      → main="선진씨앤디"  alias="써피스"
//     "북앤북(법인)"            → main="북앤북"      alias="법인"
//     "삼일강업 (A동)"          → main="삼일강업"    alias="A동"
//     "교보문고(강남점)(법인)"  → main="교보문고"    aliases=["강남점","법인"]
//   전각괄호（ ）도 처리
// ─────────────────────────────────────────────────────────────
const ALIAS_GLOBAL = /[（(]([^）)]+)[）)]/g;
const HAS_ALIAS    = /[（(][^）)]+[）)]/;

/** 거래처명에서 별칭 목록 추출 */
export function extractAliases(clientName: string): { main: string; aliases: string[] } {
  const aliases: string[] = [];
  let main = clientName;

  let m: RegExpExecArray | null;
  ALIAS_GLOBAL.lastIndex = 0;
  while ((m = ALIAS_GLOBAL.exec(clientName)) !== null) {
    aliases.push(m[1].trim());
  }

  // main: 괄호 전체 제거 후 공백 정리
  main = clientName.replace(/[（(][^）)]*[）)]/g, "").trim();

  return { main, aliases };
}

/** 분리 가능한 패턴이 있는지 확인 */
export function hasSplitPattern(clientName: string): boolean {
  return HAS_ALIAS.test(clientName);
}

// ─────────────────────────────────────────────────────────────
// 분리 결과 타입
// ─────────────────────────────────────────────────────────────
export interface SplitRow extends RawRow {
  /** 분리된 행이면 원본 거래처명 */
  splitFrom?: string;
  /** true = 괄호 안 별칭에서 파생된 보조 행 */
  isSplitAlias: boolean;
}

// ─────────────────────────────────────────────────────────────
// 분리 규칙 타입 (UI에서 관리)
// ─────────────────────────────────────────────────────────────
export interface SplitRule {
  /** 별칭 키워드 (예: "써피스", "법인") */
  keyword: string;
  /** true = 해당 키워드에 대해 분리 실행 */
  enabled: boolean;
  /**
   * 금액 배분 방식:
   *   "full"  = 원본 금액을 main 행에 전부, alias 행은 0
   *   "share" = 두 행 모두 원본 금액 (중복 집계 주의)
   */
  amountMode: "full" | "share";
}

// ─────────────────────────────────────────────────────────────
// 핵심: 행 하나를 분리 규칙에 따라 0~N개로 확장
// ─────────────────────────────────────────────────────────────
export function splitRow(row: RawRow, rules: SplitRule[]): SplitRow[] {
  if (!hasSplitPattern(row.clientName)) {
    return [{ ...row, isSplitAlias: false }];
  }

  const { main, aliases } = extractAliases(row.clientName);

  // 적용할 규칙이 하나도 없으면 원본 유지
  const activeRules = rules.filter(
    (r) => r.enabled && aliases.some((a) => a === r.keyword)
  );
  if (activeRules.length === 0) {
    return [{ ...row, isSplitAlias: false }];
  }

  const result: SplitRow[] = [];

  // main 행: 항상 포함 (금액은 full 또는 share 중 하나로 결정)
  // 여러 규칙이 충돌하면 첫 번째 규칙 우선
  const firstRule = activeRules[0];
  result.push({
    ...row,
    clientName: main,
    amount: row.amount, // main 행은 원본 금액 그대로
    splitFrom: row.clientName,
    isSplitAlias: false,
  });

  // alias 행 생성
  for (const rule of activeRules) {
    result.push({
      ...row,
      clientName: rule.keyword,
      // "full" 모드: alias 행은 0원 (추적 목적)
      // "share" 모드: 원본 금액 복사
      amount: rule.amountMode === "share" ? row.amount : 0,
      splitFrom: row.clientName,
      isSplitAlias: true,
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// 전체 rows 처리
// ─────────────────────────────────────────────────────────────
export function applyEntitySplit(rows: RawRow[], rules: SplitRule[]): SplitRow[] {
  return rows.flatMap((row) => splitRow(row, rules));
}

// ─────────────────────────────────────────────────────────────
// 파일 전체에서 감지된 별칭 키워드 목록 반환 (규칙 설정 UI용)
// ─────────────────────────────────────────────────────────────
export function detectAllAliases(rows: RawRow[]): string[] {
  const set = new Set<string>();
  rows.forEach((row) => {
    if (hasSplitPattern(row.clientName)) {
      const { aliases } = extractAliases(row.clientName);
      aliases.forEach((a) => set.add(a));
    }
  });
  return Array.from(set).sort();
}

// ─────────────────────────────────────────────────────────────
// 집계: (billing_month + clientName) 기준으로 합산 → ar_records 후보
// ─────────────────────────────────────────────────────────────
export interface AggregatedRecord {
  billing_month: string;
  client_name: string;
  client_biz_no: string;
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  due_date: string;
  status: "unpaid" | "partial" | "paid";
  memo: string;
  row_count: number;
  split_from?: string;
}

export function aggregateToRecords(
  rows: SplitRow[],
  billingMonthOverride: string
): AggregatedRecord[] {
  const map = new Map<string, AggregatedRecord>();

  rows.forEach((row) => {
    // billing_month: 파일 날짜에서 추출, 없으면 override 사용
    const month =
      row.date && row.date.length >= 7
        ? row.date.slice(0, 7)
        : billingMonthOverride;

    const key = `${month}||${row.clientName}`;

    if (map.has(key)) {
      const r = map.get(key)!;
      r.total_amount += row.amount;
      r.unpaid_amount = r.total_amount - r.paid_amount;
      r.row_count += 1;
      // due_date: 가장 늦은 날짜 사용
      if (row.dueDate && row.dueDate > r.due_date) r.due_date = row.dueDate;
      // memo 합산
      if (row.memo && !r.memo.includes(row.memo)) {
        r.memo = r.memo ? `${r.memo} / ${row.memo}` : row.memo;
      }
    } else {
      map.set(key, {
        billing_month: month,
        client_name: row.clientName,
        client_biz_no: row.bizNo,
        total_amount: row.amount,
        paid_amount: 0,
        unpaid_amount: row.amount,
        due_date: row.dueDate,
        status: row.amount === 0 ? "paid" : "unpaid",
        memo: row.memo,
        row_count: 1,
        split_from: row.splitFrom,
      });
    }
  });

  // status 재계산
  map.forEach((r) => {
    if (r.paid_amount >= r.total_amount && r.total_amount > 0) r.status = "paid";
    else if (r.paid_amount > 0) r.status = "partial";
    else r.status = "unpaid";
  });

  return Array.from(map.values()).sort((a, b) =>
    a.client_name.localeCompare(b.client_name, "ko")
  );
}
