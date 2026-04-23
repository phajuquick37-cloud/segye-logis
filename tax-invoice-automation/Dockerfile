# Ubuntu 기반 Playwright + Tesseract OCR 포함 이미지
FROM python:3.11-slim-bookworm

# 시스템 의존성 (Playwright + Tesseract + Korean)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Playwright 브라우저 실행 의존성
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 \
    libcairo2 libatspi2.0-0 libwayland-client0 \
    # Tesseract OCR + 한국어 언어팩
    tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng \
    # 기타
    wget curl fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright 브라우저 설치 (Chromium만)
RUN playwright install chromium

# 앱 소스 복사
COPY . .

# 출력 디렉토리 생성
RUN mkdir -p output logs

# 포트 노출 (FastAPI)
EXPOSE 8000

# 기본 실행: FastAPI 서버 (스케줄러 포함)
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
