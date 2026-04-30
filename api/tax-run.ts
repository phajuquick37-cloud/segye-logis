import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Admin.tsx 의 ADMIN_EMAILS 와 동기화 */
const ADMIN_EMAILS = new Set<string>(["phajuquick37@gmail.com", "staff@segyelogis.com"]);

/** 웹 클라이언트 firebase 설정과 동일한 공개 Web API 키(이미 번들에 포함됨). Vercel 번들에서 JSON import 실패를 피하기 위해 상수 사용. */
const FIREBASE_WEB_API_KEY_FALLBACK = "AIzaSyDHdqrSUeoTlBTL_AgDC1snFxc_LTIc9Hs";

function getFirebaseWebApiKey(): string {
  return (
    (process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || "").trim() ||
    FIREBASE_WEB_API_KEY_FALLBACK
  );
}

/** BOM·CR 제거 후 trim — Vercel/메모에서 복사 시 흔한 불일치 방지 */
function normalizeEnvSecret(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
}

/** 스킴 없이 호스트만 넣은 값(예: xxx.a.run.app)도 파싱되게 */
function prependHttpsIfMissing(raw: string): string {
  let s = raw.trim().replace(/^\uFEFF/, "");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  // 호스트 형태로 보일 때만 — 그 외는 그대로 두어 URL() 실패 경로 유지
  if (/^[a-z0-9[\]]/i.test(s) && (s.includes(".") || s.includes("localhost"))) {
    return `https://${s.replace(/^\/+/, "")}`;
  }
  return s;
}

/**
 * Cloud Run 베이스만 남김(스킴+호스트+[선택 경로]).
 * · (https://…), 따옴표 제거
 * · 끝에 /api/run 또는 /api 를 실수로 넣은 경우 제거 — 이후 코드에서 /api/run 을 한 번만 붙임
 */
