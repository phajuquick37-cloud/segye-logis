import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import {
  collection, onSnapshot, orderBy, query, updateDoc, doc,
} from "firebase/firestore";
import {
  matchClientProfileToAggregated,
  normalizeCreditNameForLink,
} from "../../utils/sheetParser";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { captureStatementToCanvas } from "../../utils/statementCapture";
import { X, Download, Mail, FileSpreadsheet, Printer, CheckCircle, AlertTriangle, Loader2, ImageIcon, Send } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { SUPPLIER, statementSupplyVatGrand } from "../../config/companyInfo";
import { postStatementMail, type MailSendReportLine } from "../../utils/mailClient";
import type { SettlementItem, StatementArRecord, StatementClientProfile } from "../../types/statement";
import {
  excelStatementGreeting,
  resolveStatementTemplate,
} from "../../utils/statementTemplates";

export type { SettlementItem };
export type ArRecord = StatementArRecord;
export type ClientProfile = StatementClientProfile;

// ─────────────────────────────────────────────────────────────
// 숫자 → 한글 금액
// ─────────────────────────────────────────────────────────────
function toKoreanAmount(n: number): string {
  if (n === 0) return "영원";
  const units  = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const places = ["", "십", "백", "천"];
  const groups = ["", "만", "억", "조"];
  let result = "";
  const chunks: number[] = [];
  let num = Math.abs(Math.round(n));
  while (num > 0) { chunks.push(num % 10000); num = Math.floor(num / 10000); }
  chunks.forEach((chunk, gi) => {
    if (chunk === 0) return;
    let part = "";
    let c = chunk;
    for (let p = 0; c > 0; p++) {
      const d = c % 10;
      if (d !== 0) part = units[d] + places[p] + part;
      c = Math.floor(c / 10);
    }
    result = part + groups[gi] + result;
  });
  return result + "원정";
}

