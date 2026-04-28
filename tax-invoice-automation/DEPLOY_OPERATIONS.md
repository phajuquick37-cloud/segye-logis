# 배포·운영 체크리스트 (GCP / GitHub / Cloud Run)

플랜과 동일한 순서입니다. **Google Cloud 콘솔**에는 **Firebase/이 프로젝트에 Owner·Editor 권한이 있는 본인의 Google(사람) 계정**으로 [console.cloud.google.com](https://console.cloud.google.com) 에 로그인합니다.  
서비스 계정(`...iam.gserviceaccount.com`)으로는 브라우저에 “로그인”하지 않습니다.  
세금 메일이 **Daum**이면 `TAX_IMAP_EMAIL`은 별도이며, 콘솔 로그인 계정과 다를 수 있습니다.

**프로젝트 ID:** `gen-lang-client-0127550748`  
**리전:** `asia-northeast3`  
**Artifact Registry Docker 저장소 ID:** `tax-automation`  
**Cloud Run 서비스:** `tax-automation`

### GitHub에 넣는 것 (딱 두 가지, 순서)

1. **[Settings → Secrets and variables → Actions](https://github.com/phajuquick37-cloud/segye-logis/settings/secrets/actions)** 로 이동합니다.
2. **`GCP_SA_KEY`**
   - **값:** GCP에서 만든 **서비스 계정 키 JSON 파일 전체** (파일을 열고 내용을 복사해 한 덩어리로 붙여 넣기)
   - **어디서 받나:** IAM → 서비스 계정 → 해당 SA → **키** 탭 → JSON 만들기(프로젝트 Owner가 한 번 만들어서 전달해도 됨)
   - 이 키의 `client_email`이 위 IAM(AR Writer, Run Admin 등)이 붙은 **그 서비스 계정**이어야 합니다.
3. **`TAX_COLLECT_SECRET`**
   - **값:** 앱 `TAX_COLLECT_SECRET`과 **같은** 임의의 긴 문자열(수동 수집 API·서버가 같은 비밀을 쓰게 하려면)
   - 워크플로가 Cloud Run에 `--set-env-vars=TAX_COLLECT_SECRET=...` 으로 넣습니다.

`GITHUB_TOKEN` 은 GitHub이 자동으로 주므로 **등록할 필요 없음**

---

## 1. GCP 로그인 및 프로젝트 선택

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 상단 프로젝트 선택기에서 **`gen-lang-client-0127550748`** 선택 (없으면 이 프로젝트에 초대받은 계정인지 확인)

---

## 2. API 사용 설정

다음 API를 켜 두어야 **GitHub Actions에서 `docker push`(Artifact Registry) + Cloud Run 배포**가 동작합니다. (이 저장소의 워크플로는 `gcloud builds submit`을 쓰지 않으므로 **Cloud Build API는 필수는 아님**.)

- Cloud Run API  
- Artifact Registry API  
- (선택) Cloud Build API — 이 워크플로에는 불필요

**콘솔:** APIs & Services → Library → 각 API 검색 → **사용 설정**  

또는 로컬/Cloud Shell에서 [scripts/enable_gcp_apis.sh](scripts/enable_gcp_apis.sh) 실행 (권한 필요).

---

## 3. IAM (권한)

### GitHub에 넣는 **하나**의 서비스 계정 (`GCP_SA_KEY` JSON “이 메일” 주소)

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)은 GitHub 러너에서 `docker build` → **Artifact Registry** `docker push` → **Cloud Run** `deploy` 를 **모두 이 SA 키로** 수행합니다.  
따라서 **콘솔에서 `...@cloudbuild.gserviceaccount.com`에 AR 쓰기 권한을 주는 식(구 방식)은 이 워크플로에 필요 없습니다.** 대신 `GCP_SA_KEY`에 해당하는 SA에 아래를 맞춥니다.

- **Artifact Registry 작성자** (`roles/artifactregistry.writer`) — **필수** — GitHub 워크플로가 `docker push` 로 `asia-northeast3-docker.pkg.dev/gen-lang-client-0127550748/tax-automation/...` 이미지를 올립니다. `GCP_SA_KEY`에 들어 있는 **그 서비스 계정**(JSON의 `client_email`)에 최소 다음 중 하나가 있어야 합니다. 없으면 **Actions에서 Docker 빌드는 성공했는데 Artifact Registry 푸시 단계만 실패**합니다.
  - 프로젝트 단위 부여 예 (Cloud Shell에서 본인 `client_email`으로 교체):
    ```bash
    gcloud projects add-iam-policy-binding gen-lang-client-0127550748 \
      --member="serviceAccount:GCP_SA_KEY의_client_email" \
      --role="roles/artifactregistry.writer"
    ```
  - 또는 저장소(`tax-automation`)만 타깃 IAM `artifactregistry.repositories.uploadArtifacts`(맞춤 역할 포함) 가능.
- **Cloud Run 관리자** (`roles/run.admin`) — 서비스 `tax-automation` 배포·갱신  
- **서비스 계정 사용자** (`roles/iam.serviceAccountUser`) — **배포 시 Cloud Run이 쓰는 런타임 SA**에 대해 (보통 `PROJECT_NUMBER-compute@developer.gserviceaccount.com` 등; `gcloud run deploy` 오류에 나오는 SA에 맞게 부여)

프로젝트 Owner/Editor는 아직 **한 번** 이 SA에 위 역할을 붙이거나(또는 팀이 키를 만들어 줌) 해야 합니다. 그 이후 **일상 배포는 GitHub Secrets의 키만** 쓰면 됩니다.

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

## 7. Vercel `TAX_AUTOMATION_URL` (관리자「지금 수집 실행」)

관리자의 `/api/tax-run` 이 Cloud Run `tax-automation`으로 프록시되려면 **Vercel**(Production)·**서버 함수** 용 변수가 필요합니다.

- **워크플로가 출력하는 실제 주소:** Actions → **Deploy to Cloud Run** 최신 Run → **Cloud Run 배포 주소 확인** 단계 또는 Summary 에 `https://…a.run.app` 가 표시됩니다 ([워크플로 정의](../.github/workflows/deploy.yml)).
- **자동 동기화:** GitHub **Repository secrets** 에 `VERCEL_TOKEN`(토큰) · `VERCEL_PROJECT_ID`(예: `prj_…` 또는 프로젝트 이름)·선택 `VERCEL_TEAM_ID`·선택 **`VERCEL_DEPLOY_HOOK`(재배포 훅 URL)** 을 추가하면, 배포 직후 `TAX_AUTOMATION_URL` / `VITE_TAX_AUTOMATION_URL` 이 위 URL로 갱신되고 배포 훅이 있으면 Vercel이 다시 빌드합니다.
- **수동:** Vercel → Project → **Settings → Environment Variables** 에 `TAX_AUTOMATION_URL` 을 같은 URL로 맞춘 뒤 **Deployments → Redeploy**.

---

## 배포 실패 시

해당 Run에서 **Docker — 빌드 후 Artifact Registry에 푸시** 또는 **Cloud Run 배포** 단계 로그의 영문 오류를 확인하면, API 미활성·`GCP_SA_KEY` SA의 IAM 부족·`iam.serviceAccountUser` 누락 등을 집을 수 있습니다.
