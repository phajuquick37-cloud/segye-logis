#!/usr/bin/env bash
# Cloud Build 기본 SA에 Artifact Registry 저장소 'tax-automation'에 대한 Writer 권한 부여 (예시)
# 프로젝트 번호는 콘솔 또는: gcloud projects describe PROJECT --format='value(projectNumber)'
# 사용 전 PROJECT_NUMBER, PROJECT_ID, REGION, REPO_ID를 맞게 수정하세요.
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-gen-lang-client-0127550748}"
REGION="${AR_REGION:-asia-northeast3}"
REPO_ID="${AR_REPOSITORY_ID:-tax-automation}"
PROJECT_NUMBER="${GCP_PROJECT_NUMBER:-}"
if [[ -z "$PROJECT_NUMBER" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
fi

CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
RESOURCE="projects/${PROJECT_ID}/locations/${REGION}/repositories/${REPO_ID}"

echo "Project: $PROJECT_ID ($PROJECT_NUMBER)"
echo "Cloud Build SA: $CB_SA"
echo "AR resource: $RESOURCE"
echo
echo "Run ONE of the following (Organization policy may require console IAM instead):"
echo
echo "gcloud artifacts repositories add-iam-policy-binding ${REPO_ID} \\"
echo "  --location=${REGION} --project=${PROJECT_ID} \\"
echo "  --member=serviceAccount:${CB_SA} --role=roles/artifactregistry.writer"
echo
echo "Or at project level (broader):"
echo "gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
echo "  --member=serviceAccount:${CB_SA} --role=roles/artifactregistry.writer"
