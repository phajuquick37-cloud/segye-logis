# 공식 이미지: 브라우저 바이너리 + OS 의존성 포함(수동 apt 목록 깨짐 방지).
# 태그: https://playwright.dev/python/docs/docker
FROM mcr.microsoft.com/playwright/python:v1.58.0-noble

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng \
    wget curl fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p output logs

EXPOSE 8000

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
