/** 같은 출처가 Vercel이 아닐 때만(예: 외부 정적 호스팅) /api/sendMail · /api/tax-run 절대 URL 접두사. Vercel 단일 호스팅이면 비워 두면 됨. */
export function vercelApiUrl(apiPath: string): string {
  const trimmed = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const origin = (import.meta.env.VITE_VERCEL_API_ORIGIN || "").trim().replace(/\/$/, "");
  if (!origin) return trimmed;
  return `${origin}${trimmed}`;
}
