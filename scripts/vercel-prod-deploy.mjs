#!/usr/bin/env node
/**
 * Production 배포 (Vercel) — 인터랙티브 로그인 없이 토큰만 사용.
 * Windows에서 Vercel CLI가 한글 표시명 때문에 User-Agent 오류로 로그인 실패할 때 대안.
 *
 * 필요 환경변수:
 *   VERCEL_TOKEN       — https://vercel.com/account/tokens
 *   VERCEL_ORG_ID      — .vercel/project.json 의 orgId 또는 팀 ID
 *   VERCEL_PROJECT_ID  — 프로젝트 Settings → General
 *
 * 사용: npm run deploy:prod
 */
import { spawnSync } from "node:child_process";

const keys = ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"];
for (const k of keys) {
  if (!process.env[k]?.trim()) {
    console.error(`[deploy:prod] ${k} 환경변수가 없습니다.`);
    console.error("  PowerShell 예: $env:VERCEL_TOKEN='…'; $env:VERCEL_ORG_ID='…'; $env:VERCEL_PROJECT_ID='…'; npm run deploy:prod");
    console.error("  또는 GitHub → Actions → “Trigger Vercel Production” 을 workflow_dispatch 로 실행 (시크릿 설정 시).");
    process.exit(1);
  }
}

function run(args) {
  const r = spawnSync("npx", ["--yes", "vercel@latest", ...args], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0 && r.status != null) process.exit(r.status);
  if (r.error) throw r.error;
}

const tok = process.env.VERCEL_TOKEN;

run(["pull", "--yes", "--environment=production", "--token", tok]);
run(["build", "--prod", "--token", tok]);
run(["deploy", "--prebuilt", "--prod", "--token", tok]);

console.log("\n[deploy:prod] Production 배포 완료.");
