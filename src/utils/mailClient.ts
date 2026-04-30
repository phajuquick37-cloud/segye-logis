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
    const raw = await resp.text();
    let data: { ok?: boolean; message?: string; messageId?: string; error?: string } = {};
    try {
      data = raw ? (JSON.parse(raw) as typeof data) : {};
    } catch {
      const snippet = raw.trim().slice(0, 320).replace(/\s+/g, " ");
      return {
        to,
        ok: false,
        detail:
          `서버가 JSON이 아닌 응답을 반환했습니다 (HTTP ${resp.status}).` +
          (snippet ? ` ${snippet}` : "") +
          (resp.status === 413
            ? " — 첨부(이미지)가 너무 클 수 있습니다. PNG 저장은 그대로 두고 메일은 JPEG·축소본을 씁니다."
            : ""),
      };
    }
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
