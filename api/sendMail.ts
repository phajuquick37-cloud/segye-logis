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

interface MailPayload {
  to: string;
  clientName: string;
  billingMonth: string;
  imageBase64?: string;       // html2canvas 로 캡처한 거래명세서 이미지(표 본문)
  /** 하위 호환: 클라이언트는 보낼 수 있으나 메일 본문에는 사용하지 않음(명세는 이미지로만) */
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
    grandTotal = 0,
    supplierName  = "세계로지스",
    supplierPhone = "031-000-0000",
    supplierEmail = "",
  }: MailPayload = req.body ?? {};

  if (!to || !clientName || !billingMonth) {
    return res.status(400).json({ error: "필수 파라미터 누락 (to, clientName, billingMonth)" });
  }

  const gmailUser = (process.env.GMAIL_USER || "").trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  if (!gmailUser || !gmailPass) {
    return res.status(500).json({
      error: "서버 환경 변수(GMAIL_USER, GMAIL_APP_PASSWORD)가 설정되지 않았습니다.",
    });
  }

  const [year, month] = billingMonth.split("-");
  const CID = "statement@segye-logis";
  const fileSafe = String(clientName)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_");
  const pngFilename = `거래명세서_원본_${fileSafe}_${billingMonth}.png`;
  // 인라인(CID)과 첨부는 동일 바이트 — 첨부로 열면 대부분 메일 앱에서 원본 크기로 볼 수 있음
  const cidRef = `cid:${CID}`;

  // ── 이메일 HTML 본문: 품목별 HTML 테이블(거래 상세)은 넣지 않음, 캡처 이미지 + 합계만 ──
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
  <table width="800" cellpadding="0" cellspacing="0"
    style="max-width:800px;width:100%;background:#fff;border-radius:14px;overflow:hidden;
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

    <!-- ③ 거래명세서 이미지 (CID 인라인 + 동일 파일 첨부로 원본 보기) -->
    ${
      imageBase64
        ? `<tr>
        <td style="padding:0 32px 12px;">
          <p style="font-size:12px;color:#64748b;margin:0 0 10px;line-height:1.5;">
            아래 <strong>이미지를 클릭</strong>하면 원본으로 열릴 수 있습니다(메일 앱에 따라 다를 수 있음).<br>
            작게만 보이면 이메일 <strong>첨부 PNG</strong>를 열어 원본 크기로 확인하세요.
          </p>
          <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;text-align:center;
                      background:#f8fafc;">
            <a href="${cidRef}" style="text-decoration:none;display:block;line-height:0;" title="원본 보기">
              <img src="${cidRef}" alt="거래명세서 — 클릭하여 원본 보기" width="794"
                style="max-width:100%;width:100%;height:auto;display:block;margin:0 auto;border:0;outline:0;" />
            </a>
          </div>
        </td>
      </tr>`
        : ""
    }

    <!-- ④ 합계 금액 박스 (명세는 위 이미지에 포함) -->
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

  // ── Nodemailer 트랜스포터 (Gmail: service / 한메일·다음: smtp.daum.net) ──
  const lowerUser = gmailUser.toLowerCase();
  const isDaumFamily =
    lowerUser.endsWith("@daum.net") || lowerUser.endsWith("@hanmail.net");
  const transporter = nodemailer.createTransport(
    isDaumFamily
      ? {
          host: "smtp.daum.net",
          port: 465,
          secure: true,
          auth: { user: gmailUser, pass: gmailPass },
        }
      : {
          service: "gmail",
          auth: { user: gmailUser, pass: gmailPass },
        }
  );

  // ── 첨부 파일 (CID 인라인 이미지) ──
  type Attachment = Parameters<typeof transporter.sendMail>[0]["attachments"] extends (infer T)[] | undefined ? T : never;
  const attachments: Attachment[] = [];
  if (imageBase64) {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const pngBuf = Buffer.from(base64Data, "base64");
    attachments.push({
      filename: `거래명세서_${fileSafe}_${billingMonth}.png`,
      content: pngBuf,
      cid: CID,
      contentType: "image/png",
    });
    attachments.push({
      filename: pngFilename,
      content: pngBuf,
      contentType: "image/png",
    });
  }

  try {
    const info = await transporter.sendMail({
      from: `"${supplierName}" <${gmailUser}>`,
      to,
      subject: `[${supplierName}] ${year}년 ${month}월 거래명세서 - ${clientName}`,
      html,
      attachments,
    });

    return res.status(200).json({
      ok: true,
      message: "이메일이 성공적으로 발송되었습니다.",
      messageId: info.messageId || undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sendMail] error:", message);
    return res.status(500).json({ error: `이메일 발송 실패: ${message}` });
  }
}
