/**
 * 세금계산서 수집(Cloud Run tax-automation) 연동
 *
 * · 브라우저는 절대 Cloud Run URL + 시크릿을 쓰지 않습니다.
 * · 항상 같은 오리진의 Vercel Serverless `/api/tax-run` 만 호출합니다.
 *   (서버에서 `TAX_AUTOMATION_*` / `TAX_COLLECT_SECRET` 으로 Cloud Run `POST …/api/run` 프록시)
 */
export const TAX_COLLECTION_PROXY_PATH = "/api/tax-run" as const;
