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

/** Vercel/쉘에서 값에 따옴표를 넣으면 그대로 저장되는 경우가 있어 제거 */
function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return t.slice(1, -1).trim();
  }
  return t;
}

function formatSmtpUserMessage(raw: string): string {
  if (/535|BadCredentials|Username and Password not accepted|Invalid login/i.test(raw)) {
    return (
      "Gmail 로그인이 거절되었습니다(535). 서버의 GMAIL_USER(전체 주소)와 GMAIL_APP_PASSWORD가 맞는지 확인하세요. " +
      "일반 Gmail 비밀번호는 SMTP에서 사용할 수 없습니다. 계정에 2단계 인증을 켠 뒤 " +
      "https://myaccount.google.com/apppasswords 에서 '메일'용 앱 비밀번호 16자를 새로 발급해 Vercel 환경 변수에 저장하세요(따옴표 없이)." +
      (raw.length ? ` 원문: ${raw.slice(0, 180)}` : "")
    );
  }
  return `이메일 발송 실패: ${raw}`;
}

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

  const gmailUser = stripOuterQuotes(process.env.GMAIL_USER || "").trim();
  const gmailPass = stripOuterQuotes(process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  if (!gmailUser || !gmailPass) {
    return res.status(500).json({
      error: "서버 환경 변수(GMAIL_USER, GMAIL_APP_PASSWORD)가 설정되지 않았습니다.",
    });
  }

  const lowerUserEarly = gmailUser.toLowerCase();
  const isDaumFamilyEarly =
    lowerUserEarly.endsWith("@daum.net") || lowerUserEarly.endsWith("@hanmail.net");
  if (!isDaumFamilyEarly) {
    if (gmailPass.length !== 16 || !/^[a-z0-9]{16}$/i.test(gmailPass)) {
      return res.status(500).json({
        error:
          "GMAIL_APP_PASSWORD 형식이 Google 앱 비밀번호와 다릅니다. 공백·따옴표를 제거한 뒤 영숫자 16자만 넣으세요. " +
          "일반 로그인 비밀번호는 사용할 수 없습니다. https://myaccount.google.com/apppasswords",
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmailUser)) {
      return res.status(500).json({
        error: "GMAIL_USER는 발송에 쓰는 Gmail 전체 주소(예: name@gmail.com)여야 합니다.",
      });
    }
  }

  const [year, month] = billingMonth.split("-");
  const CID = "statement@segye-logis";
  const fileSafe = String(clientName)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_");
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
            작게만 보이면 이메일 <strong>첨부 파일</strong>을 열어 원본 크기로 확인하세요.
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
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: { user: gmailUser, pass: gmailPass },
        }
  );

  // ── 첨부 파일 (CID 인라인 이미지) ──
  type Attachment = Parameters<typeof transporter.sendMail>[0]["attachments"] extends (infer T)[] | undefined ? T : never;
  const attachments: Attachment[] = [];
  if (imageBase64) {
    const mimeMatch = /^data:(image\/(?:png|jpe?g|webp));base64,/i.exec(imageBase64);
    const contentType = mimeMatch?.[1]?.toLowerCase() ?? "image/png";
    const ext =
      contentType === "image/jpeg" || contentType === "image/jpg"
        ? "jpg"
        : contentType === "image/webp"
          ? "webp"
          : "png";
    const base64Data = imageBase64.replace(/^data:image\/[\w+.-]+;base64,/i, "");
    const imgBuf = Buffer.from(base64Data, "base64");
    const attachNameMain = `거래명세서_${fileSafe}_${billingMonth}.${ext}`;
    attachments.push({
      filename: attachNameMain,
      content: imgBuf,
      cid: CID,
      contentType,
    });
    attachments.push({
      filename: `거래명세서_원본_${fileSafe}_${billingMonth}.${ext}`,
      content: imgBuf,
      contentType,
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
    return res.status(500).json({ error: formatSmtpUserMessage(message) });
  }
}
