import { createRoot } from "react-dom/client";
import { createRef, type RefObject } from "react";
import { DocumentBody } from "../components/settlement/StatementModal";
import { captureStatementToCanvas, captureStatementDataUrlForEmail } from "./statementCapture";
import type { SettlementItem, StatementArRecord, StatementClientProfile } from "../types/statement";

/**
 * 화면 밖에서 DocumentBody 를 렌더 후 PNG base64(data URL)로 캡처.
 * 일괄 메일 등 React 훅 없이 순차 발송할 때 사용.
 */
export async function captureStatementPngDataUrl(
  record: StatementArRecord,
  items: SettlementItem[],
  profile: StatementClientProfile | null,
  options?: { scale?: number; /** 메일 전송용: JPEG·축소로 API 본문 한도 회피 */ forEmail?: boolean }
): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-12000px;top:0;z-index:-1;pointer-events:none;";
  document.body.appendChild(host);
  const ref: RefObject<HTMLDivElement | null> = createRef();
  const root = createRoot(host);

  await new Promise<void>((resolveMount) => {
    root.render(
      <DocumentBody ref={ref} record={record} items={items} profile={profile} />
    );
    requestAnimationFrame(() => requestAnimationFrame(() => resolveMount()));
  });
  let el = ref.current;
  for (let i = 0; i < 60 && !el; i++) {
    await new Promise<void>((r) => setTimeout(r, 16));
    el = ref.current;
  }
  if (!el) {
    root.unmount();
    host.remove();
    throw new Error("거래명세표 캡처용 노드를 찾을 수 없습니다.");
  }

  try {
    if (options?.forEmail) {
      return await captureStatementDataUrlForEmail(el);
    }
    const canvas = await captureStatementToCanvas(el, { scale: options?.scale ?? 2 });
    return canvas.toDataURL("image/png", 0.92);
  } finally {
    root.unmount();
    host.remove();
  }
}
