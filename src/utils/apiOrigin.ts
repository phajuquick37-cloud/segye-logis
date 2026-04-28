/** 메인 도메인이 Firebase Hosting일 때, Vercel에만 있는 /api/sendMail · /api/tax-run 호출용. */
export function vercelApiUrl(apiPath: string): string {
  const trimmed = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const origin = (import.meta.env.VITE_VERCEL_API_ORIGIN || "").trim().replace(/\/$/, "");
  if (!origin) return trimmed;
  return `${origin}${trimmed}`;
}
