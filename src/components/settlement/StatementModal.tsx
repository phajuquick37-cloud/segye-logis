import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import {
  collection, onSnapshot, orderBy, query, updateDoc, doc, getDocs, where,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { X, Download, Mail, FileSpreadsheet, Printer, CheckCircle, AlertTriangle, Loader2, ImageIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { SUPPLIER, VAT_RATE } from "../../config/companyInfo";

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────
export interface SettlementItem {
  id?: string;
  date: string;
  description: string;
  quantity: number;
  unit_price: number;
  supply_amount: number;
  tax_amount: number;
  total_amount: number;
  memo: string;
}

export interface ArRecord {
  id: string;
  billing_month: string;
  client_name: string;
  client_biz_no?: string;
  total_amount: number;
  delivery_fee?: number;
  paid_amount: number;
  unpaid_amount: number;
  due_date?: string;
  status: string;
  memo?: string;
  checked?: boolean;
  contact_email?: string;
  item_count?: number;
}

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
// 거래처별 양식 템플릿
// ─────────────────────────────────────────────────────────────
export type TemplateType = "basic" | "samil" | "jiyoo" | "rapid";

interface ColDef { header: string; width?: string; align?: "left"|"center"|"right"; }

const TEMPLATES: Record<TemplateType, { label: string; cols: ColDef[]; renderRow: (item: SettlementItem) => (string|number)[]; }> = {
  basic: {
    label: "기본양식",
    cols: [
      { header: "날  짜",          width: "80px",  align: "center" },
      { header: "고객명 (상호)",                   align: "left"   },
      { header: "출 발 지",                        align: "center" },
      { header: "도 착 지",                        align: "center" },
      { header: "톤수 (차종)",     width: "72px",  align: "center" },
      { header: "금  액",          width: "100px", align: "right"  },
    ],
    renderRow: (item) => [
      item.date,
      item.description,
      (item as any).departure    ?? "",
      (item as any).destination  ?? "",
      (item as any).vehicle_type ?? "",
      item.supply_amount.toLocaleString(),
    ],
  },
  samil: {
    label: "삼일강업양식",
    cols: [
      { header: "날  짜",    width: "72px",  align: "center" },
      { header: "고객명(상호)",              align: "left"   },
      { header: "출 발 지",                  align: "center" },
      { header: "도 착 지",                  align: "center" },
      { header: "톤  수",    width: "52px",  align: "center" },
      { header: "기 사 명",  width: "60px",  align: "center" },
      { header: "금  액",    width: "90px",  align: "right"  },
      { header: "차량번호",  width: "72px",  align: "center" },
    ],
    renderRow: (item) => [
      item.date,
      item.description,
      (item as any).departure    ?? "",
      (item as any).destination  ?? "",
      (item as any).vehicle_type ?? "",
      (item as any).driver       ?? "",
      item.supply_amount.toLocaleString(),
      (item as any).vehicle_no   ?? "",
    ],
  },
  jiyoo: {
    label: "지유전자양식",
    cols: [
      { header: "날  짜",      width: "72px",  align: "center" },
      { header: "고 객 명",                    align: "left"   },
      { header: "출 발 지",                    align: "center" },
      { header: "하차지고객",                  align: "center" },
      { header: "도 착 지",                    align: "center" },
      { header: "톤  수",      width: "52px",  align: "center" },
      { header: "금  액",      width: "90px",  align: "right"  },
    ],
    renderRow: (item) => [
      item.date,
      item.description,
      (item as any).departure    ?? "",
      (item as any).unload_client ?? "",
      (item as any).destination  ?? "",
      (item as any).vehicle_type ?? "",
      item.supply_amount.toLocaleString(),
    ],
  },
  rapid: {
    label: "래피드양식",
    cols: [
      { header: "날  짜",    width: "72px",  align: "center" },
      { header: "출 발 지",                  align: "center" },
      { header: "도 착 지",                  align: "center" },
      { header: "비  고",                    align: "left"   },
      { header: "금  액",    width: "90px",  align: "right"  },
      { header: "톤  수",    width: "52px",  align: "center" },
    ],
    renderRow: (item) => [
      item.date,
      (item as any).departure    ?? "",
      (item as any).destination  ?? "",
      item.memo                  ?? "",
      item.supply_amount.toLocaleString(),
      (item as any).vehicle_type ?? "",
    ],
  },
};

function detectTemplate(clientName: string, profile?: ClientProfile | null): TemplateType {
  // 1. 거래처명 기반 자동 감지 (우선)
  const n = clientName;
  if (n.includes("삼일강업"))                          return "samil";
  if (n.includes("지유전자") || n.includes("지유"))    return "jiyoo";
  if (n.includes("래피드") || n.includes("래피어드") || n.includes("rapid")) return "rapid";
  // 2. 프로필에서 기본양식이 아닌 양식을 명시한 경우 적용
  if (profile?.template && profile.template !== "basic") return profile.template as TemplateType;
  return "basic";
}

// ─────────────────────────────────────────────────────────────
// 거래처 프로필 타입
// ─────────────────────────────────────────────────────────────
export interface ClientProfile {
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

// ─────────────────────────────────────────────────────────────
// 거래명세표 본문 (인쇄/캡처 대상)
// ─────────────────────────────────────────────────────────────
export const DocumentBody = React.forwardRef<
  HTMLDivElement,
  { record: ArRecord; items: SettlementItem[]; profile?: ClientProfile | null }
>(({ record, items, profile }, ref) => {
  const [year, month] = record.billing_month.split("-");
  const supplyTotal = record.total_amount;
  const vatTotal    = Math.round(supplyTotal * VAT_RATE);
  const grandTotal  = supplyTotal + vatTotal;
  const dateRange   = monthDateRange(record.billing_month);
  const tmpl = TEMPLATES[detectTemplate(record.client_name, profile)];
  const colCount = tmpl.cols.length;

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
                    <td style={cellStyle({ fontWeight: "bold" })}>{record.client_name}</td>
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
            <td style={cellStyle({ fontWeight: "bold", fontSize: "12px", letterSpacing: "1px" })}>
              {toKoreanAmount(grandTotal)}
            </td>
            <td style={{ ...cellStyle({ backgroundColor: "#f0f0f0", fontWeight: "bold", textAlign: "center" }) }}>₩</td>
            <td style={{ ...cellStyle({ fontWeight: "900", fontSize: "13px", textAlign: "right", fontFamily: "monospace", color: "#1a3a6b" }) }}>
              {grandTotal.toLocaleString()}
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
          <tr style={{ backgroundColor: "#2c3e50", color: "#fff" }}>
            {tmpl.cols.map((col) => (
              <th key={col.header} style={{
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
            <td colSpan={colCount - 2} style={{ border: "1px solid #555", padding: "5px 12px", textAlign: "right", fontWeight: "bold" }}>
              합  계
            </td>
            <td style={{ border: "1px solid #555", padding: "5px 8px", textAlign: "right", fontWeight: "900", fontFamily: "monospace", fontSize: "12px" }}>
              {supplyTotal.toLocaleString()}
            </td>
            <td style={{ border: "1px solid #555" }}>&nbsp;</td>
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
}: {
  record: ArRecord;
  onClose: () => void;
}) {
  const [items, setItems]           = useState<SettlementItem[]>([]);
  const [loadingItems, setLoading]  = useState(true);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);

  // 거래처 프로필 로드
  useEffect(() => {
    getDocs(query(collection(db, "client_profiles"), where("name", "==", record.client_name)))
      .then((snap) => {
        if (!snap.empty) setClientProfile({ id: snap.docs[0].id, ...snap.docs[0].data() } as ClientProfile);
      })
      .catch(() => {});
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

  // ── 아이템 로드 ──
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "ar_records", record.id, "items"),
      orderBy("date", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows: SettlementItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SettlementItem, "id">),
      }));
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
      const canvas = await html2canvas(docRef.current, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
      });
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
      const canvas = await html2canvas(docRef.current, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
      });
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

  // ── 엑셀 다운로드 ──
  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const [year, month] = record.billing_month.split("-");
    const supplyTotal = record.total_amount;
    const vatTotal    = Math.round(supplyTotal * VAT_RATE);

    const rows: (string | number)[][] = [
      ["거  래  명  세  표"],
      [`기간: ${monthDateRange(record.billing_month)}`],
      [""],
      ["[공급자]", "", "", "[공급받는자]"],
      ["등록번호", SUPPLIER.biz_no, "", "등록번호", record.client_biz_no ?? ""],
      ["상호(법인명)", SUPPLIER.name, "", "상호(법인명)", record.client_name],
      ["대표자", SUPPLIER.representative, "", "", ""],
      ["주소", SUPPLIER.address, "", "", ""],
      [""],
      [`공급가액: ${supplyTotal.toLocaleString()}원`, "", `VAT: ${vatTotal.toLocaleString()}원`, "", `합계: ${(supplyTotal + vatTotal).toLocaleString()}원`],
      [""],
      ["날짜", "거래내역/품명", "수량", "단가", "공급가액", "세액", "비고"],
      ...items.map((item) => [
        item.date,
        item.description,
        item.quantity,
        item.unit_price,
        item.supply_amount,
        item.tax_amount,
        item.memo,
      ]),
      ["", "페이지 소계", "", "", supplyTotal, vatTotal, ""],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    XLSX.utils.book_append_sheet(wb, ws, "거래명세표");
    XLSX.writeFile(wb, `거래명세표_${record.client_name}_${record.billing_month}.xlsx`);
  };

  // ── 이메일 발송 (모든 담당자에게 전송) ──
  const handleSendEmail = async () => {
    if (recipients.length === 0) { setSentErr("이메일 주소를 추가하세요."); return; }
    if (!docRef.current) return;
    setSending(true); setSentOk(false); setSentErr("");
    try {
      const canvas = await html2canvas(docRef.current, {
        scale: 1.5, useCORS: true, backgroundColor: "#ffffff", logging: false,
      });
      const imageBase64 = canvas.toDataURL("image/png", 0.92);
      // 담당자 목록 Firestore 저장
      await updateDoc(doc(db, "ar_records", record.id), { contact_email: recipients.join(", ") });
      const supplyTotal = record.total_amount;
      const vatTotal    = Math.round(supplyTotal * VAT_RATE);

      // 모든 담당자에게 순차 발송
      for (const to of recipients) {
        const resp = await fetch("/api/sendMail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to, clientName: record.client_name,
            billingMonth: record.billing_month, imageBase64, items,
            supplyTotal, taxTotal: vatTotal, grandTotal: supplyTotal + vatTotal,
            supplierName: SUPPLIER.name, supplierPhone: SUPPLIER.phone, supplierEmail: SUPPLIER.email,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`${to}: ${data.error ?? "발송 오류"}`);
      }
      setSentOk(true);
    } catch (e: unknown) {
      setSentErr(`발송 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  const supplyTotal = record.total_amount;
  const vatTotal    = Math.round(supplyTotal * VAT_RATE);
  const grandTotal  = supplyTotal + vatTotal;

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
              <div className="text-lg font-black font-mono text-blue-700">
                ₩ {grandTotal.toLocaleString()}
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

          {/* 이메일 — 담당자 여러 명 지원 */}
          <div className="flex flex-col gap-1.5 ml-auto w-full sm:w-auto">
            {/* 수신인 배지 */}
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {recipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs rounded-full px-2.5 py-1 font-medium"
                  >
                    <Mail className="h-3 w-3" />{email}
                    <button
                      onClick={() => removeRecipient(email)}
                      className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* 입력 영역 */}
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addRecipient(); } }}
                  placeholder="담당자 이메일 (Enter로 추가)"
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <Button onClick={addRecipient} variant="outline" size="sm" disabled={!emailInput.trim()} className="text-slate-600">
                추가
              </Button>
              <Button
                onClick={handleSaveEmail}
                variant="outline"
                size="sm"
                className="gap-1.5 text-slate-600"
                disabled={recipients.length === 0}
              >
                {emailSaved ? <><CheckCircle className="h-3.5 w-3.5 text-green-500" />저장됨</> : "저장"}
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={sending || recipients.length === 0}
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 font-bold"
              >
                {sending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />전송 중 ({recipients.length}명)...</>
                  : <><ImageIcon className="h-3.5 w-3.5" />PNG 발송 ({recipients.length}명)</>}
              </Button>
            </div>
          </div>
        </div>

        {/* 이메일 결과 */}
        {(sentOk || sentErr) && (
          <div className={`px-6 py-2 text-sm flex items-center gap-2 ${sentOk ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {sentOk
              ? <><CheckCircle className="h-4 w-4" />{recipients.length}명({recipients.join(", ")})에게 거래명세표 PNG가 발송되었습니다.</>
              : <><AlertTriangle className="h-4 w-4" />{sentErr}</>}
          </div>
        )}

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
