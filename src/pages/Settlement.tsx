import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch, getDocs, setDoc, where,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  ArrowLeft, Upload, Plus, Trash2, CheckCircle, AlertCircle, Clock,
  User, X, FileText, AlertTriangle, Scissors, RotateCcw, Save,
  Search, Lock, History, CreditCard, Cloud, CloudOff, Loader2,
  FileSpreadsheet, Building2, Pencil, Trash2 as Trash2Icon, Mail, Send,
} from "lucide-react";

import {
  parseFile, ColKey, ParseResult,
  normalizeCreditClientCell,
  normalizeCreditNameForLink,
  isBlankCreditClientName,
  normalizePaymentCell, isCreditPaymentForSettlement,
} from "../utils/sheetParser";
import {
  detectAllAliases, applyEntitySplit, aggregateToRecords,
  SplitRule, AggregatedRecord, SplitRow,
} from "../utils/entitySplitter";
import { useStaffProfile } from "../hooks/useStaffProfile";
import MonthlyHistory, { useMonthClosures } from "../components/settlement/MonthlyHistory";
import StatementModal, { DocumentBody, SettlementItem, ClientProfile as ModalClientProfile } from "../components/settlement/StatementModal";
import { captureStatementToCanvas } from "../utils/statementCapture";
import { SUPPLIER, VAT_RATE } from "../config/companyInfo";

// ─────────────────────────────────────────────────────────────
// 타입 & 상수
// ─────────────────────────────────────────────────────────────
type RecordStatus = "unpaid" | "partial" | "paid";
type PageView = "credits" | "history" | "clients";
type TemplateType = "basic" | "samil" | "jiyoo" | "rapid";
const TEMPLATE_LABELS: Record<TemplateType, string> = {
  basic: "기본양식", samil: "삼일강업양식", jiyoo: "지유전자양식", rapid: "래피드양식",
};

interface ClientProfile {
  id?: string;
  name: string;
  biz_no: string;
  ceo_name: string;
  address: string;
  phone: string;
  email: string;
  business_type: string;
  business_item: string;
  template: TemplateType;
}

interface ArRecord {
  id: string;
  billing_month: string;
  client_name: string;
  client_biz_no?: string;
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  due_date: string;
  status: RecordStatus;
  memo: string;
  checked: boolean;
  checked_by?: string | null;
  checked_at?: string | null;
  contact_email?: string;
  split_from?: string;
  source_file?: string;
  item_count?: number;       // 신용건수
  delivery_fee?: number;     // 탁송료
  created_at?: any;
  updated_at?: any;
}

