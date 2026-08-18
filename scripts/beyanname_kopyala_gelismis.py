import os
import shutil
import re
from pathlib import Path
from datetime import datetime

# =============================================================================
# MUBiS ERP - Beyanname ve Vergi Levhasi Otomatik Kopyalama Scripti (Gelismis)
# =============================================================================
# Bu script, beyanname ve vergi levhasi dosyalarini ilgili musteri klasorlerine
# otomatik olarak kopyalar. Excel/CSV musteri listesi ile eslestirme yapabilir.
#
# KULLANIM:
# 1. Asagidaki KAYNAK ve HEDEF yollarini kendi sisteminize gore ayarlayin
# 2. Scripti calistirin: python beyanname_kopyala_gelismis.py
# =============================================================================

# KAYNAK KLASORLER (Kendi yollarinizi buraya yazin)
BEYANNAME_KAYNAK = r"G:\Drive'ım\BEYANNAME"
VERGI_LEVHASI_KAYNAK = r"G:\Drive'ım\2025 VERGİ LEVHALARI"

# HEDEF KLASOR (Musteri klasorlerinin bulundugu ana dizin)
HEDEF_ANA_DIZIN = r"G:\Drive'ım"

# Musteri listesi (Excel veya CSV) - Opsiyonel
# MUSTERI_LISTESI = r"G:\Drive'ım\musteri_listesi.xlsx"
MUSTERI_LISTESI = None

# Kopyalama log dosyasi
LOG_DOSYASI = r"G:\Drive'ım\kopyalama_log.txt"

# Eslestirme hassasiyeti (0-1 arasi, 1 = tam eslesme)
ESLESTIRME_ESIK = 0.6