// ─────────────────────────────────────────────────────────────
// 날짜 범위 (마감월의 첫날~마지막날)
// ─────────────────────────────────────────────────────────────
function monthDateRange(billingMonth: string): string {
  const [y, m] = billingMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${billingMonth}-01 ~ ${billingMonth}-${String(lastDay).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────
// 도장 이미지
// ─────────────────────────────────────────────────────────────
function CompanyStamp({ size = 72 }: { size?: number }) {
  return (
    <img
      src="/stamp.png"
      alt="인"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", opacity: 0.88, mixBlendMode: "multiply" }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// 세로 텍스트 셀 (공급자 / 공급받는자)
// ─────────────────────────────────────────────────────────────
function VerticalLabel({ text }: { text: string }) {
  return (
    <td
      rowSpan={6}
      style={{
        border: "1px solid #555",
        width: "20px",
        textAlign: "center",
        verticalAlign: "middle",
        fontSize: "10px",
        fontWeight: "bold",
        writingMode: "vertical-rl",
        letterSpacing: "4px",
        padding: "4px 2px",
        backgroundColor: "#f0f0f0",
      }}
    >
      {text}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────
// 거래명세표 본문 (인쇄/캡처 대상)
// ─────────────────────────────────────────────────────────────
export const DocumentBody = React.forwardRef<
  HTMLDivElement,
  { record: ArRecord; items: SettlementItem[]; profile?: ClientProfile | null }
>(({ record, items, profile }, ref) => {
  const { supplyBase: supplyTotal, vatTotal, grandTotal } = statementSupplyVatGrand(record);
  const dateRange   = monthDateRange(record.billing_month);
  const tmpl = resolveStatementTemplate(record.client_name, profile ?? null);
  const colCount = tmpl.cols.length;
  const ti = tmpl.totalColumnIndex;
  const headerBg = tmpl.headerTone === "gray" ? "#6b7280" : "#2c3e50";

  const cellStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    border: "1px solid #555",
    padding: "3px 6px",
    fontSize: "11px",
    ...extra,
  });
  const labelCell: React.CSSProperties = {
    ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", whiteSpace: "nowrap", width: "80px" }),
  };

  return (
    <div
      ref={ref}
      style={{
        width: "794px",
        background: "#fff",
        padding: "24px 28px",
        fontFamily: "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif",
        color: "#111",
        boxSizing: "border-box",
      }}
    >
      {/* ── 제목 ── */}
      <div style={{ textAlign: "center", marginBottom: "4px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: "900", letterSpacing: "14px", margin: 0 }}>
          거&nbsp;&nbsp;래&nbsp;&nbsp;명&nbsp;&nbsp;세&nbsp;&nbsp;표
        </h1>
        <p style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>{dateRange}</p>
      </div>

      {/* ── 공급자 / 공급받는자 ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0", fontSize: "11px" }}>
        <tbody>
          <tr>
            {/* 공급자 — 도장은 테이블 바깥 절대 위치(우측 하단)로 배치 */}
            <td style={{ width: "50%", verticalAlign: "top", padding: 0, position: "relative", border: "1px solid #555" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <VerticalLabel text="공급자" />
                    <td style={labelCell}>등&nbsp;록&nbsp;번&nbsp;호</td>
                    <td colSpan={3} style={cellStyle({ fontWeight: "bold", letterSpacing: "2px" })}>
                      {SUPPLIER.biz_no}
                    </td>
                  </tr>
                  <tr>
                    <td style={labelCell}>상호(법인명)</td>
                    <td style={cellStyle({ fontWeight: "bold" })}>{SUPPLIER.name}</td>
                    <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", width: "30px" }) }}>성명</td>
                    <td style={cellStyle({ fontWeight: "500" })}>{SUPPLIER.representative}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>사업장주소</td>
                    <td colSpan={3} style={cellStyle()}>{SUPPLIER.address}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>업&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;태</td>
                    <td style={cellStyle()}>{SUPPLIER.business_type}</td>
                    <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", width: "30px" }) }}>종목</td>
                    <td style={cellStyle()}>{SUPPLIER.business_item}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>전&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;화</td>
                    <td colSpan={3} style={cellStyle()}>{SUPPLIER.phone}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>E-mail</td>
                    <td colSpan={3} style={cellStyle()}>{SUPPLIER.email}</td>
                  </tr>
                </tbody>
              </table>
              {/* 도장: 공급자 칸 우측 하단에 절대 배치 */}
              <div style={{
                position: "absolute",
                bottom: "4px",
                right: "6px",
                zIndex: 2,
                pointerEvents: "none",
              }}>
                <CompanyStamp size={72} />
              </div>
            </td>

            {/* 공급받는자 (저장된 프로필 사용) */}
            <td style={{ width: "50%", verticalAlign: "top", padding: 0, border: "1px solid #555", borderLeft: "2px solid #555" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <VerticalLabel text="공급받는자" />
                    <td style={labelCell}>등&nbsp;록&nbsp;번&nbsp;호</td>
                    <td colSpan={3} style={cellStyle({ fontWeight: "bold", letterSpacing: "2px" })}>
                      {profile?.biz_no || record.client_biz_no || "\u00A0"}
                    </td>
                  </tr>
                  <tr>
                    <td style={labelCell}>상호(법인명)</td>
                    <td style={cellStyle({ fontWeight: "bold" })}>
                      {(profile?.name || "").trim() || record.client_name}
                    </td>
                    <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", width: "30px" }) }}>성명</td>
                    <td style={cellStyle()}>{profile?.ceo_name || "\u00A0"}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>사업장주소</td>
                    <td colSpan={3} style={cellStyle()}>{profile?.address || "\u00A0"}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>업&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;태</td>
                    <td style={cellStyle()}>{profile?.business_type || "\u00A0"}</td>
                    <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", width: "30px" }) }}>종목</td>
                    <td style={cellStyle()}>{profile?.business_item || "\u00A0"}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>전&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;화</td>
                    <td colSpan={3} style={cellStyle()}>{profile?.phone || "\u00A0"}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>E-mail</td>
                    <td colSpan={3} style={cellStyle()}>{profile?.email || "\u00A0"}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── 공급가액 / VAT / 합계 ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "0" }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", width: "70px", textAlign: "center" }) }}>
              공&nbsp;급&nbsp;가&nbsp;액
            </td>
            <td style={{ ...cellStyle({ fontWeight: "bold", width: "140px", textAlign: "right", fontFamily: "monospace" }) }}>
              {supplyTotal.toLocaleString()}&nbsp;원&nbsp;정
            </td>
            <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", width: "50px", textAlign: "center" }) }}>
              VAT&nbsp;:
            </td>
            <td style={{ ...cellStyle({ fontWeight: "bold", width: "120px", textAlign: "right", fontFamily: "monospace" }) }}>
              {vatTotal.toLocaleString()}&nbsp;원&nbsp;정
            </td>
          </tr>
          <tr>
            <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", textAlign: "center" }) }}>
              합&nbsp;계&nbsp;금&nbsp;액
            </td>
            <td style={cellStyle({ fontWeight: "800", fontSize: "14px", letterSpacing: "0.5px", lineHeight: 1.4, color: "#0f172a" })}>
              {toKoreanAmount(grandTotal)}
            </td>
            <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "900", textAlign: "center", fontSize: "15px", color: "#0f172a" }) }}>₩</td>
            <td style={{ ...cellStyle({ fontWeight: "900", fontSize: "18px", textAlign: "right", fontFamily: "ui-monospace, monospace", color: "#0f172a", letterSpacing: "-0.02em" }) }}>
              {grandTotal.toLocaleString()}&nbsp;원
            </td>
          </tr>
          <tr>
            <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", textAlign: "center" }) }}>
              비&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;고
            </td>
            <td colSpan={3} style={cellStyle()}>&nbsp;</td>
          </tr>
        </tbody>
      </table>

      {/* ── 품목 테이블 (양식별 헤더) ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "0" }}>
        <thead>
          <tr style={{ backgroundColor: headerBg, color: "#fff" }}>
            {tmpl.cols.map((col) => (
              <th key={`${col.key}-${col.header}`} style={{
                border: "1px solid #444",
                padding: "5px 4px",
                fontWeight: "700",
                textAlign: "center",
                letterSpacing: "1px",
                fontSize: "10px",
                width: col.width,
              }}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const cells = tmpl.renderRow(item);
            return (
              <tr key={i} style={{ height: "24px", backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                {cells.map((cell, ci) => (
                  <td key={ci} style={{
                    border: "1px solid #bbb",
                    padding: "3px 6px",
                    textAlign: tmpl.cols[ci]?.align || "left",
                    fontFamily: (tmpl.cols[ci]?.align === "right") ? "monospace" : undefined,
                    fontWeight: (tmpl.cols[ci]?.align === "right" && ci > 0) ? "700" : undefined,
                    width: tmpl.cols[ci]?.width,
                    fontSize: "11px",
                  }}>{cell}</td>
                ))}
              </tr>
            );
          })}
          {/* 빈 행 패딩 */}
          {Array.from({ length: Math.max(0, 10 - items.length) }).map((_, i) => (
            <tr key={`empty-${i}`} style={{ height: "24px" }}>
              {tmpl.cols.map((_, ci) => (
                <td key={ci} style={{ border: "1px solid #ddd", padding: "3px 6px" }}>&nbsp;</td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <td colSpan={Math.max(1, ti)} style={{ border: "1px solid #555", padding: "5px 12px", textAlign: "right", fontWeight: "bold" }}>
              합  계 <span style={{ fontWeight: "600", fontSize: "10px", color: "#444" }}>(부가세 10% 포함)</span>
            </td>
            <td style={{ border: "1px solid #555", padding: "5px 8px", textAlign: "right", fontWeight: "900", fontFamily: "monospace", fontSize: "12px" }}>
              {grandTotal.toLocaleString()}
            </td>
            {colCount - ti - 1 > 0 ? (
              <td colSpan={colCount - ti - 1} style={{ border: "1px solid #555" }}>&nbsp;</td>
            ) : null}
          </tr>
        </tfoot>
      </table>

      {/* ── 출력일자 + 로고 푸터 ── */}
      <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontSize: "10px", color: "#777" }}>
          출력일자: {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}&nbsp;
          {new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
          <img
            src="/sglogo.png"
            alt="세계로지스"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            style={{ height: "28px", objectFit: "contain" }}
          />
          <p style={{ fontSize: "11px", color: "#334155", fontWeight: "600", margin: 0 }}>
            이번달도 세계로지스와 함께해주셔서 감사합니다.
          </p>
        </div>
      </div>
    </div>
  );
});
DocumentBody.displayName = "DocumentBody";

// ─────────────────────────────────────────────────────────────
// 메인 모달
// ─────────────────────────────────────────────────────────────
export default function StatementModal({
  record,
  onClose,
  onMailSentOk,
}: {
  record: ArRecord;
  onClose: () => void;
  /** 신용내역 화면 등 상위에서 ‘메일 전송 완료’ 배너 표시용 */
  onMailSentOk?: (payload: {
    clientName: string;
    recipientCount: number;
    results: MailSendReportLine[];
  }) => void;
}) {
  const [items, setItems]           = useState<SettlementItem[]>([]);
  const [loadingItems, setLoading]  = useState(true);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);

  // 거래처 프로필: 엑셀 집계명과 거래처 정보 탭 입력명이 공백만 다를 때도 연동
  useEffect(() => {
    const aggName = record.client_name;
    const unsub = onSnapshot(
      collection(db, "client_profiles"),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          ...(d.data() as Omit<ClientProfile, "id">),
          id: d.id,
        }));
        const matched = matchClientProfileToAggregated(rows, aggName);
        if (matched?.id) {
          const { id, ...prof } = matched;
          setClientProfile({ ...(prof as ClientProfile), id: String(id) });
        } else {
          setClientProfile(null);
        }
      },
      () => setClientProfile(null)
    );
    return () => unsub();
  }, [record.client_name]);

  // 이메일: 저장된 주소를 배열로 관리 (여러 담당자 지원)
  const [recipients, setRecipients] = useState<string[]>(() => {
    const saved = record.contact_email ?? "";
    return saved ? saved.split(",").map(e => e.trim()).filter(Boolean) : [];
  });
  const [emailInput, setEmailInput] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [sending, setSending]       = useState(false);
  const [sentOk, setSentOk]         = useState(false);
  const [sentErr, setSentErr]       = useState("");
  const [sendReport, setSendReport] = useState<MailSendReportLine[] | null>(null);
  const [pdfBusy, setPdfBusy]       = useState(false);
  const [pngBusy, setPngBusy]       = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const addRecipient = () => {
    const emails = emailInput.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
    const newList = Array.from(new Set([...recipients, ...emails]));
    setRecipients(newList);
    setEmailInput("");
  };
  const removeRecipient = (email: string) => setRecipients(prev => prev.filter(e => e !== email));

  // 거래처정보(client_profiles) 이메일 → PNG/메일 수신인에 자동 반영 (QuickMailPanel과 동일)
  useEffect(() => {
    if (!clientProfile?.email?.trim()) return;
    const profEmails = String(clientProfile.email)
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (profEmails.length === 0) return;
    setRecipients((prev) => Array.from(new Set([...prev, ...profEmails])));
  }, [clientProfile?.id, clientProfile?.email]);

  // ── 아이템 로드 ──
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "ar_records", record.id, "items"),
      orderBy("date", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows: SettlementItem[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SettlementItem, "id">) }))
        .sort((a, b) => {
          // 날짜 오름차순 정렬 (1일 맨 위, 말일 맨 아래)
          const da = a.date || "";
          const db2 = b.date || "";
          return da < db2 ? -1 : da > db2 ? 1 : 0;
        });
      if (rows.length === 0) {
        setItems([{
          date: `${record.billing_month}-01`,
          description: `${record.billing_month} 화물 운송비`,
          quantity: 1,
          unit_price: record.total_amount,
          supply_amount: record.total_amount,
          tax_amount: 0,
          total_amount: record.total_amount,
          memo: record.memo ?? "",
        }]);
      } else {
        setItems(rows);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [record]);

  // ── 이메일 저장 (여러 담당자를 콤마 구분으로 Firestore 저장) ──
  const handleSaveEmail = async () => {
    const joined = recipients.join(", ");
    await updateDoc(doc(db, "ar_records", record.id), { contact_email: joined });
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2000);
  };

  // ── PNG 다운로드 ──
  const handleDownloadPNG = async () => {
    if (!docRef.current) return;
    setPngBusy(true);
    try {
      const canvas = await captureStatementToCanvas(docRef.current, { scale: 2 });
      const link = document.createElement("a");
      link.download = `거래명세표_${record.client_name}_${record.billing_month}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setPngBusy(false);
    }
  };

  // ── PDF 다운로드 ──
  const handleDownloadPDF = async () => {
    if (!docRef.current) return;
    setPdfBusy(true);
    try {
      const canvas = await captureStatementToCanvas(docRef.current, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, w, Math.min(h, pdf.internal.pageSize.getHeight()));
      pdf.save(`거래명세표_${record.client_name}_${record.billing_month}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  // ── 엑셀: 인사말 + 양식 헤더·본문만 (공급자/공급받는자·요약 표 제외) ──
  const handleDownloadExcel = () => {
    const tmpl = resolveStatementTemplate(record.client_name, clientProfile);
    const nc = tmpl.cols.length;
    const { supplyBase: supplyTotal, vatTotal, grandTotal } = statementSupplyVatGrand(record);
    const displayName = (clientProfile?.name || "").trim() || record.client_name;
    const sheetW = Math.max(8, nc);

    const pad = (cells: (string | number)[]): (string | number)[] => {
      const a = cells.map((c) => c);
      while (a.length < sheetW) a.push("");
      return a.slice(0, sheetW);
    };

    const rows: (string | number)[][] = [];
    rows.push(pad([excelStatementGreeting(displayName, record.billing_month)]));
    rows.push(pad([""]));
    const excelHeaders = tmpl.cols.map((c) => c.header);
    rows.push([...excelHeaders]);
    for (const item of items) {
      const cells = tmpl.renderRow(item);
      const row: (string | number)[] = [];
      for (let i = 0; i < nc; i += 1) {
        const v = cells[i];
        row.push(v === undefined || v === null ? "" : typeof v === "number" ? v : String(v));
      }
      rows.push(row);
    }
    const sumRowIndex = rows.length;
    const ti = tmpl.totalColumnIndex;
    const sumRow: (string | number)[] = Array(nc).fill("");
    if (ti > 0) {
      sumRow[0] = "합계 (부가세 10% 포함)";
      sumRow[ti] = grandTotal.toLocaleString();
    } else {
      sumRow[0] = grandTotal.toLocaleString();
    }
    rows.push(sumRow);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: sheetW - 1 } },
    ];
    if (ti > 0) {
      merges.push({
        s: { r: sumRowIndex, c: 0 },
        e: { r: sumRowIndex, c: ti - 1 },
      });
    }
    ws["!merges"] = merges;
    const colWch = (wch?: string): number => {
      if (!wch) return 12;
      const n = parseInt(String(wch).replace(/px|\s/g, ""), 10);
      return Math.min(40, Math.max(8, Math.round((Number.isNaN(n) ? 80 : n) / 6)));
    };
    ws["!cols"] = Array.from({ length: sheetW }, (_, i) => ({
      wch: i < nc ? colWch(tmpl.cols[i]?.width) : 10,
    }));
    XLSX.utils.book_append_sheet(wb, ws, "거래명세표");
    XLSX.writeFile(wb, `거래명세표_${record.client_name}_${record.billing_month}.xlsx`);
  };

  // ── 이메일 발송 (모든 담당자에게 전송) ──
  const handleSendEmail = async () => {
    if (recipients.length === 0) { setSentErr("이메일 주소를 추가하세요."); return; }
    if (!docRef.current) return;
    setSending(true); setSentOk(false); setSentErr(""); setSendReport(null);
    try {
      const canvas = await captureStatementToCanvas(docRef.current, { scale: 2 });
      const imageBase64 = canvas.toDataURL("image/png", 0.92);
      await updateDoc(doc(db, "ar_records", record.id), { contact_email: recipients.join(", ") });
      const { supplyBase: supplyTotal, vatTotal, grandTotal } = statementSupplyVatGrand(record);

      const results: MailSendReportLine[] = [];
      for (const to of recipients) {
        const line = await postStatementMail({
          to,
          clientName: record.client_name,
          billingMonth: record.billing_month,
          imageBase64,
          items,
          supplyTotal,
          taxTotal: vatTotal,
          grandTotal,
          supplierName: SUPPLIER.name,
          supplierPhone: SUPPLIER.phone,
          supplierEmail: SUPPLIER.email,
        });
        results.push(line);
      }
      setSendReport(results);
      const allOk = results.every((r) => r.ok);
      setSentOk(allOk);
      if (allOk) {
        setSentErr("");
        onMailSentOk?.({
          clientName: record.client_name,
          recipientCount: results.length,
          results,
        });
      } else {
        const failed = results.filter((r) => !r.ok);
        setSentErr(`${failed.length}명 발송 실패: ${failed.map((f) => f.to).join(", ")}`);
      }
    } catch (e: unknown) {
      setSendReport(null);
      setSentErr(`발송 실패: ${e instanceof Error ? e.message : String(e)}`);
      setSentOk(false);
    } finally {
      setSending(false);
    }
  };

  const { grandTotal } = statementSupplyVatGrand(record);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative my-6 w-full max-w-[900px] rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 모달 헤더 ── */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">거래명세표</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {record.client_name} · {record.billing_month} · {items.length}건
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400">합계금액 (VAT 포함)</div>
              <div className="text-2xl font-black font-mono tabular-nums text-blue-900 tracking-tight">
                ₩{grandTotal.toLocaleString()}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── 액션 바 ── */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200">
          {/* PNG */}
          <Button
            onClick={handleDownloadPNG}
            disabled={pngBusy || loadingItems}
            variant="outline"
            size="sm"
            className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50"
          >
            {pngBusy
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />PNG 생성 중...</>
              : <><ImageIcon className="h-3.5 w-3.5" />PNG 저장</>}
          </Button>

          {/* PDF */}
          <Button
            onClick={handleDownloadPDF}
            disabled={pdfBusy || loadingItems}
            variant="outline"
            size="sm"
            className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
          >
            {pdfBusy
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />PDF 생성 중...</>
              : <><Download className="h-3.5 w-3.5" />PDF 저장</>}
          </Button>

          {/* 엑셀 */}
          <Button
            onClick={handleDownloadExcel}
            disabled={loadingItems}
            variant="outline"
            size="sm"
            className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />엑셀 저장
          </Button>

          {/* 인쇄 */}
          <Button
            onClick={() => window.print()}
            variant="outline"
            size="sm"
            className="gap-1.5 text-slate-600 hover:bg-slate-100"
          >
            <Printer className="h-3.5 w-3.5" />인쇄
          </Button>

        </div>

        {/* ── 메일 전송 섹션 (눈에 잘 보이는 별도 바) ── */}
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-800 shrink-0">
              <Mail className="h-4 w-4" />거래명세표 PNG 메일 전송
            </div>

            {/* 수신인 배지 */}
            {recipients.map((email) => (
              <span key={email} className="inline-flex items-center gap-1 bg-white text-blue-700 border border-blue-300 text-xs rounded-full px-2.5 py-1 font-medium">
                {email}
                <button onClick={() => removeRecipient(email)} className="text-blue-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            {/* 이메일 입력 */}
            <input
              type="text"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addRecipient(); } }}
              placeholder="이메일 입력 후 Enter"
              className="px-3 py-1.5 border border-blue-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 w-44"
            />
            <Button onClick={addRecipient} variant="outline" size="sm" disabled={!emailInput.trim()}
              className="border-blue-300 text-blue-600 hover:bg-blue-100">
              추가
            </Button>

            {/* 저장 버튼 */}
            <Button onClick={handleSaveEmail} variant="outline" size="sm"
              disabled={recipients.length === 0}
              className="border-slate-300 text-slate-600 hover:bg-white gap-1">
              {emailSaved ? <><CheckCircle className="h-3.5 w-3.5 text-green-500" />저장됨</> : "주소 저장"}
            </Button>

            {/* 전송 버튼 */}
            <Button
              onClick={handleSendEmail}
              disabled={sending || recipients.length === 0 || loadingItems}
              size="sm"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold ml-auto"
            >
              {sending
                ? <><Loader2 className="h-4 w-4 animate-spin" />전송 중 ({recipients.length}명)...</>
                : <><Send className="h-4 w-4" />PNG 메일 전송 ({recipients.length}명)</>}
            </Button>
          </div>

          {/* 전송 결과 */}
          {(sentOk || sentErr || (sendReport && sendReport.length > 0)) && (
            <div
              className={`mt-2 text-sm rounded-lg px-3 py-2 border ${
                sentOk
                  ? "bg-green-50 text-green-800 border-green-200"
                  : sendReport?.some((r) => r.ok)
                    ? "bg-amber-50 text-amber-900 border-amber-200"
                    : "bg-red-50 text-red-800 border-red-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {sentOk
                  ? <><CheckCircle className="h-4 w-4 shrink-0" />{recipients.length}명에게 서버 응답 기준 발송 완료</>
                  : <><AlertTriangle className="h-4 w-4 shrink-0" />{sentErr || "일부 실패"}</>}
              </div>
              {sendReport && sendReport.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-700 max-h-36 overflow-y-auto border-t border-slate-200/80 pt-2">
                  {sendReport.map((r) => (
                    <li key={r.to} className={r.ok ? "text-emerald-800" : "text-red-700"}>
                      {r.ok ? "✓" : "✗"} {r.to}: {r.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ── 거래명세표 본문 ── */}
        <div className="overflow-x-auto">
          {loadingItems ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />데이터 로딩 중...
            </div>
          ) : (
            <div className="p-4 flex justify-center" style={{ position: "relative" }}>
              <DocumentBody ref={docRef} record={record} items={items} profile={clientProfile} />
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex flex-wrap gap-4">
          <span>• PNG 저장 버튼으로 거래명세표를 이미지로 바로 다운로드할 수 있습니다.</span>
          <span>• 인쇄 시 브라우저 설정에서 "배경 그래픽 포함"을 체크하세요.</span>
        </div>
      </div>
    </div>
  );
}
