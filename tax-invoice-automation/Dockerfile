# https://playwright.dev/python/docs/docker — `install --with-deps` 가 OS 패키지 + 브라우저를 한 번에 맞춤
FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng \
    wget curl fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install chromium --with-deps

COPY . .

RUN mkdir -p output logs

# Cloud Run은 런타임에 PORT(기본 8080)를 주입 — 이 포트로 리슨해야 헬스체크 통과
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8080} --log-level info"]
