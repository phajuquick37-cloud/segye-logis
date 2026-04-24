import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";

// Vercel 요청 body 최대 크기 8MB (이미지 base64 포함)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

interface MailItem {
  description: string;
  quantity: number;
  unit_price: number;
  supply_amount: number;
  tax_amount: number;
  memo: string;
}

interface MailPayload {
  to: string;
  clientName: string;
  billingMonth: string;
  imageBase64?: string;       // html2canvas 로 캡처한 거래명세서 JPEG base64
  items?: MailItem[];
  supplyTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  supplierName?: string;
  supplierPhone?: string;
  supplierEmail?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── CORS ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const {
    to,
    clientName,
    billingMonth,
    imageBase64,
    items = [],
    supplyTotal = 0,
    taxTotal = 0,
    grandTotal = 0,
    supplierName  = "세계로지스",
    supplierPhone = "031-000-0000",
    supplierEmail = "",
  }: MailPayload = req.body ?? {};

  if (!to || !clientName || !billingMonth) {
    return res.status(400).json({ error: "필수 파라미터 누락 (to, clientName, billingMonth)" });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return res.status(500).json({
      error: "서버 환경 변수(GMAIL_USER, GMAIL_APP_PASSWORD)가 설정되지 않았습니다.",
    });
  }

  const [year, month] = billingMonth.split("-");
  const CID = "statement@segye-logis";

