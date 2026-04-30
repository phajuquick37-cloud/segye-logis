import { vercelApiUrl } from "./apiOrigin";

export type MailSendReportLine = { to: string; ok: boolean; detail: string };

/** 콤마·세미콜론·공백으로 구분된 메일 목록 파싱 */
export function splitMailAddresses(raw: string | undefined | null): string[] {
  return String(raw ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/** 거래명세 메일 API 호출 — HTTP·JSON 오류는 throw 대신 ok: false 로 반환 */
export async function postStatementMail(payload: Record<string, unknown>): Promise<MailSendReportLine> {
  const to = String(payload.to ?? "");
  try {
    const resp = await fetch(vercelApiUrl("/api/sendMail"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { ok?: boolean; message?: string; messageId?: string; error?: string };
    if (!resp.ok) {
      return { to, ok: false, detail: data.error ?? `HTTP ${resp.status}` };
    }
    const detail = data.messageId
      ? `서버 확인: ${data.message ?? "발송 완료"} (messageId: ${data.messageId})`
      : `서버 확인: ${data.message ?? "발송 완료"}`;
    return { to, ok: true, detail };
  } catch (e: unknown) {
    return { to, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