const COL_LABEL: Record<ColKey, string> = {
  date: "날짜", client: "거래처명", amount: "요금",
  deliveryfee: "탁송료", payment: "지급(신용·선불·착불)",
  memo: "비고", jeeyo: "적요", bizno: "사업자번호", duedate: "결제일",
  row_client: "고객명(상호)",
  departure: "출발동·출발지", destination: "도착동·도착지", vehicle_type: "차량·톤수",
  driver: "기사명", vehicle_no: "차량번호", unload_client: "하차지고객",
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtDateTime(iso: string) { return iso.slice(0, 16).replace("T", " "); }

/** 실제 청구금액: (요금 + 탁송료) × 1.1 (부가세 10%) */
function calcGrandTotal(r: { total_amount: number; delivery_fee?: number }): number {
  return Math.round((r.total_amount + (r.delivery_fee ?? 0)) * 1.1);
}

const FIRESTORE_BATCH_LIMIT = 450;

/** `ar_records` 문서와 `items` 서브컬렉션을 함께 삭제 (배치 한도 이하 청크) */
async function deleteArRecordCascade(parentId: string) {
  const itemsRef = collection(db, "ar_records", parentId, "items");
  const snap = await getDocs(itemsRef);
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  await deleteDoc(doc(db, "ar_records", parentId));
}

// ─────────────────────────────────────────────────────────────
// 전광판 (ScoreBoard)
// ─────────────────────────────────────────────────────────────
function ScoreBoard({ records, month, isClosed }: { records: ArRecord[]; month: string; isClosed: boolean }) {
  const confirmed   = records.filter((r) => r.checked);
  const unconfirmed = records.filter((r) => !r.checked);
  const confirmedAmt   = confirmed.reduce((s, r) => s + calcGrandTotal(r), 0);
  const unconfirmedAmt = unconfirmed.reduce((s, r) => s + calcGrandTotal(r), 0);
  const totalAmt = confirmedAmt + unconfirmedAmt;
  const pct = totalAmt > 0 ? Math.round((confirmedAmt / totalAmt) * 100) : 0;
  const allDone = records.length > 0 && unconfirmed.length === 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-2xl p-5 text-white shadow-lg">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">전체 청구액</p>
          <p className="text-3xl xl:text-4xl font-black font-mono tabular-nums leading-none">{totalAmt.toLocaleString()}</p>
          <p className="text-slate-400 text-sm mt-2 font-mono">원 · {records.length}개 거래처{isClosed && <span className="ml-2 text-yellow-400">🔒 마감확정</span>}</p>
        </div>
        <div className="bg-emerald-600 rounded-2xl p-5 text-white shadow-lg">
          <p className="text-emerald-100 text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />입금 확인 완료
          </p>
          <p className="text-3xl xl:text-4xl font-black font-mono tabular-nums leading-none">{confirmedAmt.toLocaleString()}</p>
          <p className="text-emerald-100 text-sm mt-2 font-mono">원 · {confirmed.length}개 거래처</p>
        </div>
        <div className={`rounded-2xl p-5 text-white shadow-lg transition-colors duration-300 ${unconfirmedAmt > 0 ? "bg-red-600" : "bg-slate-500"}`}>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${unconfirmedAmt > 0 ? "text-red-100" : "text-slate-300"}`}>
            <AlertCircle className="h-3.5 w-3.5" />전체 미수금액
          </p>
          <p className="text-3xl xl:text-4xl font-black font-mono tabular-nums leading-none">{unconfirmedAmt.toLocaleString()}</p>
          <p className={`text-sm mt-2 font-mono ${unconfirmedAmt > 0 ? "text-red-100" : "text-slate-300"}`}>
            원 · {unconfirmed.length}개 거래처
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl px-5 py-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-slate-600">수금률</span>
            <span className={`text-2xl font-black tabular-nums ${pct === 100 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : "text-red-600"}`}>{pct}%</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">{confirmed.length} / {records.length} 거래처</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ease-out ${pct === 100 ? "bg-emerald-500" : pct >= 70 ? "bg-blue-500" : "bg-red-500"}`}
            style={{ width: `${pct}%` }} />
        </div>
        {unconfirmed.length > 0 && (
          <div>
            <p className="text-xs font-bold text-red-600 mb-1.5 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />미입금 업체 ({unconfirmed.length}개)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unconfirmed.sort((a, b) => calcGrandTotal(b) - calcGrandTotal(a)).map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 font-semibold">
                  {r.client_name}<span className="text-red-400">|</span>
                  <span className="font-mono">{calcGrandTotal(r).toLocaleString()}원</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {allDone && (
          <p className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
            <CheckCircle className="h-5 w-5 text-emerald-500" />{month} 수금 전체 완료!
          </p>
        )}
        {records.length === 0 && (
          <p className="text-slate-400 text-sm text-center py-2">선택한 월에 등록된 데이터가 없습니다.</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 드래그 드롭 존
// ─────────────────────────────────────────────────────────────
function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => /\.(csv|xlsx|xls)$/i.test(f.name));
    if (files.length) onFiles(files);
  }, [onFiles]);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={handleDrop} onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40"}`}>
      <Upload className={`h-9 w-9 ${dragging ? "text-blue-500" : "text-slate-400"}`} />
      <div>
        <p className="font-bold text-slate-700">파일을 드래그하거나 클릭하여 선택</p>
        <p className="mt-1 text-sm text-slate-400">기본양식 · 삼일강업 · 지유전자 · 교보문고 등 CSV / XLSX / XLS</p>
      </div>
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) onFiles(files); e.target.value = ""; }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 컬럼 매핑 패널
// ─────────────────────────────────────────────────────────────
function ColumnMappingPanel({ result, overrides, onOverride }: {
  result: ParseResult; overrides: Partial<Record<ColKey, number>>; onOverride: (k: ColKey, i: number) => void;
}) {
  const REQUIRED: ColKey[] = ["client", "amount", "payment"];
  const OPTIONAL: ColKey[] = [
    "deliveryfee", "duedate", "memo", "jeeyo", "date", "bizno",
    "row_client", "departure", "destination", "vehicle_type", "driver", "vehicle_no", "unload_client",
  ];
  const effectiveIdx = (key: ColKey) => overrides[key] !== undefined ? overrides[key]! : result.detectedIdx[key];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
      <p className="text-sm font-bold text-slate-700">컬럼 매핑 확인</p>
      <p className="text-xs text-slate-500 leading-relaxed">
        <strong className="text-slate-600">거래처명</strong>이 있어도 <strong className="text-slate-600">지급</strong>이 <strong>선불·착불</strong>이면 월별 신용내역·정산에서 <strong>제외</strong>됩니다. 예) 거래처명 「김희철」, 지급 「선불」→ 집계 안 됨. <strong>「신용」</strong>이 적힌 행만 집계됩니다.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {([...REQUIRED, ...OPTIONAL] as ColKey[]).map((key) => {
          const idx = effectiveIdx(key); const ok = idx !== -1; const req = REQUIRED.includes(key);
          return (
            <div key={key} className={`rounded-lg border p-2 ${ok ? "border-green-200 bg-green-50" : req ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">{COL_LABEL[key]}{req && <span className="ml-0.5 text-red-500">*</span>}</span>
                {ok ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
              </div>
              <select value={idx} onChange={(e) => onOverride(key, Number(e.target.value))}
                className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                <option value={-1}>— 선택 안 함 —</option>
                {result.detected.allHeaders.map((h, i) => <option key={i} value={i}>{h || `(열 ${i + 1})`}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 분리 규칙 패널
// ─────────────────────────────────────────────────────────────
function SplitRulesPanel({ rules, onChange }: { rules: SplitRule[]; onChange: (r: SplitRule[]) => void }) {
  if (rules.length === 0) return null;
  const toggle = (kw: string) => onChange(rules.map((r) => r.keyword === kw ? { ...r, enabled: !r.enabled } : r));
  const setMode = (kw: string, mode: "full" | "share") => onChange(rules.map((r) => r.keyword === kw ? { ...r, amountMode: mode } : r));
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
      <p className="text-sm font-bold text-orange-800 flex items-center gap-2">
        <Scissors className="h-4 w-4 text-orange-600" />사업자 분리 감지 — {rules.length}개 별칭
      </p>
      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.keyword} className="flex flex-wrap items-center gap-3 rounded-lg bg-white border border-orange-100 px-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule.keyword)} className="w-4 h-4 accent-orange-500" />
              <span className="font-semibold text-slate-800">{rule.keyword}</span>
            </label>
            {rule.enabled && (
              <div className="flex gap-1 text-xs ml-auto">
                {(["full", "share"] as const).map((mode) => (
                  <button key={mode} onClick={() => setMode(rule.keyword, mode)}
                    className={`px-2 py-1 rounded-md border font-medium transition-colors ${rule.amountMode === mode ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                    {mode === "full" ? "금액→본사" : "금액복사"}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 집계 미리보기 테이블
// ─────────────────────────────────────────────────────────────
function PreviewTable({ records, billingMonth, onChangeBillingMonth, onChangeAmount, onRemove }: {
  records: AggregatedRecord[]; billingMonth: string;
  onChangeBillingMonth: (v: string) => void;
  onChangeAmount: (i: number, f: "total_amount" | "delivery_fee" | "paid_amount", v: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm font-bold text-slate-700">집계 미리보기 <span className="text-blue-600">{records.length}개</span> 거래처</p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">마감월</label>
          <input type="month" value={billingMonth} onChange={(e) => onChangeBillingMonth(e.target.value)}
            className="px-2 py-1 border border-slate-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>거래처명</TableHead>
              <TableHead className="text-center">건수</TableHead>
              <TableHead className="text-right">요금</TableHead>
              <TableHead className="text-right">탁송료</TableHead>
              <TableHead className="text-right">합계(부가포함)</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r, i) => {
              const gt = Math.round((r.total_amount + (r.delivery_fee ?? 0)) * 1.1);
              return (
                <TableRow key={i} className={r.split_from ? "bg-orange-50" : ""}>
                  <TableCell className="font-semibold">
                    {r.client_name}
                    {r.split_from && <span className="ml-1.5 text-[10px] text-orange-500">← {r.split_from}</span>}
                  </TableCell>
                  <TableCell className="text-center text-xs text-slate-400">{r.row_count}</TableCell>
                  <TableCell className="text-right">
                    <input type="number" value={r.total_amount}
                      onChange={(e) => onChangeAmount(i, "total_amount", Number(e.target.value))}
                      className="w-28 text-right text-sm border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </TableCell>
                  <TableCell className="text-right">
                    <input type="number" value={r.delivery_fee ?? 0}
                      onChange={(e) => onChangeAmount(i, "delivery_fee", Number(e.target.value))}
                      className="w-24 text-right text-sm border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </TableCell>
                  <TableCell className="text-right font-bold text-sm text-blue-700 font-mono">
                    {gt.toLocaleString()}원
                  </TableCell>
                  <TableCell>
                    <button onClick={() => onRemove(i)} className="text-slate-300 hover:text-red-500 p-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 업로드 패널
// ─────────────────────────────────────────────────────────────
function UploadPanel({ onClose, onSaved }: { onClose: () => void; onSaved: (month: string) => void }) {
  const [files, setFiles]         = useState<File[]>([]);
  const [fileIdx, setFileIdx]     = useState(0);
  const [parseResults, setPR]     = useState<ParseResult[]>([]);
  const [parsing, setParsing]     = useState(false);
  const [parseError, setErr]      = useState("");
  const [colOverrides, setColOv]  = useState<Partial<Record<ColKey, number>>>({});
  const [splitRules, setSplitR]   = useState<SplitRule[]>([]);
  const [billingMonth, setBM]     = useState(currentMonth());
  const [preview, setPreview]     = useState<AggregatedRecord[]>([]);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveErr]   = useState("");
  const autoSaveRef               = useRef(false);

  // ── 신용거래처 등록 목록 (client_profiles) ──
  const [creditNames, setCreditNames] = useState<Set<string>>(new Set());
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [skippedCount, setSkipped]    = useState(0);
  /** 컬럼 매핑 변경으로 거래처명이 비게 되어 집계에서 뺀 행 수(파싱 시 포함됐던 행만) */
  const [remapEmptyClientDrop, setRemapEmptyClientDrop] = useState(0);

  useEffect(() => {
    const q = query(collection(db, "client_profiles"), orderBy("name"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const names = new Set(
          snap.docs
            .map((d) => normalizeCreditNameForLink((d.data().name as string) ?? ""))
            .filter(Boolean)
        );
        setCreditNames(names);
        setProfilesLoaded(true);
      },
      () => setProfilesLoaded(true)
    );
    return () => unsub();
  }, []);

  const handleFiles = async (incoming: File[]) => {
    autoSaveRef.current = false; // 새 파일이면 자동저장 플래그 초기화
    setParsing(true); setErr(""); setSaved(false); setSaveErr("");
    try {
      const results = await Promise.all(incoming.map(parseFile));
      setFiles(incoming); setPR(results); setFileIdx(0); setColOv({});
      const aliases = detectAllAliases(results[0].rows);
      setSplitR(aliases.map((kw) => ({ keyword: kw, enabled: false, amountMode: "full" as const })));
    } catch (e: any) { setErr(`파일 오류: ${e?.message ?? e}`); }
    finally { setParsing(false); }
  };

  const currentResult = parseResults[fileIdx] ?? null;

  useEffect(() => {
    if (!currentResult) return;
    const patchedIdx = { ...currentResult.detectedIdx, ...colOverrides };
    const headers = currentResult.detected.allHeaders;

    const safeNum = (v: any): number => {
      const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
      return isNaN(n) ? 0 : Math.abs(n);
    };

    const patched = currentResult.rows.map((row) => {
      const getVal = (key: ColKey) => {
        const i = patchedIdx[key];
        return i !== -1 ? (row._original[headers[i]] ?? "") : "";
      };
      const strOpt = (key: ColKey, fallback?: string) => {
        if (patchedIdx[key] === -1) return fallback;
        const s = String(getVal(key)).trim();
        return s || undefined;
      };
      return {
        ...row,
        clientName:  normalizeCreditClientCell(getVal("client")),
        amount:      safeNum(getVal("amount")) || row.amount,
        deliveryFee: patchedIdx["deliveryfee"] !== -1
          ? safeNum(getVal("deliveryfee"))
          : row.deliveryFee,
        memo: patchedIdx["memo"] !== -1 ? String(getVal("memo")).trim() : row.memo,
        jeeyo: patchedIdx["jeeyo"] !== -1
          ? String(getVal("jeeyo")).trim() || undefined
          : row.jeeyo,
        rowClient:    strOpt("row_client", row.rowClient),
        departure:    strOpt("departure", row.departure),
        destination:  strOpt("destination", row.destination),
        vehicleType:  strOpt("vehicle_type", row.vehicleType),
        driver:       strOpt("driver", row.driver),
        vehicleNo:    strOpt("vehicle_no", row.vehicleNo),
        unloadClient: strOpt("unload_client", row.unloadClient),
        paymentLabel:
          patchedIdx.payment !== -1
            ? normalizePaymentCell(getVal("payment")) || undefined
            : undefined,
      };
    });
    const creditRowsOnly = patched.filter((r) => {
      if (isBlankCreditClientName(r.clientName)) return false;
      if (patchedIdx.payment === -1) return false;
      return isCreditPaymentForSettlement(r.paymentLabel ?? "");
    });
    setRemapEmptyClientDrop(Math.max(0, patched.length - creditRowsOnly.length));
    const split = applyEntitySplit(creditRowsOnly, splitRules);

    // ── 신용 마감: 거래처명이 있는 행만 집계 (거래처 정보 탭 미등록이어도 업로드 가능)
    //    미등록 상호는 skippedCount로 안내, 신용내역에서 선택 삭제 가능
    const filtered = split;
    let unregistered = 0;
    if (profilesLoaded && creditNames.size > 0) {
      unregistered = split.filter(
        (r) => !creditNames.has(normalizeCreditNameForLink(r.clientName))
      ).length;
    }
    setSkipped(unregistered);
    setSplitRows(filtered);
    setPreview(aggregateToRecords(filtered, billingMonth));
  }, [currentResult, colOverrides, splitRules, billingMonth, creditNames, profilesLoaded]);

  useEffect(() => {
    if (!currentResult) return;
    const aliases = detectAllAliases(currentResult.rows);
    setSplitR((prev) => {
      const existing = new Map(prev.map((r) => [r.keyword, r]));
      return aliases.map((kw) => existing.get(kw) ?? { keyword: kw, enabled: false, amountMode: "full" as const });
    });
  }, [currentResult]);

  // ── 파일 파싱 완료 후 자동저장 ──
  useEffect(() => {
    if (preview.length > 0 && !autoSaveRef.current && !saving && !saved) {
      autoSaveRef.current = true;
      handleSave();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  // Firestore 는 undefined 값을 거부 → undefined 키를 모두 제거
  const stripUndefined = (obj: Record<string, any>): Record<string, any> =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

  const handleSave = async () => {
    if (!preview.length) return;
    setSaving(true); setSaveErr("");

    // Firestore 는 NaN / Infinity / undefined 를 거부하므로 안전 숫자 변환
    const safeN = (v: any): number => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    };

    try {
      // Firestore batch 한도 500개 → 대량 업로드 시 청크 분리
      const CHUNK = 200; // ar_record + items 각 1쌍 = 2op, 여유 있게 200건
      const chunks: typeof preview[] = [];
      for (let i = 0; i < preview.length; i += CHUNK) {
        chunks.push(preview.slice(i, i + CHUNK));
      }

      const srcFile = currentResult?.fileName ?? "";

      for (const chunk of chunks) {
        const batch = writeBatch(db);

        chunk.forEach((aggregated) => {
          const arRef = doc(collection(db, "ar_records"));

          const fee      = safeN(aggregated.total_amount);
          const deliv    = safeN(aggregated.delivery_fee ?? 0);
          const grandTotal = Math.round((fee + deliv) * 1.1);

          const aggClient = normalizeCreditNameForLink(aggregated.client_name);
          const matching = splitRows.filter((row) => {
            const rowMonth = (row.date ?? "").slice(0, 7) || billingMonth;
            return (
              rowMonth === aggregated.billing_month &&
              normalizeCreditNameForLink(row.clientName) === aggClient
            );
          });
          const rowsToSave = matching.length > 0
            ? matching
            : [{ date: `${aggregated.billing_month}-01`, memo: "", amount: fee, deliveryFee: deliv, clientName: aggregated.client_name, bizNo: "", dueDate: "" }];

          batch.set(arRef, stripUndefined({
            billing_month:  aggregated.billing_month,
            client_name:    aggregated.client_name,
            client_biz_no:  aggregated.client_biz_no || "",
            total_amount:   fee,
            delivery_fee:   deliv,
            paid_amount:    safeN(aggregated.paid_amount),
            unpaid_amount:  Math.max(0, grandTotal - safeN(aggregated.paid_amount)),
            due_date:       aggregated.due_date || "",
            status:         aggregated.status,
            memo:           aggregated.memo || "",
            row_count:      aggregated.row_count || rowsToSave.length,
            split_from:     aggregated.split_from || null,
            checked:        false,
            source_file:    srcFile || "",
            item_count:     rowsToSave.length,
            created_at:     serverTimestamp(),
            updated_at:     serverTimestamp(),
          }));

          rowsToSave.forEach((row) => {
            const rowAmt = safeN((row as any).amount ?? 0);
            const itemData: Record<string, any> = {
              date:          row.date || `${aggregated.billing_month}-01`,
              description:   (row as any).rowClient || row.memo || `${aggregated.billing_month} 화물 운송비`,
              quantity:      1,
              unit_price:    rowAmt,
              supply_amount: rowAmt,
              tax_amount:    0,
              total_amount:  rowAmt,
              memo:          row.memo || "",
              created_at:    serverTimestamp(),
            };
            // 거래명세표 세부 항목 필드 — 엑셀에서 감지된 경우에만 저장
            if ((row as any).departure)    itemData.departure    = (row as any).departure;
            if ((row as any).destination)  itemData.destination  = (row as any).destination;
            if ((row as any).vehicleType)  itemData.vehicle_type = (row as any).vehicleType;
            if ((row as any).driver)       itemData.driver       = (row as any).driver;
            if ((row as any).vehicleNo)    itemData.vehicle_no   = (row as any).vehicleNo;
            if ((row as any).unloadClient) itemData.unload_client= (row as any).unloadClient;
            if ((row as any).rowClient)    itemData.row_client   = (row as any).rowClient;
            if ((row as any).jeeyo)        itemData.jeeyo        = (row as any).jeeyo;
            if ((row as any).paymentLabel) itemData.pay_type     = (row as any).paymentLabel;
            batch.set(doc(collection(db, "ar_records", arRef.id, "items")), itemData);
          });
        });

        await batch.commit();
      }

      setSaved(true);
      onSaved(billingMonth);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveErr(`저장 실패: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeAmount = (idx: number, field: "total_amount" | "delivery_fee" | "paid_amount", val: number) => {
    setPreview((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [field]: val };
      const gt = Math.round((next.total_amount + (next.delivery_fee ?? 0)) * 1.1);
      next.unpaid_amount = Math.max(0, gt - next.paid_amount);
      if (next.paid_amount >= gt && gt > 0) next.status = "paid";
      else if (next.paid_amount > 0) next.status = "partial";
      else next.status = "unpaid";
      return next;
    }));
  };

  if (!files.length) return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Upload className="h-4 w-4 text-blue-600" />마감 파일 가져오기</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DropZone onFiles={handleFiles} />
        {parsing && <p className="text-center text-sm text-slate-500 animate-pulse">파일 파싱 중...</p>}
        {parseError && <p className="text-sm text-red-500">{parseError}</p>}
      </CardContent>
    </Card>
  );
  if (!currentResult) return null;

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" />파일 분석 결과</span>
          <div className="flex gap-2">
            <button onClick={() => { setFiles([]); setPR([]); setSaved(false); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded px-2 py-1">
              <RotateCcw className="h-3 w-3" /> 다시 선택
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {files.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {files.map((f, i) => (
              <button key={i} onClick={() => { setFileIdx(i); setColOv({}); }}
                className={`px-3 py-1 text-xs rounded-full border font-medium ${i === fileIdx ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                {f.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1"><FileText className="h-3.5 w-3.5 text-slate-500" /><strong>{currentResult.fileName}</strong></span>
          <span className="flex items-center gap-1.5 bg-blue-100 text-blue-700 rounded-full px-3 py-1" title="거래처명 열에 값이 있는 행만">
            <strong>{currentResult.rows.length}행</strong> 신용 마감 집계
          </span>
          {currentResult.skippedNonCreditRows > 0 && (
            <span className="flex items-center gap-1.5 bg-slate-200 text-slate-700 rounded-full px-3 py-1 text-xs" title="거래처명이 공란인 행은 일반 고객으로 보고 제외">
              일반 고객(거래처명 공란) <strong>{currentResult.skippedNonCreditRows}행</strong> 제외
            </span>
          )}
          {currentResult.skippedNonCreditPaymentRows > 0 && (
            <span className="flex items-center gap-1.5 bg-amber-50 text-amber-900 rounded-full px-3 py-1 text-xs border border-amber-200" title="선불·착불·공란 등 신용 외 지급">
              신용 외 지급(선불·착불·공란 등) <strong>{currentResult.skippedNonCreditPaymentRows}행</strong> 제외
            </span>
          )}
          {remapEmptyClientDrop > 0 && (
            <span className="flex items-center gap-1.5 bg-amber-100 text-amber-900 rounded-full px-3 py-1 text-xs">
              컬럼 매핑으로 거래처명 누락 <strong>{remapEmptyClientDrop}행</strong> 집계 제외
            </span>
          )}
          {currentResult.warnings.map((w, i) => (
            <span key={i} className="flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-3 py-1 text-xs"><AlertTriangle className="h-3 w-3" />{w}</span>
          ))}
        </div>
        <ColumnMappingPanel result={currentResult} overrides={colOverrides} onOverride={(key, idx) => setColOv((p) => ({ ...p, [key]: idx }))} />
        <SplitRulesPanel rules={splitRules} onChange={setSplitR} />

        <div className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 border border-blue-100 bg-blue-50/80 text-slate-800">
          <CreditCard className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
          <div className="text-xs leading-relaxed">
            <span className="font-semibold text-slate-900">신용거래처 마감 규칙</span>
            <span className="block mt-1">
              <strong>거래처명</strong>에 상호가 있어도 <strong>지급</strong>이 <strong>선불·착불·선착불</strong>이면 <strong>월별 신용내역·정산에서 제외</strong>됩니다. (예: 거래처명 「김희철」, 지급 「선불」)
              <strong>「신용」</strong>이 지급란에 있는 행만 집계됩니다. 지급 열은 컬럼 매핑에서 반드시 지정하세요.
            </span>
          </div>
        </div>

        {/* 신용거래처 필터 결과 안내 */}
        {!profilesLoaded ? (
          <div className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            거래처 등록 목록 확인 중… (업로드에는 영향 없음)
          </div>
        ) : creditNames.size > 0 ? (
          <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${
            skippedCount > 0
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}>
            <Building2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">신용 마감 집계 안내</span>
              <span className="ml-2 text-xs opacity-80">
                (거래처 정보 탭 등록 {creditNames.size}개 기준)
              </span>
              {skippedCount > 0 && (
                <div className="mt-0.5 text-xs">
                  집계에 포함된 상호 중, 거래처 정보에 <strong>없는 이름</strong>이 <strong>{skippedCount}행</strong> 있습니다.
                  저장 후 <strong>신용내역</strong>에서 해당 업체를 체크하고 <strong>선택 삭제</strong>하면 합계가 다시 계산됩니다.
                </div>
              )}
              {skippedCount === 0 && (
                <div className="mt-0.5 text-xs">집계된 신용 거래처명이 모두 등록 목록과 일치합니다.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-900">
            <Building2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">거래처 정보 미등록</span>
              <div className="mt-0.5 text-xs">
                엑셀 <strong>거래처명</strong> + <strong>지급「신용」</strong> 행만 신용 마감에 들어갑니다.
                잘못 포함된 상호는 <strong>신용내역</strong>에서 체크 후 <strong>선택 삭제</strong>하세요.
              </div>
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <PreviewTable records={preview} billingMonth={billingMonth} onChangeBillingMonth={setBM}
            onChangeAmount={handleChangeAmount} onRemove={(idx) => setPreview((p) => p.filter((_, i) => i !== idx))} />
        )}
        {preview.length > 0 && (
          <div className="space-y-2">
            {/* 자동저장 상태 표시 */}
            {saving && (
              <div className="flex items-center gap-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm font-semibold">
                <Loader2 className="h-4 w-4 animate-spin" />
                자동 저장 중... ({preview.length}개 거래처)
              </div>
            )}
            {saved && (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                  <CheckCircle className="h-5 w-5" />
                  자동 저장 완료! {preview.length}개 거래처 → 목록에서 확인하세요.
                </div>
                <button onClick={onClose} className="text-xs text-emerald-600 border border-emerald-300 rounded-lg px-3 py-1 hover:bg-emerald-100">
                  닫기
                </button>
              </div>
            )}
            {!saving && !saved && (
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 font-bold gap-2 w-full">
                <Save className="h-4 w-4" />수동 저장 ({preview.length}건)
              </Button>
            )}
            {saveError && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />{saveError}
                </div>
                <Button onClick={() => { autoSaveRef.current = false; setSaveErr(""); setSaved(false); handleSave(); }}
                  className="bg-red-600 hover:bg-red-700 gap-2 w-full font-bold">
                  <Save className="h-4 w-4" />다시 저장 시도
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// 수동 등록 패널
// ─────────────────────────────────────────────────────────────
function AddRecordPanel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ billing_month: currentMonth(), client_name: "", client_biz_no: "", total_amount: "", paid_amount: "0", due_date: "", memo: "" });
  const [err, setErr] = useState("");
  const f = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const nameLinked = normalizeCreditNameForLink(form.client_name);
    if (!nameLinked) { setErr("거래처명을 입력하세요."); return; }
    const total = Number(form.total_amount.replace(/[^0-9.-]/g, "")) || 0;
    const paid  = Number(form.paid_amount.replace(/[^0-9.-]/g, ""))  || 0;
    const unpaid = Math.max(0, total - paid);
    let status: RecordStatus = "unpaid";
    if (paid >= total && total > 0) status = "paid";
    else if (paid > 0) status = "partial";
    await addDoc(collection(db, "ar_records"), {
      billing_month: form.billing_month, client_name: nameLinked,
      client_biz_no: form.client_biz_no.trim(), total_amount: total,
      paid_amount: paid, unpaid_amount: unpaid, due_date: form.due_date,
      status, memo: form.memo.trim(), checked: false,
      created_at: serverTimestamp(), updated_at: serverTimestamp(),
    });
    onClose();
  };

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Plus className="h-4 w-4 text-green-600" />직접 등록</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "마감 월*",   key: "billing_month", type: "month" },
            { label: "거래처명*",  key: "client_name",   type: "text",  placeholder: "(주)홍길동물류" },
            { label: "사업자번호", key: "client_biz_no", type: "text",  placeholder: "000-00-00000" },
            { label: "청구금액",   key: "total_amount",  type: "text",  placeholder: "1,000,000" },
            { label: "입금금액",   key: "paid_amount",   type: "text",  placeholder: "0" },
            { label: "지급기한",   key: "due_date",      type: "date" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <input type={type} value={form[key as keyof typeof form]} onChange={(e) => f(key as keyof typeof form, e.target.value)} placeholder={placeholder}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          ))}
          <div className="col-span-2 md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">비고</label>
            <input type="text" value={form.memo} onChange={(e) => f("memo", e.target.value)} placeholder="특이사항"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          {err && <p className="col-span-full text-sm text-red-500">{err}</p>}
          <div className="col-span-full flex gap-2">
            <Button type="submit" className="bg-green-600 hover:bg-green-700 font-bold">등록</Button>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────
export default function Settlement() {
  const { username, syncing, save: saveUsername } = useStaffProfile();
  const [usernameInput, setUsernameInput] = useState("");
  const [showUserModal, setShowUserModal] = useState(!localStorage.getItem("settlement_username"));

  const [records, setRecords]     = useState<ArRecord[]>([]);
  const [filterMonth, setMonth]   = useState(currentMonth());
  const [search, setSearch]       = useState("");
  const [activeView, setActiveView] = useState<PageView>("credits");
  const [showUpload, setUpload]   = useState(false);
  const [showAdd, setAdd]         = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ArRecord | null>(null);
  const [quickMailRecord, setQuickMailRecord] = useState<ArRecord | null>(null);
  const [confirmCheckRecord, setConfirmCheck] = useState<ArRecord | null>(null);

  // ── 엑셀 내보내기 ──
  const handleExportExcel = () => {
    if (sorted.length === 0) return;
    const [y, m] = filterMonth.split("-");
    const title = `${y}년 ${m}월 신용내역`;

    const headerRow = ["No", "거래처명", "건수", "요금", "탁송료", "합계(부가세포함)", "비고", "결제일", "수금상태"];
    const dataRows = sorted.map((r, i) => {
      const gt = calcGrandTotal(r);
      const dueDisplay = r.due_date
        ? r.due_date.match(/^\d{4}-\d{2}-(\d{2})$/)
          ? `${r.due_date.slice(5, 7)}/${r.due_date.slice(8, 10)}`
          : r.due_date
        : "";
      return [
        i + 1,
        r.client_name,
        r.item_count ?? 0,
        r.total_amount,
        r.delivery_fee ?? 0,
        gt,
        r.memo ?? "",
        dueDisplay,
        r.checked ? "수금완료" : "미수금",
      ];
    });

    const totalFee   = sorted.reduce((s, r) => s + r.total_amount, 0);
    const totalDeliv = sorted.reduce((s, r) => s + (r.delivery_fee ?? 0), 0);
    const totalGrand = sorted.reduce((s, r) => s + calcGrandTotal(r), 0);
    const paidGrand  = sorted.filter(r => r.checked).reduce((s, r) => s + calcGrandTotal(r), 0);

    const sumRow = [
      "", `합 계 (${sorted.length}개 거래처)`,
      sorted.reduce((s, r) => s + (r.item_count ?? 0), 0),
      totalFee, totalDeliv, totalGrand, "", "", `입금 ${paidGrand.toLocaleString()} / 미수 ${(totalGrand - paidGrand).toLocaleString()}`,
    ];

    const aoa = [
      [title],
      [],
      headerRow,
      ...dataRows,
      [],
      sumRow,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 4 }, { wch: 22 }, { wch: 6 }, { wch: 14 }, { wch: 10 },
      { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 12 },
    ];
    // 제목 병합
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];

    // 데이터 행 숫자 서식
    const fmtMoney = "#,##0";
    for (let ri = 3; ri < 3 + dataRows.length; ri++) {
      ["D", "E", "F"].forEach((col) => {
        const cellRef = `${col}${ri + 1}`;
        if (ws[cellRef]) ws[cellRef].z = fmtMoney;
      });
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${m}월 신용내역`);
    XLSX.writeFile(wb, `${title}.xlsx`);
  };

  // ── 이 달 전체 삭제 ──
  const [deleting, setDeleting] = useState(false);
  const handleDeleteMonth = async () => {
    const monthRecords = records.filter((r) => r.billing_month === filterMonth);
    if (monthRecords.length === 0) return;
    if (!window.confirm(
      `${filterMonth.split("-")[0]}년 ${filterMonth.split("-")[1]}월 신용내역 ${monthRecords.length}건을 전체 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
    )) return;
    setDeleting(true);
    try {
      for (const r of monthRecords) {
        await deleteArRecordCascade(r.id);
      }
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  // ── 컬럼 너비 조절 ──
  const COL_KEYS = ["선택","거래처명","신용건수","요금","탁송료","합계","비고","결제일","입금확인","액션"] as const;
  const LEGACY_COL_WIDTH_LEN = 9;
  const DEFAULT_COL_W = [44, 220, 72, 130, 110, 150, 80, 120, 76, 68];
  const [colWidths, setColWidths] = useState<number[]>(() => {
    try {
      const s = localStorage.getItem("settlement_col_widths");
      const parsed = s ? JSON.parse(s) : null;
      if (Array.isArray(parsed) && parsed.length === DEFAULT_COL_W.length) return parsed;
      if (Array.isArray(parsed) && parsed.length === LEGACY_COL_WIDTH_LEN) return [44, ...parsed];
      return DEFAULT_COL_W;
    } catch { return DEFAULT_COL_W; }
  });
  const resizeDrag = useRef<{ idx: number; x0: number; w0: number } | null>(null);
  const startResize = useCallback((e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    resizeDrag.current = { idx, x0: e.clientX, w0: colWidths[idx] };
    const onMove = (ev: MouseEvent) => {
      if (!resizeDrag.current) return;
      const { idx: ci, x0, w0 } = resizeDrag.current;
      const newW = Math.max(48, w0 + ev.clientX - x0);
      setColWidths((prev) => {
        const next = [...prev];
        next[ci] = newW;
        localStorage.setItem("settlement_col_widths", JSON.stringify(next));
        return next;
      });
    };
    const onUp = () => {
      resizeDrag.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths]);
  const resetColWidths = () => {
    setColWidths(DEFAULT_COL_W);
    localStorage.removeItem("settlement_col_widths");
  };

  // 세부 내역 확장
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsCache, setItemsCache] = useState<Record<string, any[]>>({});
  const [selectedArIds, setSelectedArIds] = useState<Set<string>>(() => new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  useEffect(() => {
    setSelectedArIds(new Set());
  }, [filterMonth]);

  useEffect(() => {
    setSelectedArIds((prev) => {
      const valid = new Set(records.map((r) => r.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
    });
  }, [records]);

  const toggleExpand = useCallback(async (r: ArRecord) => {
    if (expandedId === r.id) { setExpandedId(null); return; }
    setExpandedId(r.id);
    if (!itemsCache[r.id]) {
      const snap = await getDocs(query(collection(db, "ar_records", r.id, "items"), orderBy("date", "asc")));
      setItemsCache((prev) => ({ ...prev, [r.id]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }));
    }
  }, [expandedId, itemsCache]);

  // 마감 확정 맵
  const closures = useMonthClosures();
  const currentMonthClosed = !!closures.get(filterMonth);

  // Firestore 실시간 구독
  useEffect(() => {
    const q = query(collection(db, "ar_records"), orderBy("created_at", "desc"));
    return onSnapshot(q, (snap) =>
      setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ArRecord)))
    );
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const okMonth  = !filterMonth || r.billing_month === filterMonth;
      const okSearch = !q || r.client_name.toLowerCase().includes(q) || (r.client_biz_no ?? "").includes(q);
      return okMonth && okSearch;
    });
  }, [records, filterMonth, search]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      // 합계금액 내림차순 (금액 많은 업체가 위)
      // 같은 금액이면 입금확인 완료(checked) 항목을 아래로
      const diff = calcGrandTotal(b) - calcGrandTotal(a);
      if (diff !== 0) return diff;
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.client_name.localeCompare(b.client_name, "ko");
    }),
    [filtered]
  );

  // 입금 확인 체크박스 — 마감 확정 달은 차단
  // 입금확인 클릭 → 확인 다이얼로그 표시
  const handleCheck = (r: ArRecord) => {
    if (currentMonthClosed) {
      alert(`${filterMonth}은 마감 확정된 달입니다.\n월별 이력 탭에서 마감을 해제한 후 수정하세요.`);
      return;
    }
    if (!username) { setShowUserModal(true); return; }
    setConfirmCheck(r);
  };

  // 확인 다이얼로그에서 "예" 클릭 시 실제 처리
  const doCheck = async (r: ArRecord) => {
    setConfirmCheck(null);
    const next = !r.checked;
    const gt   = calcGrandTotal(r);
    await updateDoc(doc(db, "ar_records", r.id), {
      checked:       next,
      checked_by:    next ? username : null,
      checked_at:    next ? new Date().toISOString() : null,
      paid_amount:   next ? gt : 0,
      unpaid_amount: next ? 0  : gt,
      status:        next ? "paid" : "unpaid",
      updated_at:    serverTimestamp(),
    });
  };

  const handleDelete = async (id: string) => {
    if (currentMonthClosed) { alert("마감 확정된 달의 데이터는 삭제할 수 없습니다."); return; }
    if (!window.confirm("이 항목을 삭제하시겠습니까?")) return;
    await deleteArRecordCascade(id);
    setSelectedArIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setExpandedId((e) => (e === id ? null : e));
    setItemsCache((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const selectedInViewCount = useMemo(
    () => sorted.filter((r) => selectedArIds.has(r.id)).length,
    [sorted, selectedArIds]
  );
  const allVisibleSelected =
    sorted.length > 0 && sorted.every((r) => selectedArIds.has(r.id));

  const toggleSelectRow = (id: string) => {
    if (currentMonthClosed) return;
    setSelectedArIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (currentMonthClosed || sorted.length === 0) return;
    setSelectedArIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) sorted.forEach((r) => next.delete(r.id));
      else sorted.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const handleBatchDeleteSelected = async () => {
    if (currentMonthClosed) {
      alert(`${filterMonth}은 마감 확정된 달입니다.\n월별 이력 탭에서 마감을 해제한 후 삭제하세요.`);
      return;
    }
    const ids = sorted.filter((r) => selectedArIds.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    if (!window.confirm(`선택한 ${ids.length}건의 신용내역을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setBatchDeleting(true);
    try {
      for (const id of ids) {
        await deleteArRecordCascade(id);
      }
      setSelectedArIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setExpandedId((e) => (e && ids.includes(e) ? null : e));
      setItemsCache((prev) => {
        const next = { ...prev };
        ids.forEach((id) => { delete next[id]; });
        return next;
      });
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchDeleting(false);
    }
  };

  // 월별이력 탭에서 "이 달 보기" 클릭 시
  const handleSelectMonth = (month: string) => {
    setMonth(month);
    setActiveView("credits");
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-slate-400 hover:text-slate-600 transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">월별 신용내역 관리</h1>
              <p className="text-sm text-slate-500 mt-0.5">세계로지스 미수금 · 입금 확인 시스템</p>
            </div>
          </div>
          {/* 사용자명 + 동기화 상태 */}
          <button onClick={() => setShowUserModal(true)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl px-3 py-2 bg-white shadow-sm transition-colors">
            <User className="h-4 w-4 text-blue-500" />
            <span className="font-semibold">{username || "이름 설정"}</span>
            {syncing
              ? <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              : username
              ? <Cloud className="h-3.5 w-3.5 text-emerald-400" title="Firestore에 저장됨" />
              : <CloudOff className="h-3.5 w-3.5 text-slate-400" />}
          </button>
        </div>

        {/* ── 탭 ── */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm w-fit">
          {([
            { key: "credits", label: "신용내역", icon: CreditCard },
            { key: "history", label: "월별 이력", icon: History },
            { key: "clients", label: "거래처 정보", icon: Building2 },
          ] as { key: PageView; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveView(key)}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeView === key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* ══ 신용내역 뷰 ══ */}
        {activeView === "credits" && (
          <>
            {/* 컨트롤 바 */}
            <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl px-4 py-3 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2">
                {currentMonthClosed && <Lock className="h-4 w-4 text-slate-400" title="마감 확정됨" />}
                <label className="text-sm font-semibold text-slate-600">마감월</label>
                <input type="month" value={filterMonth} onChange={(e) => setMonth(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                {currentMonthClosed && (
                  <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200 gap-1 text-xs">
                    <Lock className="h-3 w-3" />마감확정
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="업체명 검색..."
                  className="pl-8 pr-8 py-1.5 border border-slate-200 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <div className="ml-auto flex gap-2 flex-wrap">
                {sorted.length > 0 && (
                  <Button
                    variant="outline" size="sm"
                    className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={handleExportExcel}
                    title="현재 월 데이터를 엑셀로 내보내기"
                  >
                    <FileSpreadsheet className="h-4 w-4" />엑셀 내보내기
                  </Button>
                )}
                {filtered.length > 0 && (
                  <Button
                    variant="outline" size="sm"
                    className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={handleDeleteMonth}
                    disabled={deleting || currentMonthClosed}
                    title="이 달 업로드 데이터 전체 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "삭제 중..." : "업로드 삭제"}
                  </Button>
                )}
                {!currentMonthClosed && (
                  <>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setUpload((v) => !v); setAdd(false); }}>
                      <Upload className="h-4 w-4" />{showUpload ? "닫기" : "파일 업로드"}
                    </Button>
                    <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => { setAdd((v) => !v); setUpload(false); }}>
                      <Plus className="h-4 w-4" />직접 등록
                    </Button>
                  </>
                )}
              </div>
            </div>

            {showUpload && (
              <UploadPanel
                onClose={() => setUpload(false)}
                onSaved={(month) => { setMonth(month); setUpload(false); }}
              />
            )}
            {showAdd    && <AddRecordPanel onClose={() => setAdd(false)} />}

            <ScoreBoard records={filtered} month={filterMonth} isClosed={currentMonthClosed} />

            {/* 신용내역 테이블 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <h2 className="font-bold text-slate-800 text-base">
                  {filterMonth.split("-")[0]}년 {filterMonth.split("-")[1]}월 신용내역
                  {search && <span className="ml-2 text-sm text-blue-600 font-normal">"{search}" 검색 중</span>}
                </h2>
                <span className="text-sm text-slate-400">{filtered.length}개 거래처</span>
                {selectedInViewCount > 0 && !currentMonthClosed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                    disabled={batchDeleting}
                    onClick={handleBatchDeleteSelected}
                  >
                    <Trash2 className="h-4 w-4" />
                    {batchDeleting ? "삭제 중…" : `선택 삭제 (${selectedInViewCount})`}
                  </Button>
                )}
                <button
                  onClick={resetColWidths}
                  title="컬럼 너비 초기화"
                  className="text-[11px] text-slate-400 hover:text-slate-600 border border-slate-200 rounded px-2 py-0.5 hover:bg-slate-50 transition-colors"
                >
                  ↔ 너비 초기화
                </button>
                {currentMonthClosed && (
                  <span className="ml-auto text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 flex items-center gap-1">
                    <Lock className="h-3 w-3" />마감 확정 — 수정 차단 중 (월별 이력에서 해제 가능)
                  </span>
                )}
                {!username && !currentMonthClosed && (
                  <span className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />이름을 설정해야 입금 확인이 기록됩니다
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                {/* 컬럼 너비 드래그 조절: 헤더 오른쪽 경계를 드래그하세요 */}
                <table
                  className="text-sm"
                  style={{ tableLayout: "fixed", width: colWidths.reduce((a, b) => a + b, 0) }}
                >
                  <colgroup>
                    {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-800 text-white select-none">
                      <th
                        className="px-2 py-3 text-xs font-bold tracking-wide relative overflow-hidden align-middle"
                        style={{ width: colWidths[0] }}
                      >
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-500 accent-blue-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            checked={allVisibleSelected}
                            disabled={currentMonthClosed || sorted.length === 0}
                            onChange={toggleSelectAllVisible}
                            title="현재 목록 전체 선택"
                            aria-label="현재 목록 전체 선택"
                          />
                        </div>
                        <div
                          onMouseDown={(e) => startResize(e, 0)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize flex items-center justify-center group"
                          title="드래그하여 너비 조절"
                        >
                          <div className="w-0.5 h-4 bg-white/25 rounded-full group-hover:bg-white/70 transition-colors" />
                        </div>
                      </th>
                      {[
                        "거래처명", "신용건수", "요금", "탁송료",
                        "합계(부가포함)", "비고", "결제일", "입금확인", "",
                      ].map((label, idx) => (
                        <th
                          key={idx}
                          className="px-3 py-3 text-xs font-bold tracking-wide relative overflow-hidden"
                          style={{ width: colWidths[idx + 1] }}
                        >
                          <span className="block text-center truncate">{label}</span>
                          {idx < 8 && (
                            <div
                              onMouseDown={(e) => startResize(e, idx + 1)}
                              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize flex items-center justify-center group"
                              title="드래그하여 너비 조절"
                            >
                              <div className="w-0.5 h-4 bg-white/25 rounded-full group-hover:bg-white/70 transition-colors" />
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sorted.map((r) => {
                      const deliveryFee = r.delivery_fee ?? 0;
                      const grandTotal  = calcGrandTotal(r);
                      const isOverdue   = !r.checked && r.due_date && r.due_date < new Date().toISOString().slice(0, 10);
                      const isExpanded  = expandedId === r.id;
                      return (
                        <React.Fragment key={r.id}>
                        <tr className={`transition-colors ${r.checked ? "bg-green-100 border-l-4 border-l-green-600" : isOverdue ? "bg-red-50 hover:bg-red-100/60" : "hover:bg-slate-50"}`}>
                          <td className="px-2 py-3 text-center align-middle">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 accent-blue-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              checked={selectedArIds.has(r.id)}
                              disabled={currentMonthClosed}
                              onChange={() => toggleSelectRow(r.id)}
                              aria-label={`${r.client_name} 선택`}
                            />
                          </td>

                          {/* 거래처명 — 클릭 시 거래명세표 모달 열기 / ▶ 클릭 시 세부 내역 펼치기 */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {/* 펼치기 토글 */}
                              <button
                                onClick={() => toggleExpand(r)}
                                className="text-slate-400 hover:text-blue-500 transition-colors p-0.5 rounded"
                                title="세부 내역 펼치기"
                              >
                                <span className={`text-[10px] inline-block transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                              </button>
                              {/* 거래처명 → 거래명세표 모달 */}
                              <button
                                onClick={() => setSelectedRecord(r)}
                                className={`text-left font-bold hover:text-blue-600 hover:underline underline-offset-2 transition-colors ${r.checked ? "text-slate-400 line-through decoration-slate-300" : "text-slate-800"}`}
                                title="거래명세표 보기"
                              >
                                {r.client_name}
                              </button>
                            </div>
                            {r.client_biz_no && <div className="text-xs text-slate-400 mt-0.5 ml-5">{r.client_biz_no}</div>}
                          </td>

                          {/* 신용건수 */}
                          <td className="px-3 py-3 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                              {r.item_count ?? "-"}
                            </span>
                          </td>

                          {/* 요금 */}
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                            {r.total_amount.toLocaleString()}<span className="text-xs text-slate-400 ml-0.5">원</span>
                          </td>

                          {/* 탁송료 */}
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                            {deliveryFee > 0 ? <>{deliveryFee.toLocaleString()}<span className="text-xs text-slate-400 ml-0.5">원</span></> : <span className="text-slate-300">-</span>}
                          </td>

                          {/* 합계(부가포함) */}
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono font-black tabular-nums text-base ${r.checked ? "text-emerald-600" : isOverdue ? "text-red-600" : "text-slate-900"}`}>
                              {grandTotal.toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-400 ml-0.5">원</span>
                          </td>

                          {/* 비고 (빈칸) */}
                          <td className="px-4 py-3 text-xs text-slate-300"></td>

                          {/* 결제일 */}
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-mono ${isOverdue ? "text-red-600 font-bold" : "text-slate-500"}`}>
                              {r.due_date
                                ? r.due_date.match(/^\d{4}-\d{2}-(\d{2})$/)
                                  ? `${r.due_date.slice(5, 7)}/${r.due_date.slice(8, 10)}`
                                  : r.due_date
                                : "-"}
                            </span>
                            {isOverdue && <div className="text-[10px] text-red-500 font-semibold mt-0.5">연체</div>}
                          </td>

                          {/* 입금확인 체크박스 */}
                          <td className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <div
                                onClick={() => handleCheck(r)}
                                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${
                                  currentMonthClosed ? "opacity-40 cursor-not-allowed" :
                                  r.checked ? "bg-green-700 border-green-700 shadow-lg shadow-green-300" : "border-slate-300 bg-white hover:border-blue-400"
                                }`}
                              >
                                {r.checked && <CheckCircle className="h-4 w-4 text-white" />}
                                {currentMonthClosed && !r.checked && <Lock className="h-3 w-3 text-slate-400" />}
                              </div>
                              {r.checked && r.checked_by && (
                                <span className="text-[9px] text-green-700 font-bold leading-tight">{r.checked_by}</span>
                              )}
                            </div>
                          </td>

                          {/* 액션 버튼 */}
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-1.5">
                              {/* 명세서 보기 */}
                              <button
                                onClick={() => setSelectedRecord(r)}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                                title="거래명세표 보기"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>명세표</span>
                              </button>
                              {/* 메일 전송 */}
                              <button
                                onClick={() => setQuickMailRecord(r)}
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border font-semibold transition-colors ${
                                  r.contact_email
                                    ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                                    : "border-blue-300 text-blue-600 hover:bg-blue-50"
                                }`}
                                title={r.contact_email ? `메일전송: ${r.contact_email}` : "이메일 전송"}
                              >
                                <Mail className="h-3.5 w-3.5" />
                                <span>메일</span>
                              </button>
                              {/* 삭제 */}
                              <button
                                onClick={() => handleDelete(r.id)}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ── 세부 내역 서브행 ── */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="bg-blue-50/50 border-b border-blue-100 px-8 py-4">
                              <p className="text-xs font-bold text-blue-700 mb-2">
                                {r.client_name} · {filterMonth.split("-")[0]}년 {filterMonth.split("-")[1]}월 마감 내역
                              </p>
                              {!itemsCache[r.id] ? (
                                <p className="text-xs text-slate-400 animate-pulse">내역 로딩 중...</p>
                              ) : itemsCache[r.id].length === 0 ? (
                                <p className="text-xs text-slate-400">등록된 세부 내역이 없습니다.</p>
                              ) : (
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-blue-100 text-blue-800">
                                      <th className="text-left px-3 py-2 font-semibold rounded-l">날짜</th>
                                      <th className="text-left px-3 py-2 font-semibold">내용 / 구간</th>
                                      <th className="text-right px-3 py-2 font-semibold">요금</th>
                                      <th className="text-left px-3 py-2 font-semibold rounded-r">비고</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {itemsCache[r.id].map((item: any, i: number) => (
                                      <tr key={i} className={`${i % 2 === 0 ? "bg-white" : "bg-blue-50/30"}`}>
                                        <td className="px-3 py-1.5 text-slate-500 font-mono">{item.date}</td>
                                        <td className="px-3 py-1.5 text-slate-700">{item.description}</td>
                                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-slate-800">
                                          {(item.supply_amount ?? item.total_amount ?? 0).toLocaleString()}원
                                        </td>
                                        <td className="px-3 py-1.5 text-slate-400">{item.memo || ""}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-slate-100 font-bold text-slate-700 border-t border-slate-200">
                                      <td colSpan={2} className="px-3 py-2">소 계 ({itemsCache[r.id].length}건)</td>
                                      <td className="px-3 py-2 text-right font-mono text-blue-700">
                                        {itemsCache[r.id].reduce((s: number, it: any) => s + (it.supply_amount ?? it.total_amount ?? 0), 0).toLocaleString()}원
                                      </td>
                                      <td></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                      );
                    })}
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center py-16 text-slate-400">
                          <Upload className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                          {search ? `"${search}"에 해당하는 거래처가 없습니다.` : "등록된 신용내역이 없습니다."}
                          <br /><span className="text-xs mt-1 block">파일 업로드 또는 직접 등록 버튼을 사용하세요.</span>
                        </td>
                      </tr>
                    )}
                    {sorted.length > 0 && (() => {
                      const totalFee      = sorted.reduce((s, r) => s + r.total_amount, 0);
                      const totalDelivery = sorted.reduce((s, r) => s + (r.delivery_fee ?? 0), 0);
                      const totalGrand    = sorted.reduce((s, r) => s + calcGrandTotal(r), 0);
                      const totalPaid     = sorted.filter(r => r.checked).reduce((s, r) => s + calcGrandTotal(r), 0);
                      const totalUnpaid   = totalGrand - totalPaid;
                      return (
                        <tr className="bg-slate-800 text-white font-bold text-sm border-t-2 border-slate-600">
                          <td className="px-2 py-3" />
                          <td className="px-4 py-3">
                            합 계 <span className="font-normal text-xs text-slate-400 ml-1">{sorted.length}개 거래처</span>
                          </td>
                          <td className="px-3 py-3 text-center text-slate-300 text-xs">
                            {sorted.reduce((s, r) => s + (r.item_count ?? 0), 0)}건
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{totalFee.toLocaleString()}원</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300">{totalDelivery > 0 ? totalDelivery.toLocaleString() + "원" : "-"}</td>
                          <td className="px-4 py-3 text-right font-mono text-lg">{totalGrand.toLocaleString()}원</td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-center">
                            <div className="text-[10px] font-normal space-y-0.5">
                              <div className="text-emerald-400">입금 {totalPaid.toLocaleString()}원</div>
                              <div className="text-red-400">미수 {totalUnpaid.toLocaleString()}원</div>
                            </div>
                          </td>
                          <td className="px-3 py-3"></td>
                          <td className="px-2 py-3"></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {sorted.length > 0 && (
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-6 text-sm">
                  <span className="text-slate-500">전체 청구 <strong className="text-slate-800 font-mono">{filtered.reduce((s, r) => s + calcGrandTotal(r), 0).toLocaleString()}원</strong></span>
                  <span className="text-emerald-600">입금 완료 <strong className="font-mono">{filtered.filter((r) => r.checked).reduce((s, r) => s + calcGrandTotal(r), 0).toLocaleString()}원</strong></span>
                  <span className="text-red-600">미수금 <strong className="font-mono">{filtered.filter((r) => !r.checked).reduce((s, r) => s + calcGrandTotal(r), 0).toLocaleString()}원</strong></span>
                  <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
                    <Cloud className="h-3.5 w-3.5 text-emerald-400" />모든 데이터가 Firestore에 실시간 저장됩니다
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ 월별 이력 뷰 ══ */}
        {activeView === "history" && (
          <MonthlyHistory records={records} username={username} onSelectMonth={handleSelectMonth} />
        )}

        {/* ══ 거래처 정보 뷰 ══ */}
        {activeView === "clients" && <ClientProfilesPanel />}
      </div>

      {/* ── 거래명세서 모달 ── */}
      {selectedRecord && <StatementModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />}

      {/* ── 바로 메일 전송 패널 ── */}
      {quickMailRecord && (
        <QuickMailPanel record={quickMailRecord} onClose={() => setQuickMailRecord(null)} />
      )}

      {/* ── 입금확인 다이얼로그 ── */}
      {confirmCheckRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmCheck(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 아이콘 + 제목 */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                confirmCheckRecord.checked
                  ? "bg-red-100"
                  : "bg-green-100"
              }`}>
                <CheckCircle className={`h-8 w-8 ${
                  confirmCheckRecord.checked ? "text-red-500" : "text-green-600"
                }`} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {confirmCheckRecord.checked ? "입금확인 취소" : "입금처리"}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  <strong className="text-slate-700">{confirmCheckRecord.client_name}</strong>
                </p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {confirmCheckRecord.checked
                    ? "입금확인을 취소하시겠습니까?"
                    : "입금처리 하시겠습니까?"}
                </p>
                {!confirmCheckRecord.checked && (
                  <p className="text-xs text-slate-400 mt-1">
                    확인자: <strong className="text-slate-600">{username}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* 금액 요약 */}
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>청구금액 (VAT포함)</span>
                <span className="font-bold font-mono text-slate-800">
                  ₩ {calcGrandTotal(confirmCheckRecord).toLocaleString()}
                </span>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 text-slate-600 border-slate-300 hover:bg-slate-50"
                onClick={() => setConfirmCheck(null)}
              >
                아니오
              </Button>
              <Button
                className={`flex-1 font-bold text-white ${
                  confirmCheckRecord.checked
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-green-700 hover:bg-green-800"
                }`}
                onClick={() => doCheck(confirmCheckRecord)}
              >
                예
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* ── 사용자명 모달 ── */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { if (username) setShowUserModal(false); }}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><User className="h-5 w-5 text-blue-600" />담당자 이름 설정</h2>
              {username && <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>}
            </div>
            <div className="space-y-1.5 text-sm text-slate-500">
              <p>입금 확인 체크 시 <strong>이 이름</strong>과 <strong>시각</strong>이 자동 기록됩니다.</p>
              <div className="flex items-center gap-1.5 text-emerald-600 text-xs bg-emerald-50 rounded-lg px-3 py-2">
                <Cloud className="h-3.5 w-3.5" />
                이름은 <strong>이 브라우저 + Firestore</strong> 양쪽에 저장됩니다.
              </div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (usernameInput.trim()) { saveUsername(usernameInput); setShowUserModal(false); } }} className="flex gap-2">
              <input type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="예: 홍길동" autoFocus
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <Button type="submit" disabled={!usernameInput.trim()} className="bg-blue-600 hover:bg-blue-700">저장</Button>
            </form>
            {username && <p className="text-xs text-slate-400">현재: <strong className="text-slate-700">{username}</strong></p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 바로 메일 전송 패널 (PNG 캡처 후 즉시 전송)
// ══════════════════════════════════════════════════════════════
function QuickMailPanel({ record, onClose }: { record: ArRecord; onClose: () => void }) {
  const [items, setItems]     = useState<SettlementItem[]>([]);
  const [profile, setProfile] = useState<ModalClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<string[]>(
    record.contact_email ? record.contact_email.split(",").map(e => e.trim()).filter(Boolean) : []
  );
  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk]   = useState(false);
  const [sentErr, setSentErr] = useState("");
  const docRef = useRef<HTMLDivElement>(null);

  // 아이템 + 프로필 로드
  useEffect(() => {
    const qItems = query(collection(db, "ar_records", record.id, "items"), orderBy("date", "asc"));
    const unsub = onSnapshot(qItems, (snap) => {
      const rows: SettlementItem[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SettlementItem, "id">) }))
        .sort((a, b) => (a.date || "") < (b.date || "") ? -1 : (a.date || "") > (b.date || "") ? 1 : 0);
      setItems(rows.length > 0 ? rows : [{
        date: `${record.billing_month}-01`,
        description: `${record.billing_month} 화물 운송비`,
        quantity: 1, unit_price: record.total_amount,
        supply_amount: record.total_amount, tax_amount: 0,
        total_amount: record.total_amount, memo: "",
      }]);
      setLoading(false);
    });
    // 프로필 로드 (이름 정규화 일치) → 이메일 수신인 자동 적용
    const key = normalizeCreditNameForLink(record.client_name);
    const unsubProf = onSnapshot(
      collection(db, "client_profiles"),
      (snap) => {
        const doc = snap.docs.find(
          (d) => normalizeCreditNameForLink(String((d.data().name as string) ?? "")) === key
        );
        if (doc) {
          const p = { id: doc.id, ...doc.data() } as ModalClientProfile;
          setProfile(p);
          if (p.email?.trim()) {
            const profEmails = p.email.split(",").map((e: string) => e.trim()).filter(Boolean);
            setRecipients((prev) => Array.from(new Set([...prev, ...profEmails])));
          }
        } else {
          setProfile(null);
        }
      },
      () => setProfile(null)
    );
    return () => {
      unsub();
      unsubProf();
    };
  }, [record]);

  const addRecipient = () => {
    const emails = emailInput.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
    setRecipients(prev => Array.from(new Set([...prev, ...emails])));
    setEmailInput("");
  };

  const handleSend = async () => {
    if (recipients.length === 0) { alert("수신인 이메일을 입력하세요."); return; }
    if (!docRef.current || loading) { alert("명세표 로딩 중입니다. 잠시 후 시도해주세요."); return; }
    setSending(true);
    setSentErr("");
    try {
      const canvas = await captureStatementToCanvas(docRef.current, { scale: 2 });
      const imageBase64 = canvas.toDataURL("image/png", 0.92);
      // 수신인 Firestore 저장
      await updateDoc(doc(db, "ar_records", record.id), { contact_email: recipients.join(", ") });
      const supplyTotal = record.total_amount;
      const vatTotal = Math.round(supplyTotal * VAT_RATE);
      for (const to of recipients) {
        const resp = await fetch("/api/sendMail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to, clientName: record.client_name, billingMonth: record.billing_month,
            imageBase64, items, supplyTotal, taxTotal: vatTotal, grandTotal: supplyTotal + vatTotal,
            supplierName: SUPPLIER.name, supplierPhone: SUPPLIER.phone, supplierEmail: SUPPLIER.email,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`${to}: ${data.error ?? "발송 오류"}`);
      }
      setSentOk(true);
      setTimeout(() => { setSentOk(false); onClose(); }, 2000);
    } catch (e: unknown) {
      setSentErr(`발송 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-blue-50">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              거래명세표 이메일 전송
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{record.client_name} · {record.billing_month}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4">
          {/* 수신인 배지 */}
          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipients.map((email) => (
                <span key={email} className="flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                  {email}
                  <button onClick={() => setRecipients(prev => prev.filter(e => e !== email))} className="hover:text-red-600 ml-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 이메일 입력 */}
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="이메일 주소 (여러 개 시 쉼표 구분)"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
            />
            <Button variant="outline" size="sm" onClick={addRecipient} disabled={!emailInput.trim()}>추가</Button>
          </div>

          {/* 상태 메시지 */}
          {loading && <p className="text-xs text-slate-400 animate-pulse">명세표 데이터 로딩 중...</p>}
          {sentOk && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle className="h-4 w-4" />전송 완료! 창을 닫습니다.
            </div>
          )}
          {sentErr && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4" />{sentErr}
            </div>
          )}

          {/* 전송 버튼 */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button
              onClick={handleSend}
              disabled={sending || loading || recipients.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              {sending
                ? <><Loader2 className="h-4 w-4 animate-spin" />PNG 생성 후 전송 중...</>
                : <><Send className="h-4 w-4" />PNG 생성 후 전송</>}
            </Button>
          </div>
        </div>
      </div>

      {/* 화면 밖에 렌더링되는 DocumentBody (html2canvas 캡처용) */}
      {!loading && (
        <div style={{ position: "fixed", top: "-9999px", left: "-9999px", zIndex: -1 }}>
          <DocumentBody ref={docRef} record={record} items={items} profile={profile} />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 거래처 정보 관리 패널
// ══════════════════════════════════════════════════════════════
const EMPTY_PROFILE: Omit<ClientProfile, "id"> = {
  name: "", biz_no: "", ceo_name: "", address: "",
  phone: "", email: "", business_type: "", business_item: "", template: "basic",
};

function ClientProfilesPanel() {
  const [profiles, setProfiles] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClientProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<ClientProfile, "id">>(EMPTY_PROFILE);

  useEffect(() => {
    const q = query(collection(db, "client_profiles"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      setProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClientProfile)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const openNew = () => {
    setForm(EMPTY_PROFILE);
    setIsNew(true);
    setEditing({} as ClientProfile);
  };

  const openEdit = (p: ClientProfile) => {
    setForm({ name: p.name, biz_no: p.biz_no, ceo_name: p.ceo_name, address: p.address,
               phone: p.phone, email: p.email, business_type: p.business_type,
               business_item: p.business_item, template: p.template });
    setIsNew(false);
    setEditing(p);
  };

  const handleSave = async () => {
    const nameNorm = normalizeCreditNameForLink(form.name);
    if (!nameNorm) { alert("거래처명을 입력하세요."); return; }
    setSaving(true);
    try {
      const payload = { ...form, name: nameNorm };
      if (isNew) {
        await addDoc(collection(db, "client_profiles"), payload);
      } else if (editing?.id) {
        await setDoc(doc(db, "client_profiles", editing.id), payload, { merge: true });
      }

      // 이메일이 있으면 신용내역(ar_records) 중 같은 거래처명인 항목에 contact_email 자동 동기화
      if (form.email?.trim()) {
        const snap = await getDocs(
          query(collection(db, "ar_records"), where("client_name", "==", nameNorm))
        );
        const batch = writeBatch(db);
        snap.docs.forEach((d) => {
          if (!d.data().contact_email) {   // 이미 직접 입력한 이메일이 있으면 덮어쓰지 않음
            batch.update(d.ref, { contact_email: form.email.trim() });
          }
        });
        await batch.commit();
      }

      setEditing(null);
    } catch (e) {
      alert("저장 실패: " + (e as Error).message);
    }
    setSaving(false);
  };

  const handleDelete = async (p: ClientProfile) => {
    if (!window.confirm(`"${p.name}" 거래처 정보를 삭제하시겠습니까?`)) return;
    if (p.id) await deleteDoc(doc(db, "client_profiles", p.id));
  };

  const field = (label: string, key: keyof Omit<ClientProfile, "id" | "template">) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={label}
      />
    </div>
  );

  if (editing !== null) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            {isNew ? "새 거래처 추가" : `"${editing.name}" 정보 수정`}
          </h2>
          <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field("거래처명 (상호)", "name")}
          {field("사업자등록번호", "biz_no")}
          {field("대표자명", "ceo_name")}
          {field("사업장주소", "address")}
          {field("전화번호", "phone")}
          {field("이메일", "email")}
          {field("업태", "business_type")}
          {field("종목", "business_item")}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">거래명세표 양식</label>
            <select
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={form.template}
              onChange={(e) => setForm((f) => ({ ...f, template: e.target.value as TemplateType }))}
            >
              {(Object.entries(TEMPLATE_LABELS) as [TemplateType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setEditing(null)}>취소</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            저장
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          거래처 정보 관리
          <span className="text-sm font-normal text-slate-400">({profiles.length}개)</span>
        </h2>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />새 거래처 추가
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">등록된 거래처 정보가 없습니다.</p>
          <p className="text-xs mt-1">"새 거래처 추가" 버튼으로 공급받는자 정보를 등록하세요.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wide">
                <th className="px-3 py-2 text-left border border-slate-100">거래처명</th>
                <th className="px-3 py-2 text-left border border-slate-100">등록번호</th>
                <th className="px-3 py-2 text-left border border-slate-100">대표자</th>
                <th className="px-3 py-2 text-left border border-slate-100">주소</th>
                <th className="px-3 py-2 text-left border border-slate-100">전화</th>
                <th className="px-3 py-2 text-left border border-slate-100">이메일</th>
                <th className="px-3 py-2 text-center border border-slate-100">양식</th>
                <th className="px-3 py-2 text-center border border-slate-100">관리</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-blue-50 transition-colors border-b border-slate-100">
                  <td className="px-3 py-2 font-semibold text-slate-800">{p.name}</td>
                  <td className="px-3 py-2 text-slate-600 font-mono text-xs">{p.biz_no || "-"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.ceo_name || "-"}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs max-w-[160px] truncate">{p.address || "-"}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{p.phone || "-"}</td>
                  <td className="px-3 py-2 text-xs max-w-[180px]">
                    {p.email ? (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{p.email}</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {TEMPLATE_LABELS[p.template] || "기본양식"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
        * 엑셀에 나온 거래처명과 거래처 정보의 상호가 같으면(띄어쓰기만 다른 경우 포함) 공급받는자란에 등록 정보가 자동 반영됩니다.
      </p>
    </div>
  );
}