  // ── 상세 내역 테이블 행 생성 ──
  const itemRows = items
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        <td style="border:1px solid #e2e8f0;padding:8px 10px;text-align:center;font-size:12px;">${i + 1}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 10px;font-size:12px;">${item.description ?? ""}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 10px;text-align:right;font-size:12px;">${(item.quantity ?? 0).toLocaleString()}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 10px;text-align:right;font-size:12px;font-weight:600;">
          ${(item.supply_amount ?? 0).toLocaleString()}원
        </td>
        <td style="border:1px solid #e2e8f0;padding:8px 10px;text-align:right;font-size:12px;">
          ${item.tax_amount > 0 ? (item.tax_amount).toLocaleString() + "원" : "-"}
        </td>
        <td style="border:1px solid #e2e8f0;padding:8px 10px;font-size:12px;">${item.memo ?? ""}</td>
      </tr>`
    )
    .join("");

  // ── 이메일 HTML 본문 ──
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${year}년 ${month}월 거래명세서</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Malgun Gothic',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 0;">
  <tr><td align="center">
  <table width="640" cellpadding="0" cellspacing="0"
    style="max-width:640px;width:100%;background:#fff;border-radius:14px;overflow:hidden;
           box-shadow:0 6px 32px rgba(0,0,0,0.12);">

    <!-- ① 헤더 -->
    <tr>
      <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:32px 40px;text-align:center;">
        <p style="color:#fff;font-size:24px;font-weight:900;letter-spacing:6px;margin:0 0 6px;">
          거 래 명 세 서
        </p>
        <p style="color:#93c5fd;font-size:14px;margin:0;">${year}년 ${month}월</p>
      </td>
    </tr>

    <!-- ② 인사말 -->
    <tr>
      <td style="padding:28px 40px 20px;">
        <p style="font-size:15px;color:#1e293b;margin:0 0 8px;">
          안녕하세요, <strong>${clientName}</strong> 귀중
        </p>
        <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0;">
          ${year}년 ${month}월 거래명세서를 첨부하여 보내드립니다.<br>
          확인하신 후 문의 사항이 있으시면 언제든지 연락 주시기 바랍니다.
        </p>
      </td>
    </tr>

    <!-- ③ 거래명세서 이미지 (CID 첨부) -->
    ${
      imageBase64
        ? `<tr>
        <td style="padding:0 40px 20px;">
          <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;text-align:center;">
            <img src="cid:${CID}" alt="거래명세서"
              style="max-width:100%;display:block;margin:0 auto;" />
          </div>
        </td>
      </tr>`
        : ""
    }

    <!-- ④ 상세 내역 테이블 -->
    <tr>
      <td style="padding:0 40px 24px;">
        <p style="font-size:13px;font-weight:700;color:#334155;margin:0 0 10px;">
          ■ 거래 상세 내역
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#1e40af;">
              <th style="border:1px solid #1e3a8a;padding:9px 10px;color:#fff;text-align:center;width:5%;">NO</th>
              <th style="border:1px solid #1e3a8a;padding:9px 10px;color:#fff;text-align:left;">품명/규격</th>
              <th style="border:1px solid #1e3a8a;padding:9px 10px;color:#fff;text-align:right;width:8%;">수량</th>
              <th style="border:1px solid #1e3a8a;padding:9px 10px;color:#fff;text-align:right;width:16%;">공급가액</th>
              <th style="border:1px solid #1e3a8a;padding:9px 10px;color:#fff;text-align:right;width:12%;">세액</th>
              <th style="border:1px solid #1e3a8a;padding:9px 10px;color:#fff;text-align:left;width:14%;">비고</th>
            </tr>
          </thead>
          <tbody>
            ${
              itemRows ||
              `<tr><td colspan="6" style="border:1px solid #e2e8f0;padding:16px;text-align:center;color:#94a3b8;">
                내역 없음
              </td></tr>`
            }
          </tbody>
          <tfoot>
            <tr style="background:#f1f5f9;font-weight:700;">
              <td colspan="3" style="border:1px solid #cbd5e1;padding:10px 10px;text-align:center;">합 계</td>
              <td style="border:1px solid #cbd5e1;padding:10px 10px;text-align:right;">
                ${Number(supplyTotal).toLocaleString()}원
              </td>
              <td style="border:1px solid #cbd5e1;padding:10px 10px;text-align:right;">
                ${Number(taxTotal).toLocaleString()}원
              </td>
              <td style="border:1px solid #cbd5e1;padding:10px 10px;"></td>
            </tr>
          </tfoot>
        </table>
      </td>
    </tr>

    <!-- ⑤ 합계 금액 박스 -->
    <tr>
      <td style="padding:0 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="background:#1e40af;border:1px solid #1e3a8a;padding:14px 20px;
                       color:#fff;font-size:14px;font-weight:900;width:38%;">
              합 계 금 액
            </td>
            <td style="background:#dbeafe;border:1px solid #1e3a8a;border-left:none;
                       padding:14px 20px;font-size:20px;font-weight:900;color:#1e40af;">
              ₩ ${Number(grandTotal).toLocaleString()}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ⑥ 구분선 -->
    <tr><td style="padding:0 40px;">
      <hr style="border:none;border-top:2px solid #e2e8f0;margin:0;">
    </td></tr>

    <!-- ⑦ 감사 메시지 & 슬로건 & 연락처 -->
    <tr>
      <td style="padding:28px 40px 32px;text-align:center;background:#f8fafc;">
        <p style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 8px;">
          이번달도 세계로지스와 함께해주셔서 감사합니다.
        </p>
        <p style="font-size:13px;color:#475569;font-style:italic;margin:0 0 20px;">
          29년의 한결같음으로 귀사의 물류를 책임집니다.
        </p>
        <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.8;">
          ${supplierPhone ? `☎ &nbsp;${supplierPhone}` : ""}
          ${supplierPhone && supplierEmail ? "&nbsp;&nbsp;|&nbsp;&nbsp;" : ""}
          ${supplierEmail ? `✉ &nbsp;${supplierEmail}` : ""}
        </p>
        <p style="font-size:11px;color:#cbd5e1;margin:12px 0 0;">
          본 메일은 ${supplierName}에서 발송된 자동 메일입니다.
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

  // ── Nodemailer 트랜스포터 ──
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  // ── 첨부 파일 (CID 인라인 이미지) ──
  type Attachment = Parameters<typeof transporter.sendMail>[0]["attachments"] extends (infer T)[] | undefined ? T : never;
  const attachments: Attachment[] = [];
  if (imageBase64) {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    attachments.push({
      filename: `거래명세서_${clientName}_${billingMonth}.png`,
      content: Buffer.from(base64Data, "base64"),
      cid: CID,
      contentType: "image/png",
    });
  }

  try {
    await transporter.sendMail({
      from: `"${supplierName}" <${gmailUser}>`,
      to,
      subject: `[${supplierName}] ${year}년 ${month}월 거래명세서 - ${clientName}`,
      html,
      attachments,
    });

    return res.status(200).json({ ok: true, message: "이메일이 성공적으로 발송되었습니다." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sendMail] error:", message);
    return res.status(500).json({ error: `이메일 발송 실패: ${message}` });
  }
}
