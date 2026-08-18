# MUBiS Automation - Docker imajı
FROM python:3.11-slim

# Sistem bağımlılıkları (Playwright + OCR için)
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libgtk-3-0 \
    tesseract-ocr \
    tesseract-ocr-tur \
    poppler-utils \
    fonts-liberation \
    fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Playwright tarayıcılarını önceden yükle
RUN pip install playwright==1.45.0 && playwright install chromium

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# İndirme klasörü
RUN mkdir -p /app/downloads

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
