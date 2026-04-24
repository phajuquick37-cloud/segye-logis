import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────
// 컬럼 키 정의
// ─────────────────────────────────────────────────────────────
export type ColKey = "date" | "client" | "amount" | "memo" | "bizno" | "duedate";

/** 각 컬럼 키별 인식 후보 헤더명 (앞쪽일수록 우선순위 높음) */
export const COL_HINTS: Record<ColKey, string[]> = {
  date: [
    "날짜", "일자", "거래일", "작성일", "발행일", "배송일", "출고일",
    "인도일", "처리일", "주문일", "거래날짜", "기일", "date",
  ],
  client: [
    "거래처명", "고객명", "업체명", "상호명", "수신처명", "납품처명",
    "거래처", "고객", "업체", "상호", "수신처", "납품처",
    "발주처", "주문처", "회사명", "기업명", "client", "customer",
  ],
  amount: [
    "합계금액", "청구금액", "결제금액", "총금액", "공급대가",
    "합계", "총액", "금액", "청구", "결제", "운임", "운임비",
    "배송비", "공급가액", "세액포함합계", "amount", "total",
  ],
  memo: ["비고", "메모", "특이사항", "참고", "적요", "내용", "memo", "note", "notes"],
  bizno: ["사업자번호", "사업자등록번호", "biz_no", "bizno"],
  duedate: ["지급기한", "납기일", "납기", "만기일", "결제기한", "due_date", "duedate"],
};

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────
export interface RawRow {
  date: string;       // ISO "YYYY-MM-DD" (없으면 "")
  clientName: string;
  amount: number;
  memo: string;
  bizNo: string;
  dueDate: string;
  /** 원본 셀 값 전체 (컬럼 헤더 → 값) */
  _original: Record<string, any>;
}

export interface DetectedCols {
  date: string | null;
  client: string | null;
  amount: string | null;
  memo: string | null;
  bizno: string | null;
  duedate: string | null;
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
}

// ─────────────────────────────────────────────────────────────
// 헬퍼: 헤더 정규화 (공백·부호 제거, 소문자)
// ─────────────────────────────────────────────────────────────
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-()（）[]/g, "");
}

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

  return s; // 변환 불가 시 원문 반환
}

// ─────────────────────────────────────────────────────────────
// 금액 파서 (쉼표·원기호·공백 제거)
// ─────────────────────────────────────────────────────────────
function parseAmount(val: any): number {
  if (typeof val === "number") return Math.abs(val);
  const s = String(val).replace(/[^0-9.-]/g, "");
  return Math.abs(Number(s) || 0);
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

  // 컬럼 자동 매핑
  const detectedIdx: Record<ColKey, number> = {
    date:    bestColIdx(headers, COL_HINTS.date),
    client:  bestColIdx(headers, COL_HINTS.client),
    amount:  bestColIdx(headers, COL_HINTS.amount),
    memo:    bestColIdx(headers, COL_HINTS.memo),
    bizno:   bestColIdx(headers, COL_HINTS.bizno),
    duedate: bestColIdx(headers, COL_HINTS.duedate),
  };

  if (detectedIdx.date    === -1) warnings.push("날짜 컬럼을 자동으로 찾지 못했습니다. 수동으로 지정해주세요.");
  if (detectedIdx.client  === -1) warnings.push("거래처명 컬럼을 자동으로 찾지 못했습니다. 수동으로 지정해주세요.");
  if (detectedIdx.amount  === -1) warnings.push("금액 컬럼을 자동으로 찾지 못했습니다. 수동으로 지정해주세요.");

  const detected: DetectedCols = {
    date:    detectedIdx.date    !== -1 ? headers[detectedIdx.date]    : null,
    client:  detectedIdx.client  !== -1 ? headers[detectedIdx.client]  : null,
    amount:  detectedIdx.amount  !== -1 ? headers[detectedIdx.amount]  : null,
    memo:    detectedIdx.memo    !== -1 ? headers[detectedIdx.memo]    : null,
    bizno:   detectedIdx.bizno   !== -1 ? headers[detectedIdx.bizno]   : null,
    duedate: detectedIdx.duedate !== -1 ? headers[detectedIdx.duedate] : null,
    allHeaders: headers,
  };

  const get = (row: any[], key: ColKey, override?: number) => {
    const idx = override !== undefined && override !== -1 ? override : detectedIdx[key];
    return idx !== -1 ? row[idx] : "";
  };

  // 데이터 행 파싱
  const rows: RawRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row: any[] = aoa[i];
    // 빈 행 건너뜀
    if (!row.some((c: any) => String(c).trim())) continue;

    const clientName = String(get(row, "client")).trim();
    if (!clientName) continue;

    const _original: Record<string, any> = {};
    headers.forEach((h, idx) => { if (h) _original[h] = row[idx]; });

    rows.push({
      date:       parseDate(get(row, "date")),
      clientName,
      amount:     parseAmount(get(row, "amount")),
      memo:       String(get(row, "memo")).trim(),
      bizNo:      String(get(row, "bizno")).trim(),
      dueDate:    parseDate(get(row, "duedate")),
      _original,
    });
  }

  return { rows, detected, detectedIdx, fileName, sheetName, warnings };
}

function emptyResult(fileName: string, sheetName: string, warnings: string[]): ParseResult {
  return {
    rows: [],
    detected: { date: null, client: null, amount: null, memo: null, bizno: null, duedate: null, allHeaders: [] },
    detectedIdx: { date: -1, client: -1, amount: -1, memo: -1, bizno: -1, duedate: -1 },
    fileName,
    sheetName,
    warnings,
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

    // _original을 이용해 재파싱
    const rows: RawRow[] = result.rows.map((r) => ({
      date:       parseDate(get(r._original, "date")),
      clientName: String(get(r._original, "client")).trim() || r.clientName,
      amount:     parseAmount(get(r._original, "amount")),
      memo:       String(get(r._original, "memo")).trim(),
      bizNo:      String(get(r._original, "bizno")).trim(),
      dueDate:    parseDate(get(r._original, "duedate")),
      _original:  r._original,
    })).filter((r) => r.clientName);

    return { ...result, rows, detectedIdx: patched };
  });
}
