import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch, getDocs,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  ArrowLeft, Upload, Plus, Trash2, CheckCircle, AlertCircle, Clock,
  User, X, FileText, AlertTriangle, Scissors, RotateCcw, Save,
  Search, Lock, History, CreditCard, Cloud, CloudOff, Loader2,
} from "lucide-react";

import { parseFile, ColKey, ParseResult } from "../utils/sheetParser";
import {
  detectAllAliases, applyEntitySplit, aggregateToRecords,
  SplitRule, AggregatedRecord, SplitRow,
} from "../utils/entitySplitter";
import { useStaffProfile } from "../hooks/useStaffProfile";
import MonthlyHistory, { useMonthClosures } from "../components/settlement/MonthlyHistory";
import StatementModal from "../components/settlement/StatementModal";

// ─────────────────────────────────────────────────────────────
// 타입 & 상수
// ─────────────────────────────────────────────────────────────
type RecordStatus = "unpaid" | "partial" | "paid";
type PageView = "credits" | "history";

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
  created_at?: any;
  updated_at?: any;
}

const COL_LABEL: Record<ColKey, string> = {
  date: "날짜", client: "거래처명", amount: "금액",
  memo: "비고", bizno: "사업자번호", duedate: "지급기한",
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtDateTime(iso: string) { return iso.slice(0, 16).replace("T", " "); }

// ─────────────────────────────────────────────────────────────
// 전광판 (ScoreBoard)
// ─────────────────────────────────────────────────────────────
function ScoreBoard({ records, month, isClosed }: { records: ArRecord[]; month: string; isClosed: boolean }) {
  const confirmed   = records.filter((r) => r.checked);
  const unconfirmed = records.filter((r) => !r.checked);
  const confirmedAmt   = confirmed.reduce((s, r) => s + r.total_amount, 0);
  const unconfirmedAmt = unconfirmed.reduce((s, r) => s + r.total_amount, 0);
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
              {unconfirmed.sort((a, b) => b.total_amount - a.total_amount).map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 font-semibold">
                  {r.client_name}<span className="text-red-400">|</span>
                  <span className="font-mono">{r.total_amount.toLocaleString()}원</span>
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
  const REQUIRED: ColKey[] = ["date", "client", "amount"];
  const OPTIONAL: ColKey[] = ["bizno", "duedate", "memo"];
  const effectiveIdx = (key: ColKey) => overrides[key] !== undefined ? overrides[key]! : result.detectedIdx[key];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
      <p className="text-sm font-bold text-slate-700">컬럼 매핑 확인</p>
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
  onChangeAmount: (i: number, f: "total_amount" | "paid_amount", v: number) => void;
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
              <TableHead>거래처명</TableHead><TableHead className="text-center">건수</TableHead>
              <TableHead className="text-right">청구금액</TableHead><TableHead className="text-right">입금금액</TableHead>
              <TableHead className="text-right">미수금</TableHead><TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r, i) => (
              <TableRow key={i} className={r.split_from ? "bg-orange-50" : ""}>
                <TableCell className="font-semibold">{r.client_name}{r.split_from && <span className="ml-1.5 text-[10px] text-orange-500">← {r.split_from}</span>}</TableCell>
                <TableCell className="text-center text-xs text-slate-400">{r.row_count}</TableCell>
                <TableCell className="text-right"><input type="number" value={r.total_amount} onChange={(e) => onChangeAmount(i, "total_amount", Number(e.target.value))} className="w-28 text-right text-sm border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400" /></TableCell>
                <TableCell className="text-right"><input type="number" value={r.paid_amount} onChange={(e) => onChangeAmount(i, "paid_amount", Number(e.target.value))} className="w-24 text-right text-sm border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400" /></TableCell>
                <TableCell className={`text-right font-bold text-sm ${r.unpaid_amount > 0 ? "text-red-600" : "text-slate-400"}`}>{r.unpaid_amount.toLocaleString()}원</TableCell>
                <TableCell><button onClick={() => onRemove(i)} className="text-slate-300 hover:text-red-500 p-1"><X className="h-3.5 w-3.5" /></button></TableCell>
              </TableRow>
            ))}
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

  const handleFiles = async (incoming: File[]) => {
    setParsing(true); setErr(""); setSaved(false);
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
    const patched = currentResult.rows.map((row) => {
      const get = (key: ColKey) => { const i = patchedIdx[key]; return i !== -1 ? (row._original[headers[i]] ?? "") : ""; };
      return { ...row, clientName: String(get("client")).trim() || row.clientName, amount: Number(String(get("amount")).replace(/[^0-9.-]/g, "")) || row.amount };
    });
    const split = applyEntitySplit(patched, splitRules);
    setSplitRows(split);
    setPreview(aggregateToRecords(split, billingMonth));
  }, [currentResult, colOverrides, splitRules, billingMonth]);

  useEffect(() => {
    if (!currentResult) return;
    const aliases = detectAllAliases(currentResult.rows);
    setSplitR((prev) => {
      const existing = new Map(prev.map((r) => [r.keyword, r]));
      return aliases.map((kw) => existing.get(kw) ?? { keyword: kw, enabled: false, amountMode: "full" as const });
    });
  }, [currentResult]);

  const handleSave = async () => {
    if (!preview.length) return;
    setSaving(true); setSaveErr("");
    try {
      const batch = writeBatch(db);
      const srcFile = currentResult?.fileName ?? "";

      preview.forEach((aggregated) => {
        const arRef = doc(collection(db, "ar_records"));
        batch.set(arRef, {
          ...aggregated,
          checked: false,
          source_file: srcFile,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        // 세부 거래 내역 (items 서브컬렉션)
        const matching = splitRows.filter((row) => {
          const rowMonth = (row.date ?? "").slice(0, 7) || billingMonth;
          return (
            rowMonth === aggregated.billing_month &&
            row.clientName.trim() === aggregated.client_name.trim()
          );
        });

        // matching이 없을 경우 집계 단일 행 저장
        const rowsToSave = matching.length > 0
          ? matching
          : [{ date: `${aggregated.billing_month}-01`, memo: "", amount: aggregated.total_amount, clientName: aggregated.client_name }];

        rowsToSave.forEach((row) => {
          batch.set(doc(collection(db, "ar_records", arRef.id, "items")), {
            date:           row.date || `${aggregated.billing_month}-01`,
            description:    row.memo || `${aggregated.billing_month} 화물 운송비`,
            quantity:       1,
            unit_price:     row.amount,
            supply_amount:  row.amount,
            tax_amount:     0,
            total_amount:   row.amount,
            memo:           row.memo || "",
            created_at:     serverTimestamp(),
          });
        });
      });

      await batch.commit();
      setSaved(true);
      onSaved(billingMonth);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveErr(`저장 실패: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeAmount = (idx: number, field: "total_amount" | "paid_amount", val: number) => {
    setPreview((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [field]: val };
      next.unpaid_amount = Math.max(0, next.total_amount - next.paid_amount);
      if (next.paid_amount >= next.total_amount && next.total_amount > 0) next.status = "paid";
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
          <span className="flex items-center gap-1.5 bg-blue-100 text-blue-700 rounded-full px-3 py-1"><strong>{currentResult.rows.length}행</strong> 인식</span>
          {currentResult.warnings.map((w, i) => (
            <span key={i} className="flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-3 py-1 text-xs"><AlertTriangle className="h-3 w-3" />{w}</span>
          ))}
        </div>
        <ColumnMappingPanel result={currentResult} overrides={colOverrides} onOverride={(key, idx) => setColOv((p) => ({ ...p, [key]: idx }))} />
        <SplitRulesPanel rules={splitRules} onChange={setSplitR} />
        {preview.length > 0 && (
          <PreviewTable records={preview} billingMonth={billingMonth} onChangeBillingMonth={setBM}
            onChangeAmount={handleChangeAmount} onRemove={(idx) => setPreview((p) => p.filter((_, i) => i !== idx))} />
        )}
        {preview.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {saved ? (
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                  <CheckCircle className="h-5 w-5" />{preview.length}개 거래처 저장 완료! → 목록에서 확인하세요.
                </div>
              ) : (
                <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold gap-2">
                  <Save className="h-4 w-4" />{saving ? "저장 중..." : `${preview.length}건 저장`}
                </Button>
              )}
              <p className="text-xs text-slate-400">저장 후 목록에서 수정·삭제 가능합니다.</p>
            </div>
            {saveError && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />{saveError}
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
    if (!form.client_name.trim()) { setErr("거래처명을 입력하세요."); return; }
    const total = Number(form.total_amount.replace(/[^0-9.-]/g, "")) || 0;
    const paid  = Number(form.paid_amount.replace(/[^0-9.-]/g, ""))  || 0;
    const unpaid = Math.max(0, total - paid);
    let status: RecordStatus = "unpaid";
    if (paid >= total && total > 0) status = "paid";
    else if (paid > 0) status = "partial";
    await addDoc(collection(db, "ar_records"), {
      billing_month: form.billing_month, client_name: form.client_name.trim(),
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

  // 세부 내역 확장
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsCache, setItemsCache] = useState<Record<string, any[]>>({});

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
    [...filtered].sort((a, b) => { if (a.checked !== b.checked) return a.checked ? 1 : -1; return b.total_amount - a.total_amount; }),
    [filtered]
  );

  // 입금 확인 체크박스 — 마감 확정 달은 차단
  const handleCheck = async (r: ArRecord) => {
    if (currentMonthClosed) {
      alert(`${filterMonth}은 마감 확정된 달입니다.\n월별 이력 탭에서 마감을 해제한 후 수정하세요.`);
      return;
    }
    if (!username) { setShowUserModal(true); return; }
    const next = !r.checked;
    await updateDoc(doc(db, "ar_records", r.id), {
      checked:       next,
      checked_by:    next ? username : null,
      checked_at:    next ? new Date().toISOString() : null,
      paid_amount:   next ? r.total_amount : 0,
      unpaid_amount: next ? 0 : r.total_amount,
      status:        next ? "paid" : "unpaid",
      updated_at:    serverTimestamp(),
    });
  };

  const handleDelete = async (id: string) => {
    if (currentMonthClosed) { alert("마감 확정된 달의 데이터는 삭제할 수 없습니다."); return; }
    if (!window.confirm("이 항목을 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "ar_records", id));
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
              {!currentMonthClosed && (
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setUpload((v) => !v); setAdd(false); }}>
                    <Upload className="h-4 w-4" />{showUpload ? "닫기" : "파일 업로드"}
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => { setAdd((v) => !v); setUpload(false); }}>
                    <Plus className="h-4 w-4" />직접 등록
                  </Button>
                </div>
              )}
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
                <h2 className="font-bold text-slate-800">
                  {filterMonth} 신용내역
                  {search && <span className="ml-2 text-sm text-blue-600 font-normal">"{search}" 검색 중</span>}
                </h2>
                <span className="text-sm text-slate-400">{filtered.length}개 거래처</span>
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-14">입금 확인</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">거래처명</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">청구금액</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">확인자 / 시각</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">비고</th>
                      <th className="text-center px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-14">내역</th>
                      <th className="w-10 px-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sorted.map((r) => {
                      const isOverdue = !r.checked && r.due_date && r.due_date < new Date().toISOString().slice(0, 10);
                      return (
                        <React.Fragment key={r.id}>
                        <tr className={`transition-colors ${r.checked ? "bg-emerald-50/60 text-slate-400" : isOverdue ? "bg-red-50 hover:bg-red-100/70" : "hover:bg-slate-50"}`}>
                          <td className="px-4 py-3">
                            <div
                              onClick={() => handleCheck(r)}
                              className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${
                                currentMonthClosed ? "opacity-40 cursor-not-allowed" :
                                r.checked ? "bg-emerald-500 border-emerald-500 shadow-md shadow-emerald-200" : "border-slate-300 bg-white hover:border-blue-400"
                              }`}
                            >
                              {r.checked && <CheckCircle className="h-4 w-4 text-white" />}
                              {currentMonthClosed && !r.checked && <Lock className="h-3 w-3 text-slate-400" />}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setSelectedRecord(r)}
                              className={`text-left group font-semibold hover:underline hover:text-blue-600 transition-colors ${r.checked ? "text-slate-400 line-through decoration-slate-300" : "text-slate-800"}`}
                              title="클릭 → 거래명세서">
                              {r.client_name}
                              <span className="ml-1.5 text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity font-normal no-underline">명세서▶</span>
                            </button>
                            {r.client_biz_no && <div className="text-xs text-slate-400 mt-0.5">{r.client_biz_no}</div>}
                            {r.split_from && <div className="text-[10px] text-orange-500 mt-0.5">← {r.split_from}</div>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono font-bold tabular-nums ${r.checked ? "text-slate-400" : "text-slate-800"}`}>{r.total_amount.toLocaleString()}</span>
                            <span className="text-xs text-slate-400 ml-0.5">원</span>
                          </td>
                          <td className="px-4 py-3">
                            {r.checked && r.checked_by ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-xs"><User className="h-3 w-3" />{r.checked_by}</div>
                                {r.checked_at && <div className="text-[11px] text-slate-400 font-mono">{fmtDateTime(r.checked_at)}</div>}
                              </div>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium ${isOverdue ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400"}`}>
                                {isOverdue ? <><AlertCircle className="h-3 w-3" />연체</> : "미확인"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {r.checked ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1"><CheckCircle className="h-3 w-3" />입금완료</Badge>
                              : isOverdue ? <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1"><AlertCircle className="h-3 w-3" />연체</Badge>
                              : <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 gap-1"><Clock className="h-3 w-3" />미납</Badge>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 truncate max-w-[112px]">{r.memo || "-"}</td>
                          {/* 세부 내역 펼치기 버튼 */}
                          <td className="px-2 py-3 text-center">
                            <button
                              onClick={() => toggleExpand(r)}
                              className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${
                                expandedId === r.id
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "text-slate-400 border-slate-200 hover:border-blue-400 hover:text-blue-500"
                              }`}
                              title="세부 거래 내역 펼치기"
                            >
                              {expandedId === r.id ? "▲" : "▼"}
                            </button>
                          </td>
                          <td className="px-2 py-3">
                            <button onClick={() => handleDelete(r.id)} className="text-slate-200 hover:text-red-500 transition-colors p-1 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                          </td>
                        </tr>
                        {/* ── 세부 내역 서브행 ── */}
                        {expandedId === r.id && (
                          <tr>
                            <td colSpan={9} className="bg-slate-50 border-b border-slate-100 px-6 py-3">
                              {!itemsCache[r.id] ? (
                                <p className="text-xs text-slate-400 animate-pulse">내역 로딩 중...</p>
                              ) : itemsCache[r.id].length === 0 ? (
                                <p className="text-xs text-slate-400">등록된 세부 내역이 없습니다.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-200">
                                      <th className="text-left pb-1.5 pr-4 font-semibold">날짜</th>
                                      <th className="text-left pb-1.5 pr-4 font-semibold">내용</th>
                                      <th className="text-right pb-1.5 pr-4 font-semibold">금액</th>
                                      <th className="text-left pb-1.5 font-semibold">비고</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {itemsCache[r.id].map((item: any, i: number) => (
                                      <tr key={i} className="border-b border-slate-100 last:border-0">
                                        <td className="py-1.5 pr-4 text-slate-500 font-mono">{item.date}</td>
                                        <td className="py-1.5 pr-4 text-slate-700">{item.description}</td>
                                        <td className="py-1.5 pr-4 text-right font-mono font-semibold text-slate-800">
                                          {(item.supply_amount ?? item.total_amount ?? 0).toLocaleString()}원
                                        </td>
                                        <td className="py-1.5 text-slate-400">{item.memo || "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t border-slate-300 font-bold text-slate-700">
                                      <td colSpan={2} className="pt-2 pr-4">소계</td>
                                      <td className="pt-2 pr-4 text-right font-mono">
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
                        <td colSpan={9} className="text-center py-16 text-slate-400">
                          <Upload className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                          {search ? `"${search}"에 해당하는 거래처가 없습니다.` : "등록된 신용내역이 없습니다."}
                          <br /><span className="text-xs mt-1 block">파일 업로드 또는 직접 등록 버튼을 사용하세요.</span>
                        </td>
                      </tr>
                    )}
                    {sorted.length > 0 && (() => {
                      const totalAll     = sorted.reduce((s, r) => s + r.total_amount, 0);
                      const totalPaid    = sorted.filter(r => r.checked).reduce((s, r) => s + r.total_amount, 0);
                      const totalUnpaid  = sorted.filter(r => !r.checked).reduce((s, r) => s + r.total_amount, 0);
                      return (
                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-sm">
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-slate-700">
                            합 계 <span className="font-normal text-xs text-slate-400 ml-1">{sorted.length}개 거래처</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-mono text-slate-800">{totalAll.toLocaleString()}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></div>
                            <div className="text-[11px] font-normal mt-0.5 space-x-2">
                              <span className="text-emerald-600">입금 {totalPaid.toLocaleString()}원</span>
                              <span className="text-red-500">미수 {totalUnpaid.toLocaleString()}원</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3"></td>
                          <td className="px-2 py-3"></td>
                          <td className="px-2 py-3"></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {sorted.length > 0 && (
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-6 text-sm">
                  <span className="text-slate-500">전체 청구 <strong className="text-slate-800 font-mono">{filtered.reduce((s, r) => s + r.total_amount, 0).toLocaleString()}원</strong></span>
                  <span className="text-emerald-600">입금 완료 <strong className="font-mono">{filtered.filter((r) => r.checked).reduce((s, r) => s + r.total_amount, 0).toLocaleString()}원</strong></span>
                  <span className="text-red-600">미수금 <strong className="font-mono">{filtered.filter((r) => !r.checked).reduce((s, r) => s + r.total_amount, 0).toLocaleString()}원</strong></span>
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
      </div>

      {/* ── 거래명세서 모달 ── */}
      {selectedRecord && <StatementModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />}

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
