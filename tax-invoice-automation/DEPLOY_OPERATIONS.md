# 배포·운영 체크리스트 (GCP / GitHub / Cloud Run)

플랜과 동일한 순서입니다. **Google Cloud 콘솔**에는 **Firebase/이 프로젝트에 Owner·Editor 권한이 있는 본인의 Google(사람) 계정**으로 [console.cloud.google.com](https://console.cloud.google.com) 에 로그인합니다.  
서비스 계정(`...iam.gserviceaccount.com`)으로는 브라우저에 “로그인”하지 않습니다.  
세금 메일이 **Daum**이면 `TAX_IMAP_EMAIL`은 별도이며, 콘솔 로그인 계정과 다를 수 있습니다.

**프로젝트 ID:** `gen-lang-client-0127550748`  
**리전:** `asia-northeast3`  
**Artifact Registry Docker 저장소 ID:** `tax-automation`  
**Cloud Run 서비스:** `tax-automation`

---

## 1. GCP 로그인 및 프로젝트 선택

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 상단 프로젝트 선택기에서 **`gen-lang-client-0127550748`** 선택 (없으면 이 프로젝트에 초대받은 계정인지 확인)

---

## 2. API 사용 설정

다음 API를 켜 두어야 GitHub Actions의 `gcloud builds submit` / Cloud Run 배포가 동작합니다.

- Cloud Build API  
- Cloud Run API  
- Artifact Registry API  

**콘솔:** APIs & Services → Library → 각 API 검색 → **사용 설정**  

또는 로컬/Cloud Shell에서 [scripts/enable_gcp_apis.sh](scripts/enable_gcp_apis.sh) 실행 (권한 필요).

---

## 3. IAM (권한)

### 3.1 GitHub Actions에 쓰는 서비스 계정 (`GCP_SA_KEY` JSON의 주체)

최소한 다음이 있으면 빌드·배포 트리거에 유리합니다.

- `Cloud Build 편집자` (또는 `cloudbuild.builds.create` 등)
- `Cloud Run 관리자` (또는 `run.services.update` 등)
- `서비스 계정 사용자` (Cloud Build가 다른 SA로 이미지를 푸시할 때 필요할 수 있음)

### 3.2 Cloud Build 기본 서비스 계정 → Artifact Registry

이미지는 **Cloud Build 기본 SA**가 Artifact Registry로 푸시하는 경우가 많습니다.

- 주소 형식: **`PROJECT_NUMBER@cloudbuild.gserviceaccount.com`**
- `PROJECT_NUMBER`는 콘솔 **홈 대시보드** 또는 `gcloud projects describe gen-lang-client-0127550748 --format='value(projectNumber)'`
- **Artifact Registry** → 리전 `asia-northeast3` → 저장소 **`tax-automation`** → **권한** → 위 Cloud Build SA에 **Artifact Registry 작성자(Writer)**

자세한 `gcloud` 예시는 [scripts/grant_cloudbuild_ar_writer.sh](scripts/grant_cloudbuild_ar_writer.sh) 참고.

---

## 4. GitHub Actions

1. [Actions](https://github.com/phajuquick37-cloud/segye-logis/actions) → **Deploy to Cloud Run**
2. 최근 실패한 run이 있으면 **Re-run all jobs** (또는 `master`에 푸시하면 자동 실행)

워크플로 정의: [../.github/workflows/deploy.yml](../.github/workflows/deploy.yml)

---

## 5. Cloud Run 환경 변수

서비스 **tax-automation** → **수정 및 배포** → **변수 및 보안 비밀**

필수 예시는 [cloudrun-env.example](cloudrun-env.example) 파일을 참고하세요. (IMAP 계정·앱 비밀번호·세금 수집 시작일 등)

Firebase 서비스 계정 JSON은 **Secret Manager**에 올리고 Cloud Run에서 마운트하는 방식을 권장합니다. (리포지토리에 JSON을 넣지 마세요.)

---

## 6. 홈페이지(관리자) 확인

배포 후 앱 **Admin** 탭의 세금계산서 목록은 Firestore `tax_invoices`와 동기화됩니다.  
로컬에서 저장소의 `check_data.py`로 Firestore 건수를 확인할 수 있습니다.

---

## 배포 실패 시

해당 Run에서 **Cloud Build** 단계 로그의 영문 오류 메시지를 확인하면, API 미활성·IAM 부족·AR 권한 문제 등 원인을 바로 집을 수 있습니다.
