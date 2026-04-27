import type { VercelRequest, VercelResponse } from "@vercel/node";
import firebaseConfig from "../firebase-applet-config.json";

/** Admin.tsx 의 ADMIN_EMAILS 와 동기화 */
const ADMIN_EMAILS = new Set<string>(["phajuquick37@gmail.com", "staff@segyelogis.com"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const key = (firebaseConfig as { apiKey?: string }).apiKey;
  if (!key) {
    return res.status(500).json({ error: "Firebase 설정 오류" });
  }

  const verify = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
  );
  const lookup = (await verify.json()) as { users?: { email?: string }[]; error?: { message: string } };
  if (!verify.ok) {
    return res.status(401).json({ error: "세션이 유효하지 않습니다. 다시 로그인하세요." });
  }
  const email = (lookup.users?.[0]?.email || "").toLowerCase();
  if (!email || !ADMIN_EMAILS.has(email)) {
    return res.status(403).json({ error: "권한이 없습니다." });
  }

  const base = (process.env.TAX_AUTOMATION_URL || process.env.VITE_TAX_AUTOMATION_URL || "").replace(/\/$/, "");
  if (!base) {
    return res.status(500).json({
      error: "TAX_AUTOMATION_URL(또는 VITE_TAX_AUTOMATION_URL)이 Vercel 서버 환경 변수에 없습니다.",
    });
  }

  const secret = (process.env.TAX_AUTOMATION_SECRET || process.env.VITE_TAX_AUTOMATION_SECRET || "").trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (secret) headers["X-Tax-Collect-Secret"] = secret;

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 30_000);
  let r: Response;
  try {
    r = await fetch(`${base}/api/run`, { method: "POST", headers, signal: ac.signal });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return res.status(502).json({ error: `Cloud Run 연결 실패: ${err}` });
  } finally {
    clearTimeout(to);
  }

  const text = await r.text();
  let body: { detail?: string; message?: string } = {};
  try {
    body = text ? (JSON.parse(text) as { detail?: string; message?: string }) : {};
  } catch {
    body = { message: text };
  }
  if (!r.ok) {
    const detail = typeof body.detail === "string" ? body.detail : r.statusText;
    return res.status(r.status).json({ error: detail || "수집 요청 실패" });
  }
  return res.status(200).json({
    message: body.message || "수집을 시작했습니다. 잠시 후 목록이 갱신됩니다.",
  });
}
