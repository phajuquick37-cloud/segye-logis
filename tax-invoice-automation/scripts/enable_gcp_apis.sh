#!/usr/bin/env bash
# Cloud Shell 또는 gcloud 로그인된 환경에서 실행
# 사용: bash scripts/enable_gcp_apis.sh
set -euo pipefail
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-gen-lang-client-0127550748}"
# Cloud Build API는 .github/workflows/deploy.yml 이 docker 직접 푸시를 쓰면 필수가 아님
for api in \
  run.googleapis.com \
  artifactregistry.googleapis.com
do
  echo "Enabling $api ..."
  gcloud services enable "$api" --project="$PROJECT_ID"
done
echo "Done. Project: $PROJECT_ID"
