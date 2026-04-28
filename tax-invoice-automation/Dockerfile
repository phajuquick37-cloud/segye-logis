# Playwright 브라우저 OS 패키지는 수동 apt 목록(libasound2 이름 변경 등) 대신
# `playwright install-deps chromium` 이 현재 Debian에 맞는 목록을 씁니다.
FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Tesseract OCR + 한국어 (브라우저용 라이브러리는 다음 RUN에서 처리)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng \
    wget curl fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && (playwright install-deps chromium || playwright install-deps) \
    && playwright install chromium

COPY . .

RUN mkdir -p output logs

EXPOSE 8000

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
