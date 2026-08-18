"""
OCR modülü - görsel tabanlı PDF'leri okumak için.
"""
from worker.parsers.pdf_parser import extract_text_from_pdf

# Şimdilik pdf_parser'daki OCR fonksiyonunu dışarıya aç
def ocr_pdf(pdf_path: str) -> str:
    return extract_text_from_pdf(pdf_path)