def log_yaz(mesaj):
    """Log mesaji yaz"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_mesaj = f"[{timestamp}] {mesaj}"
    print(log_mesaj)
    with open(LOG_DOSYASI, 'a', encoding='utf-8') as f:
        f.write(log_mesaj + '\n')


def turkce_karakter_temizle(text):
    """Turkce karakterleri temizle"""
    replacements = {
        'ı': 'i', 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ö': 'o', 'ç': 'c',
        'İ': 'I', 'Ğ': 'G', 'Ü': 'U', 'Ş': 'S', 'Ö': 'O', 'Ç': 'C'
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def benzerlik_skoru(str1, str2):
    """Iki string arasindaki benzerlik skorunu hesapla (0-1)"""
    str1 = turkce_karakter_temizle(str1.lower())
    str2 = turkce_karakter_temizle(str2.lower())
    
    # Kelime bazli benzerlik
    kelimeler1 = set(re.findall(r'\w+', str1))
    kelimeler2 = set(re.findall(r'\w+', str2))
    
    if not kelimeler1 or not kelimeler2:
        return 0.0
    
    ortak = kelimeler1.intersection(kelimeler2)
    birlesim = kelimeler1.union(kelimeler2)
    
    return len(ortak) / len(birlesim)


def musteri_klasorlerini_bul(ana_dizin):
    """Ana dizindeki musteri klasorlerini bul"""
    musteriler = {}
    
    if not os.path.exists(ana_dizin):
        log_yaz(f"HATA: Ana dizin bulunamadi: {ana_dizin}")
        return musteriler
    
    for item in os.listdir(ana_dizin):
        item_yol = os.path.join(ana_dizin, item)
        if os.path.isdir(item_yol):
            musteri_adi = item.strip()
            musteriler[musteri_adi.lower()] = {
                'klasor': item,
                'yol': item_yol,
                'ad': musteri_adi
            }
    
    return musteriler


def musteri_listesini_yukle(dosya_yolu):
    """Excel veya CSV musteri listesini yukle"""
    musteriler = {}
    
    if not dosya_yolu or not os.path.exists(dosya_yolu):
        return musteriler
    
    try:
        import pandas as pd
        
        if dosya_yolu.endswith('.csv'):
            df = pd.read_csv(dosya_yolu)
        else:
            df = pd.read_excel(dosya_yolu)
        
        for _, row in df.iterrows():
            # Varsayilan kolon adlari: 'Sirket_Adi', 'Vergi_No', 'Klasor_Adi'
            sirket_adi = str(row.get('Sirket_Adi', row.get('sirket_adi', ''))).strip()
            vergi_no = str(row.get('Vergi_No', row.get('vergi_no', ''))).strip()
            klasor_adi = str(row.get('Klasor_Adi', row.get('klasor_adi', sirket_adi))).strip()
            
            if sirket_adi:
                musteriler[sirket_adi.lower()] = {
                    'ad': sirket_adi,
                    'vergi_no': vergi_no,
                    'klasor': klasor_adi
                }
        
        log_yaz(f"Musteri listesi yuklendi: {len(musteriler)} musteri")
    except Exception as e:
        log_yaz(f"Musteri listesi yuklenirken hata: {str(e)}")
    
    return musteriler


def musteri_eslestir(dosya_adi, musteriler):
    """Dosya adindan musteri eslestir - gelismis algoritma"""
    dosya_adi_lower = dosya_adi.lower()
    
    en_iyi_eslesme = None
    en_iyi_skor = 0
    
    for musteri_key, musteri_bilgi in musteriler.items():
        # Tam eslesme ara
        if musteri_key in dosya_adi_lower:
            skor = benzerlik_skoru(dosya_adi, musteri_key)
            if skor > en_iyi_skor:
                en_iyi_skor = skor
                en_iyi_eslesme = musteri_bilgi
        else:
            # Kismi eslesme
            skor = benzerlik_skoru(dosya_adi, musteri_key)
            if skor > en_iyi_skor and skor >= ESLESTIRME_ESIK:
                en_iyi_skor = skor
                en_iyi_eslesme = musteri_bilgi
    
    return en_iyi_eslesme


def dosyalari_kopyala(kaynak_dizin, hedef_alt_klasor, musteriler):
    """Dosyalari musteri klasorlerine kopyala"""
    if not os.path.exists(kaynak_dizin):
        log_yaz(f"HATA: Kaynak dizin bulunamadi: {kaynak_dizin}")
        return 0, []
    
    kopyalanan = 0
    eslestirilemeyen = []
    
    for dosya in os.listdir(kaynak_dizin):
        dosya_yol = os.path.join(kaynak_dizin, dosya)
        
        if not os.path.isfile(dosya_yol):
            continue
        
        # Musteri eslestir
        musteri = musteri_eslestir(dosya, musteriler)
        
        if musteri:
            # Hedef klasoru belirle
            if 'klasor' in musteri and os.path.exists(os.path.join(HEDEF_ANA_DIZIN, musteri['klasor'])):
                hedef_klasor = os.path.join(HEDEF_ANA_DIZIN, musteri['klasor'], hedef_alt_klasor)
            else:
                hedef_klasor = os.path.join(musteri['yol'], hedef_alt_klasor)
            
            os.makedirs(hedef_klasor, exist_ok=True)
            
            # Dosyayi kopyala
            hedef_yol = os.path.join(hedef_klasor, dosya)
            
            try:
                shutil.copy2(dosya_yol, hedef_yol)
                log_yaz(f"KOPYALANDI: {dosya} -> {musteri['ad']}/{hedef_alt_klasor}/")
                kopyalanan += 1
            except Exception as e:
                log_yaz(f"HATA: {dosya} kopyalanamadi: {str(e)}")
        else:
            eslestirilemeyen.append(dosya)
    
    return kopyalanan, eslestirilemeyen


def main():
    """Ana fonksiyon"""
    log_yaz("\n" + "=" * 70)
    log_yaz("MUBiS ERP - DOSYA KOPYALAMA SCRIPTI (GELISMIS)")
    log_yaz("=" * 70)
    
    # Musteri klasorlerini bul
    musteriler = musteri_klasorlerini_bul(HEDEF_ANA_DIZIN)
    log_yaz(f"Klasorlerden {len(musteriler)} musteri bulundu.")
    
    # Excel/CSV musteri listesi varsa yukle
    if MUSTERI_LISTESI:
        liste_musteriler = musteri_listesini_yukle(MUSTERI_LISTESI)
        musteriler.update(liste_musteriler)
        log_yaz(f"Toplam {len(musteriler)} musteri ile eslestirme yapilacak.")
    
    # Beyannameleri kopyala
    log_yaz("\n" + "-" * 70)
    log_yaz("BEYANNAME KOPYALAMA")
    log_yaz("-" * 70)
    kopyalanan_beyanname, eslestirilemeyen_beyanname = dosyalari_kopyala(
        BEYANNAME_KAYNAK, 'Beyannameler', musteriler
    )
    log_yaz(f"Toplam {kopyalanan_beyanname} beyanname dosyasi kopyalandi.")
    
    # Vergi levhalarini kopyala
    log_yaz("\n" + "-" * 70)
    log_yaz("VERGI LEVHASI KOPYALAMA")
    log_yaz("-" * 70)
    kopyalanan_vergi, eslestirilemeyen_vergi = dosyalari_kopyala(
        VERGI_LEVHASI_KAYNAK, 'Vergi Levhalari', musteriler
    )
    log_yaz(f"Toplam {kopyalanan_vergi} vergi levhasi dosyasi kopyalandi.")
    
    # Ozet
    log_yaz("\n" + "=" * 70)
    log_yaz("OZET")
    log_yaz("=" * 70)
    log_yaz(f"Kopyalanan beyanname: {kopyalanan_beyanname}")
    log_yaz(f"Kopyalanan vergi levhasi: {kopyalanan_vergi}")
    
    toplam_eslestirilemeyen = eslestirilemeyen_beyanname + eslestirilemeyen_vergi
    if toplam_eslestirilemeyen:
        log_yaz(f"\nEslestirilemeyen dosyalar ({len(toplam_eslestirilemeyen)} adet):")
        for dosya in toplam_eslestirilemeyen:
            log_yaz(f"  - {dosya}")
    
    log_yaz("\n" + "=" * 70)
    log_yaz("ISLEM TAMAMLANDI")
    log_yaz(f"Log dosyasi: {LOG_DOSYASI}")
    log_yaz("=" * 70)
    
    print(f"\nIslem tamamlandi!")
    print(f"Detaylar icin log dosyasini kontrol edin: {LOG_DOSYASI}")
    
    # Eslestirilemeyen dosyalar varsa kullaniciya sor
    if toplam_eslestirilemeyen:
        print(f"\nUYARI: {len(toplam_eslestirilemeyen)} dosya eslestirilemedi.")
        print("Bu dosyalari manuel olarak kontrol etmeniz gerekebilir.")


if __name__ == "__main__":
    main()
