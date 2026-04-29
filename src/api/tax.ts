/**
 * 세금계산서 수집(Cloud Run tax-automation) — 프론트에서 쓰는 상수·표시용 URL
 *
 * · **수집 실행(POST)** 은 항상 같은 오리진 **`/api/tax-run`** 만 호출합니다. (시크릿·Cloud Run 주소는 서버 `api/tax-run.ts` 에서만 처리)
 * · 서버에서는 **`VITE_TAX_AUTOMATION_URL` 을 `TAX_AUTOMATION_URL` 보다 우선**해 읽습니다. (대시보드에서 주로 고치는 값이 반영되게)
 * · 아래 `getTaxAutomationPublicBaseUrl` 은 표시·디버그용이며, 빌드 시점 `VITE_*` 가 박힙니다. URL을 바꿨으면 **Vercel 재배포**가 필요할 수 있습니다.
 */

/** Vercel 관리자 → Cloud Run 수동 수집 프록시 (항상 상대 경로만 사용) */
export const TAX_COLLECTION_PROXY_PATH = "/api/tax-run" as const;

/** 호스트만 넣은 경우(스킴 없음) 표시·파싱과 서버 normalize 와 맞춤 */
function prependHttpsIfMissing(raw: string): string {
  const s = raw.trim().replace(/^\uFEFF/, "");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (/^[a-z0-9[\]]/i.test(s) && (s.includes(".") || s.includes("localhost"))) {
    return `https://${s.replace(/^\/+/, "")}`;
  }
  return s;
}

/** URL 문자열에서 공백·슬래시·잘못 붙은 `/api/run` 접미사 제거 (표시용) */
function stripAutomationBaseDisplay(raw: string): string {
  let s = prependHttpsIfMissing(raw).replace(/\/$/, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    let p = u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/$/, "") : "";
    p = p.replace(/\/api\/run$/i, "").replace(/\/api$/i, "");
    return `${u.origin}${p}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

/**
 * Vercel `VITE_TAX_AUTOMATION_URL` 에만 의존하는 공개 Cloud Run 베이스(하드코딩 없음).
 * 빈 문자열이면 변수 미설정 또는 잘못된 형식.
 */
export function getTaxAutomationPublicBaseUrl(): string {
  const v = import.meta.env.VITE_TAX_AUTOMATION_URL;
  if (v == null || typeof v !== "string") return "";
  return stripAutomationBaseDisplay(v);
}
