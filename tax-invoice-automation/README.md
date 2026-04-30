# 세계로지스 세금계산서 자동화 툴

한메일에서 포워딩된 세금계산서 메일을 자동으로 읽어  
보안 링크를 열고, 사업자번호를 입력 후 화면을 캡처하고  
추출된 데이터를 JSON으로 저장합니다.

---

## 📁 파일 구조

```
tax-invoice-automation/
├── main.py               ← 유일한 CLI 진입점 (1회 수집 / --server / --test / --check-google)
├── api_server.py         ← FastAPI 앱 (main.py --server 가 로드)
├── pipeline.py           ← 이메일 → 브라우저 → Firestore tax_invoices (관리자 동기화)
├── config.py             ← 설정 (IMAP, 사업자번호, Firebase …)
├── email_reader.py       ← IMAP (한메일·Gmail 등)
├── browser_automation.py ← Playwright
├── data_extractor.py     ← OCR·파싱·JSON
├── firebase_writer.py    ← Firestore + Storage (관리자 페이지 데이터 소스)
├── requirements.txt      ← 필요 패키지
├── output/               ← 저장 결과 (자동 생성)
│   └── {년}/{월}/{발신자}/
│       ├── 01_initial.png
│       ├── 02_after_input.png
│       ├── 03_final.png
│       └── {날짜}_{문서번호}.json
└── logs/                 ← 실행 로그 (자동 생성)
```

---

## ⚙️ 최초 설치

```bash
# 1. 패키지 설치
pip install -r requirements.txt

# 2. Playwright 브라우저 설치
playwright install chromium
```

---

## 🔧 설정 방법 (환경 변수)

비밀번호·서비스 계정 경로는 **코드에 넣지 않습니다.**  
`tax-invoice-automation/.env.example` 를 참고해 환경 변수를 설정하세요.

| 변수 | 설명 |
|------|------|
| `TAX_IMAP_EMAIL` / `TAX_IMAP_APP_PASSWORD` | **IMAP** (한메일·Gmail 등, 앱 비밀번호). **Gmail REST API 미사용** |
| `TAX_GOOGLE_CREDENTIALS_PATH` 또는 `GOOGLE_APPLICATION_CREDENTIALS` | Firebase 서비스 계정 JSON 경로 |
| `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, `FIREBASE_STORAGE_BUCKET` | (선택) 기본값은 config 내 프로젝트 |
| `TAX_BUSINESS_NUMBER`, `TAX_COMPANY_NAME` 등 | (선택) 사업자·상호 표기 |
| `TAX_EMAIL_DAYS_LIMIT`, `TAX_IMAP_FOLDERS` | (선택) 조회 일수·IMAP 폴더 |

발신자 허용·제목 키워드 등은 `config.py` 의 `EMAIL_FILTER` 에서 조정합니다.

---

## 세계로지스.com 관리자 연동

수집 결과는 **Firestore `tax_invoices`** 와 Storage에 저장됩니다. 웹 관리자는 **같은 Firebase 프로젝트·같은 Firestore database ID**(`firebase-applet-config.json` 의 `firestoreDatabaseId`)로 실시간 구독합니다. 별도 HTTP 전송 단계는 없습니다.

---

## Google / Firebase 점검

```bash
python main.py --check-google   # 서비스 계정·project·database·IMAP 요약
python main.py --test            # IMAP + Firebase + Sheets 실연결 테스트
```

`--check-google` 은 **Gmail API** 를 호출하지 않습니다. 메일 수집은 **IMAP 전용**입니다.

---

## ▶️ 실행 방법

```bash
# 이메일 자동 수집 + 처리 + Firestore tax_invoices (관리자 반영)
python main.py

# Cloud Run 컨테이너 (FastAPI + 스케줄러)
python main.py --server

# 특정 URL 직접 처리 (테스트용)
python main.py --url "https://세금계산서링크주소"

# 연결 테스트
python main.py --test
python main.py --check-google
```

---

## 📊 출력 결과

### 스크린샷
- `01_initial.png` : 링크 열었을 때 초기 화면
- `02_after_input.png` : 사업자번호 입력 후
- `03_final.png` : 최종 세금계산서 화면
- `04_fullpage.png` : 전체 페이지 캡처 (긴 페이지의 경우)

### JSON 데이터
```json
{
  "invoice_data": {
    "invoice_number": "20240101-12345678",
    "issue_date": "2024-01-01",
    "supply_amount": 1000000,
    "tax_amount": 100000,
    "total_amount": 1100000,
    "supplier": {
      "name": "공급사명",
      "business_number": "123-45-67890"
    },
    "buyer": {
      "name": "세계로지스",
      "business_number": "141-81-42581"
    },
    "items": [...]
  },
  "screenshots": ["경로/01_initial.png", ...],
  "url": "https://...",
  "success": true
}
```

---

## ❗ 주의사항

1. **Gmail 앱 비밀번호** 필요 (일반 비밀번호 아님)
   - Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호에서 발급

2. **한메일 → Gmail 포워딩** 설정 필요
   - 한메일(Daum) → 환경설정 → 메일 관리 → 다른 메일로 전달

3. **세금계산서 사이트별 선택자** 조정 필요
   - `config.py`의 `SITE_SELECTORS` 에서 실제 사이트 구조에 맞게 수정

4. **첫 실행 시** `headless: False` 로 설정하여 브라우저 동작 확인 권장

---

## ☁️ Google Cloud Run 배포 (세금계산서 API)

호스팅은 Vercel이어도, **이 봇(API+스케줄러)** 은 Cloud Run 컨테이너로 올리는 구성입니다.

1. **이미지**: `tax-invoice-automation/Dockerfile` 기준 빌드 → Artifact Registry push  
2. **배포**: GitHub Actions `.github/workflows/deploy.yml` 의 `push`/`workflow_dispatch` 가 `gcloud run deploy` 실행  
3. **환경 변수**: `cloudrun-env.example` 참고. 특히 다음이 필터 동작을 좌우합니다.
   - `TAX_EMAIL_SINCE_MIN` — **수신일·IMAP SINCE 하한**(예: `2026-04-10`). 빈 값이면 하한 없음.
   - `TAX_MAIL_LOOKBACK_DAYS` — 최근 N일과 하한의 **max** 로 실제 창 시작일 계산(옛날 스팸 방지).
   - `TAX_INVOICE_SUBJECT_STRICT=true` — 원콜·24시콜·화물맨·로지노트·`tax`+숫자·`@taxNN.` 만 허용(영문 단독 `tax` 제외).
4. **수동 수집**: `POST /api/run` + 헤더 `X-Tax-Collect-Secret: (TAX_COLLECT_SECRET 와 동일)`

로컬에서 이미지만 빌드해 볼 때:
```bash
cd tax-invoice-automation
docker build -t tax-bot:local .
```
