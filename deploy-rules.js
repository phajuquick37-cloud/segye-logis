/**
 * Firestore Security Rules 배포 스크립트
 * 실행: node deploy-rules.js <FIREBASE_TOKEN>
 *
 * 토큰 획득: firebase login:ci (브라우저에서 인증 후 출력되는 토큰 사용)
 */

const fs = require("fs");
const https = require("https");

const PROJECT_ID = "gen-lang-client-0127550748";
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error("사용법: node deploy-rules.js <firebase_ci_token>");
  console.error("토큰 획득: firebase login:ci");
  process.exit(1);
}

const rulesContent = fs.readFileSync("firestore.rules", "utf-8");

// 1. 새 Ruleset 생성
function postJSON(hostname, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request(
      {
        hostname,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try { resolve(JSON.parse(d)); }
          catch { resolve(d); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log("1. Ruleset 생성 중...");
  const ruleset = await postJSON(
    "firebaserules.googleapis.com",
    `/v1/projects/${PROJECT_ID}/rulesets`,
    { source: { files: [{ content: rulesContent, name: "firestore.rules" }] } },
    TOKEN
  );
  if (ruleset.error) { console.error("Ruleset 생성 실패:", ruleset.error); process.exit(1); }
  const rulesetName = ruleset.name;
  console.log("  생성됨:", rulesetName);

  // 2. (default) DB에 적용
  console.log("2. (default) DB에 규칙 적용 중...");
  const r1 = await postJSON(
    "firebaserules.googleapis.com",
    `/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
    { name: `projects/${PROJECT_ID}/releases/cloud.firestore`, rulesetName },
    TOKEN
  );
  console.log("  결과:", r1.error ?? "✅ (default) 적용 완료");

  // 3. named DB에도 적용
  const namedDb = "ai-studio-08ae3b29-6eb5-4e08-8bb0-f20ab80e5ffc";
  console.log("3. named DB에 규칙 적용 중...");
  const r2 = await postJSON(
    "firebaserules.googleapis.com",
    `/v1/projects/${PROJECT_ID}/releases/cloud.firestore%2F${namedDb}`,
    { name: `projects/${PROJECT_ID}/releases/cloud.firestore%2F${namedDb}`, rulesetName },
    TOKEN
  );
  console.log("  결과:", r2.error ?? "✅ named DB 적용 완료");
}

main();
