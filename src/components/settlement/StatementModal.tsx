import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import {
  collection, onSnapshot, orderBy, query, updateDoc, doc,
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
  paid_amount: number;
  unpaid_amount: number;
  due_date?: string;
  status: string;
  memo?: string;
  checked?: boolean;
  contact_email?: string;
}

// ─────────────────────────────────────────────────────────────
// 도장 이미지 컴포넌트
// ─────────────────────────────────────────────────────────────
function CompanyStamp({ size = 88 }: { size?: number }) {
  return (
    <img
      src="/stamp.png"
      alt="세계로지스 대표이사 인"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        opacity: 0.9,
        mixBlendMode: "multiply", // 흰 배경과 자연스럽게 합성
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// 거래명세서 문서 본문 (인쇄/캡처 대상)
// ─────────────────────────────────────────────────────────────
const DocumentBody = React.forwardRef<
  HTMLDivElement,
  { record: ArRecord; items: SettlementItem[] }
>(({ record, items }, ref) => {
  const [year, month] = record.billing_month.split("-");
  const supplyTotal = items.reduce((s, i) => s + i.supply_amount, 0);
  const taxTotal    = items.reduce((s, i) => s + i.tax_amount, 0);
  const grandTotal  = supplyTotal + taxTotal;

  const tdBase = "border border-gray-400 px-2 py-1 text-xs";

  return (
    <div
      ref={ref}
      style={{
        width: "794px", background: "white", padding: "28px 32px",
        fontFamily: "'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif",
        color: "#111", boxSizing: "border-box",
      }}
    >
      {/* ── 제목 ── */}
      <div style={{ textAlign: "center", marginBottom: "6px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "900", letterSpacing: "12px", margin: 0 }}>
          거  래  명  세  서
        </h1>
        <p style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
          ( 공급받는자 보관용 )
        </p>
      </div>

      {/* ── 공급자 / 공급받는자 ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px", fontSize: "11px" }}>
        <tbody>
          <tr>
            {/* 공급자 */}
            <td style={{ width: "48%", verticalAlign: "top", border: "1.5px solid #333", padding: "8px 10px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: "bold", color: "#333", width: "90px", paddingBottom: "3px" }}>공&nbsp;&nbsp;급&nbsp;&nbsp;자</td>
                    <td></td>
                  </tr>
                  {[
                    ["사업자등록번호", SUPPLIER.biz_no],
                    ["상호(법인명)",   SUPPLIER.name],
                    ["성명(대표자)",   SUPPLIER.representative],
                    ["주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소",  SUPPLIER.address],
                    ["전&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;화",  SUPPLIER.phone],
                    ["업태/종목",      `${SUPPLIER.business_type} / ${SUPPLIER.business_item}`],
                    ["E-mail",         SUPPLIER.email],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ color: "#555", paddingRight: "6px", whiteSpace: "nowrap", paddingBottom: "2px" }}
                        dangerouslySetInnerHTML={{ __html: label + ":" }} />
                      <td style={{ fontWeight: "500" }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>

            {/* 작성일 + 공급받는자 */}
            <td style={{ width: "52%", verticalAlign: "top", border: "1.5px solid #333", borderLeft: "none", padding: "8px 10px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: "bold", color: "#333", paddingBottom: "3px" }}>
                      작성일: {year}년 {month}월 {new Date().getDate()}일
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: "bold", color: "#333", paddingBottom: "3px" }}>
                      공 급 받 는 자
                    </td>
                  </tr>
                  {[
                    ["사업자등록번호", record.client_biz_no || ""],
                    ["상호(법인명)",   record.client_name],
                    ["성명(대표자)",   ""],
                    ["주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소",  ""],
                    ["업태/종목",      ""],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ color: "#555", paddingRight: "6px", whiteSpace: "nowrap", paddingBottom: "2px" }}
                        dangerouslySetInnerHTML={{ __html: label + ":" }} />
                      <td style={{ fontWeight: "500" }}>{value || "\u00A0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 도장 위치 */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                <CompanyStamp size={72} />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── 계산 안내 문구 ── */}
      <p style={{ textAlign: "center", fontSize: "13px", fontWeight: "bold", letterSpacing: "4px", margin: "8px 0" }}>
        아&nbsp;&nbsp;래&nbsp;&nbsp;와&nbsp;&nbsp;같&nbsp;&nbsp;이&nbsp;&nbsp;계&nbsp;&nbsp;산&nbsp;&nbsp;합&nbsp;&nbsp;니&nbsp;&nbsp;다.
      </p>

      {/* ── 품목 테이블 ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            {["NO", "품  명  /  규  격", "수 량", "단  가", "공 급 가 액", "세  액", "비  고"].map((h) => (
              <th key={h} className={tdBase} style={{
                border: "1px solid #666", padding: "4px 6px", fontWeight: "700",
                textAlign: "center", backgroundColor: "#efefef",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ height: "26px" }}>
              <td style={{ border: "1px solid #888", padding: "3px 6px", textAlign: "center" }}>{i + 1}</td>
              <td style={{ border: "1px solid #888", padding: "3px 8px" }}>{item.description}</td>
              <td style={{ border: "1px solid #888", padding: "3px 6px", textAlign: "center" }}>{item.quantity.toLocaleString()}</td>
              <td style={{ border: "1px solid #888", padding: "3px 8px", textAlign: "right" }}>
                {item.unit_price > 0 ? item.unit_price.toLocaleString() : ""}
              </td>
              <td style={{ border: "1px solid #888", padding: "3px 8px", textAlign: "right", fontWeight: "600" }}>
                {item.supply_amount.toLocaleString()}
              </td>
              <td style={{ border: "1px solid #888", padding: "3px 8px", textAlign: "right" }}>
                {item.tax_amount > 0 ? item.tax_amount.toLocaleString() : ""}
              </td>
              <td style={{ border: "1px solid #888", padding: "3px 8px" }}>{item.memo}</td>
            </tr>
          ))}
          {/* 빈 행 패딩 (최소 8행) */}
          {Array.from({ length: Math.max(0, 8 - items.length) }).map((_, i) => (
            <tr key={`empty-${i}`} style={{ height: "26px" }}>
              {[1,2,3,4,5,6,7].map((c) => (
                <td key={c} style={{ border: "1px solid #ccc", padding: "3px 6px" }}>&nbsp;</td>
              ))}
            </tr>
          ))}
          {/* 합계 행 */}
          <tr style={{ backgroundColor: "#f5f5f5", fontWeight: "bold" }}>
            <td colSpan={2} style={{ border: "1px solid #666", padding: "4px 8px", textAlign: "center" }}>
              합&nbsp;&nbsp;&nbsp;&nbsp;계
            </td>
            <td style={{ border: "1px solid #666", padding: "4px 6px" }}></td>
            <td style={{ border: "1px solid #666", padding: "4px 6px" }}></td>
            <td style={{ border: "1px solid #666", padding: "4px 8px", textAlign: "right" }}>
              {supplyTotal.toLocaleString()}
            </td>
            <td style={{ border: "1px solid #666", padding: "4px 8px", textAlign: "right" }}>
              {taxTotal > 0 ? taxTotal.toLocaleString() : ""}
            </td>
            <td style={{ border: "1px solid #666", padding: "4px 6px" }}></td>
          </tr>
        </tbody>
      </table>

      {/* ── 합계 금액 박스 ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px", fontSize: "11px" }}>
        <tbody>
          <tr>
            <td style={{ border: "1.5px solid #444", padding: "6px 12px", fontWeight: "bold", width: "30%", backgroundColor: "#efefef" }}>
              합 계 금 액 (공급가액 + 세액)
            </td>
            <td style={{ border: "1.5px solid #444", borderLeft: "none", padding: "6px 12px", fontWeight: "900", fontSize: "13px" }}>
              ₩ {grandTotal.toLocaleString()}
            </td>
            <td style={{ border: "1.5px solid #444", borderLeft: "none", padding: "6px 12px", width: "22%", backgroundColor: "#efefef", fontWeight: "bold" }}>
              공급가액
            </td>
            <td style={{ border: "1.5px solid #444", borderLeft: "none", padding: "6px 12px", fontWeight: "700" }}>
              {supplyTotal.toLocaleString()}원
            </td>
            <td style={{ border: "1.5px solid #444", borderLeft: "none", padding: "6px 12px", width: "10%", backgroundColor: "#efefef", fontWeight: "bold" }}>
              세액
            </td>
            <td style={{ border: "1.5px solid #444", borderLeft: "none", padding: "6px 12px", fontWeight: "700" }}>
              {taxTotal.toLocaleString()}원
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── 비고 ── */}
      {record.memo && (
        <div style={{ marginTop: "6px", border: "1px solid #ccc", padding: "4px 8px", fontSize: "11px" }}>
          <span style={{ fontWeight: "bold" }}>비고: </span>{record.memo}
        </div>
      )}

      {/* ── 하단 감사 메시지 푸터 ── */}
      <div style={{
        marginTop: "28px",
        paddingTop: "16px",
        borderTop: "2px solid #ddd",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
      }}>
        <img
          src="/sglogo.png"
          alt="세계로지스"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          style={{ height: "38px", objectFit: "contain" }}
        />
        <p style={{
          fontSize: "13px",
          fontWeight: "700",
          color: "#334155",
          letterSpacing: "0.5px",
          margin: 0,
        }}>
          이번달도 세계로지스와 함께해주셔서 감사합니다.
        </p>
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
  const [contactEmail, setEmail]    = useState(record.contact_email ?? "");
  const [emailSaved, setEmailSaved] = useState(false);
  const [sending, setSending]       = useState(false);
  const [sentOk, setSentOk]         = useState(false);
  const [sentErr, setSentErr]       = useState("");
  const [pdfBusy, setPdfBusy]       = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  // ── 아이템 로드 (ar_records/{id}/items 서브컬렉션) ──
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
        // 서브컬렉션이 없으면 ar_record 집계값으로 단일 행 생성
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

  // ── 이메일 저장 ──
  const handleSaveEmail = async () => {
    await updateDoc(doc(db, "ar_records", record.id), { contact_email: contactEmail });
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2000);
  };

  // ── PDF 다운로드 ──
  const handleDownloadPDF = async () => {
    if (!docRef.current) return;
    setPdfBusy(true);
    try {
      const canvas = await html2canvas(docRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, w, Math.min(h, pdf.internal.pageSize.getHeight()));
      pdf.save(`거래명세서_${record.client_name}_${record.billing_month}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  // ── 엑셀 다운로드 ──
  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const [year, month] = record.billing_month.split("-");
    const supplyTotal = items.reduce((s, i) => s + i.supply_amount, 0);
    const taxTotal    = items.reduce((s, i) => s + i.tax_amount, 0);

    const rows: (string | number)[][] = [
      ["거  래  명  세  서"],
      [""],
      ["[공급자]", "", "", "[공급받는자]"],
      ["사업자등록번호", SUPPLIER.biz_no, "", "사업자등록번호", record.client_biz_no ?? ""],
      ["상호(법인명)",   SUPPLIER.name,   "", "상호(법인명)",   record.client_name],
      ["대표자",         SUPPLIER.representative, "", "담당자", ""],
      ["주소",           SUPPLIER.address, "", "주소", ""],
      ["전화",           SUPPLIER.phone,   "", "전화", ""],
      ["업태/종목",      `${SUPPLIER.business_type}/${SUPPLIER.business_item}`, "", "", ""],
      [""],
      [`작성일: ${year}년 ${month}월`],
      [""],
      ["NO", "품명/규격", "수량", "단가", "공급가액", "세액", "비고"],
      ...items.map((item, i) => [
        i + 1,
        item.description,
        item.quantity,
        item.unit_price,
        item.supply_amount,
        item.tax_amount,
        item.memo,
      ]),
      ["", "합계", "", "", supplyTotal, taxTotal, ""],
      [""],
      ["합계금액(공급가액+세액)", "", "", "", supplyTotal + taxTotal],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 컬럼 너비
    ws["!cols"] = [
      { wch: 6 }, { wch: 28 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 },
    ];

    // 제목 병합
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "거래명세서");
    XLSX.writeFile(wb, `거래명세서_${record.client_name}_${record.billing_month}.xlsx`);
  };

  // ── 이메일 발송 (PNG 캡처 → /api/sendMail → Nodemailer Gmail SMTP) ──
  const handleSendEmail = async () => {
    if (!contactEmail) { setSentErr("이메일 주소를 입력하세요."); return; }
    if (!docRef.current) return;

    setSending(true); setSentOk(false); setSentErr("");
    try {
      // 1. 거래명세서를 PNG로 캡처 (1.5× 스케일 – 화질과 파일 크기 균형)
      const canvas = await html2canvas(docRef.current, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const imageBase64 = canvas.toDataURL("image/png", 0.92);

      // 2. 담당자 이메일 Firestore 저장
      await updateDoc(doc(db, "ar_records", record.id), { contact_email: contactEmail });

      // 3. Vercel Serverless Function 호출 → Nodemailer Gmail SMTP 발송
      const supplyTotal = items.reduce((s, i) => s + i.supply_amount, 0);
      const taxTotal    = items.reduce((s, i) => s + i.tax_amount, 0);

      const resp = await fetch("/api/sendMail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to:            contactEmail,
          clientName:    record.client_name,
          billingMonth:  record.billing_month,
          imageBase64,
          items,
          supplyTotal,
          taxTotal,
          grandTotal:    supplyTotal + taxTotal,
          supplierName:  SUPPLIER.name,
          supplierPhone: SUPPLIER.phone,
          supplierEmail: SUPPLIER.email,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "알 수 없는 오류");

      setSentOk(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSentErr(`발송 실패: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  const supplyTotal = items.reduce((s, i) => s + i.supply_amount, 0);
  const taxTotal    = items.reduce((s, i) => s + i.tax_amount, 0);
  const grandTotal  = supplyTotal + taxTotal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative my-6 w-full max-w-[880px] rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 모달 헤더 ── */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              거래명세서
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {record.client_name} · {record.billing_month}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 합계 배지 */}
            <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              ₩ {grandTotal.toLocaleString()}
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── 액션 바 ── */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200">
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

          {/* 이메일 전송 영역 */}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="담당자 이메일"
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <Button
              onClick={handleSaveEmail}
              variant="outline"
              size="sm"
              className="gap-1.5 text-slate-600"
              disabled={!contactEmail}
            >
              {emailSaved
                ? <><CheckCircle className="h-3.5 w-3.5 text-green-500" />저장됨</>
                : "저장"}
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={sending || !contactEmail}
              size="sm"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 font-bold"
            >
              {sending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />PNG 전송 중...</>
                : <><ImageIcon className="h-3.5 w-3.5" />PNG 메일 발송</>}
            </Button>
          </div>
        </div>

        {/* 이메일 결과 메시지 */}
        {(sentOk || sentErr) && (
          <div className={`px-6 py-2 text-sm flex items-center gap-2 ${sentOk ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {sentOk
              ? <><CheckCircle className="h-4 w-4" />이메일이 성공적으로 발송되었습니다.</>
              : <><AlertTriangle className="h-4 w-4" />{sentErr}</>}
          </div>
        )}

        {/* ── 거래명세서 본문 ── */}
        <div className="overflow-x-auto">
          {loadingItems ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />데이터 로딩 중...
            </div>
          ) : (
            <div className="p-4 flex justify-center">
              <DocumentBody ref={docRef} record={record} items={items} />
            </div>
          )}
        </div>

        {/* ── 안내 (인쇄 / 이메일 설정) ── */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex flex-wrap gap-4">
          <span>• PDF/인쇄 시 배경색을 포함하도록 브라우저 설정을 확인하세요.</span>
          <span>• 메일 발송 시 거래명세서를 PNG 이미지로 자동 변환하여 Firebase를 통해 발송됩니다.</span>
          <span>• Firebase Console → Extensions → Trigger Email 확장이 설치되어 있어야 합니다.</span>
        </div>
      </div>
    </div>
  );
}