function normalizeAutomationBaseUrl(raw: string): string {
  let s = prependHttpsIfMissing(raw);
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
    s = prependHttpsIfMissing(s);
  }
  while (s.startsWith("(") && s.endsWith(")")) {
    s = s.slice(1, -1).trim();
    s = prependHttpsIfMissing(s);
  }
  s = s.replace(/\/$/, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    let pathOnly = u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/$/, "") : "";
    pathOnly = pathOnly.replace(/\/api\/run$/i, "").replace(/\/api$/i, "");
    return `${u.origin}${pathOnly}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** 수동 수집 단일 엔드포인트 — base 에 /api/run 포함 여부와 무관하게 한 번만 조합 */
function cloudRunManualRunUrl(baseNormalized: string): string {
  const b = baseNormalized.replace(/\/$/, "");
  if (/\/api\/run$/i.test(b)) return b;
  return `${b}/api/run`;
}

/** FastAPI detail은 문자열·객체·배열일 수 있음 — 항상 사람이 읽을 문자열로 */
function formatCloudRunErrorBody(body: { detail?: unknown; message?: unknown }): string {
  const d = body.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg ?? item);
        }
        return String(item);
      })
      .filter(Boolean)
      .join(" ");
  }
  if (d != null && typeof d === "object") {
    if ("msg" in d && (d as { msg?: unknown }).msg != null) return String((d as { msg: unknown }).msg);
    try {
      return JSON.stringify(d);
    } catch {
      return String(d);
    }
  }
  if (typeof body.message === "string" && body.message) return body.message;
  return "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      if (req.method === "OPTIONS") return res.status(200).end();
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const authz = (req.headers.authorization || "").trim();
    const m = authz.match(/^Bearer\s+(.+)$/i);
    const idToken = m ? m[1] : "";
    if (!idToken) {
      return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    const key = getFirebaseWebApiKey();
    if (!key) {
      return res.status(500).json({ error: "Firebase Web API 키를 찾을 수 없습니다." });
    }

    const verify = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );

    let lookup: { users?: { email?: string }[]; error?: { message?: string } };
    try {
      lookup = (await verify.json()) as { users?: { email?: string }[]; error?: { message?: string } };
    } catch {
      return res.status(502).json({ error: "토큰 검증 응답을 읽을 수 없습니다." });
    }

    if (!verify.ok) {
      const msg = lookup.error?.message || "세션이 유효하지 않습니다. 다시 로그인하세요.";
      return res.status(401).json({ error: msg });
    }

    const email = (lookup.users?.[0]?.email || "").toLowerCase();
    if (!email || !ADMIN_EMAILS.has(email)) {
      return res.status(403).json({ error: "권한이 없습니다." });
    }

    // 대시보드에서 자주 바꾸는 VITE_* 를 우선 — 예전 TAX_AUTOMATION_* 만 남아 있으면 구 URL이 먼저 쓰이던 문제 방지
    const baseRaw =
      process.env.VITE_TAX_AUTOMATION_URL ||
      process.env.TAX_AUTOMATION_URL ||
      "";
    const base = normalizeAutomationBaseUrl(baseRaw);
    if (!base) {
      return res.status(500).json({
        error:
          "VITE_TAX_AUTOMATION_URL(또는 TAX_AUTOMATION_URL)이 없거나 URL 형식이 잘못되었습니다. 베이스만. 시크릿은 VITE_TAX_AUTOMATION_SECRET 등 Cloud Run TAX_COLLECT_SECRET 과 동일하게",
      });
    }

    /** Cloud Run `TAX_COLLECT_SECRET` 과 동일 값 — VITE 로 바꾼 비밀값이 먼저 적용되게 순서 유지 */
    const secret = [
      process.env.VITE_TAX_AUTOMATION_SECRET,
      process.env.VITE_TAX_COLLECT_SECRET,
      process.env.TAX_AUTOMATION_SECRET,
      process.env.TAX_COLLECT_SECRET,
    ]
      .map((x) => (x == null ? "" : normalizeEnvSecret(String(x))))
      .find((x) => x.length > 0) ?? "";

    const headers: Record<string, string> = { Accept: "application/json" };
    if (secret) headers["X-Tax-Collect-Secret"] = secret;

    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 60_000);
    let r: Response;
    try {
      r = await fetch(cloudRunManualRunUrl(base), {
        method: "POST",
        headers,
        signal: ac.signal,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return res.status(502).json({ error: `Cloud Run 연결 실패: ${err}` });
    } finally {
      clearTimeout(to);
    }

    const text = await r.text();
    let body: { detail?: unknown; message?: unknown } = {};
    try {
      body = text ? (JSON.parse(text) as { detail?: unknown; message?: unknown }) : {};
    } catch {
      body = { message: text };
    }
    if (!r.ok) {
      let msg = formatCloudRunErrorBody(body) || r.statusText || "수집 요청 실패";
      const bodyStatus =
        typeof (body as { status?: unknown }).status === "string"
          ? String((body as { status: string }).status).toLowerCase()
          : "";
      const busyByCode = r.status === 409 || r.status === 429;
      const busyByBody = bodyStatus === "busy" || bodyStatus === "already_running";
      const busyByText =
        /이미\s*세금계산서\s*수집이\s*진행|수집이\s*진행\s*중|실행\s*중|잠시\s*후\s*다시\s*시도|already\s*running|\bbusy\b/i.test(
          msg
        );
      if (busyByCode || busyByBody || busyByText) {
        return res.status(200).json({
          status: "busy",
          message:
            msg ||
            "이미 세금계산서 수집이 진행 중입니다. 잠시 후 목록을 확인해 주세요.",
        });
      }
      if (r.status === 401 && /인증/i.test(msg)) {
        msg += " — Vercel의 TAX_COLLECT_SECRET(또는 VITE_TAX_AUTOMATION_SECRET 등)이 Cloud Run TAX_COLLECT_SECRET·GitHub Actions 시크릿과 동일한지 확인하세요.";
      }
      return res.status(r.status).json({ error: msg });
    }
    const okMsg =
      typeof body.message === "string" && body.message
        ? body.message
        : "수집을 시작했습니다. 잠시 후 목록이 갱신됩니다.";
    const cloudStatus =
      typeof (body as { status?: unknown }).status === "string"
        ? String((body as { status: string }).status)
        : undefined;
    if (cloudStatus === "busy") {
      return res.status(200).json({ status: "busy", message: okMsg });
    }
    return res.status(200).json({ message: okMsg });
  } catch (e: unknown) {
    console.error("[api/tax-run]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (!res.headersSent) {
      return res.status(500).json({ error: `서버 오류: ${msg}` });
    }
    return undefined;
  }
}
