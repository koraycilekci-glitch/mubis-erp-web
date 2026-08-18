import os
import shutil
import re
from pathlib import Path
from datetime import datetime

# =============================================================================
# MUBiS ERP - Beyanname ve Vergi Levhasi Otomatik Kopyalama Scripti
# =============================================================================
# Bu script, beyanname ve vergi levhasi dosyalarini ilgili musteri klasorlerine
# otomatik olarak kopyalar.
#
# KULLANIM:
# 1. Asagidaki KAYNAK ve HEDEF yollarini kendi sisteminize gore ayarlayin
# 2. Scripti calistirin: python beyanname_kopyala.py
# =============================================================================

# KAYNAK KLASORLER (Kendi yollarinizi buraya yazin)
BEYANNAME_KAYNAK = r"G:\Drive'ım\BEYANNAME"
VERGI_LEVHASI_KAYNAK = r"G:\Drive'ım\2025 VERGİ LEVHALARI"

# HEDEF KLASOR (Musteri klasorlerinin bulundugu ana dizin)
HEDEF_ANA_DIZIN = r"G:\Drive'ım"

# Kopyalama log dosyasi
LOG_DOSYASI = r"G:\Drive'ım\kopyalama_log.txt"


def log_yaz(mesaj):
    """Log mesaji yaz"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_mesaj = f"[{timestamp}] {mesaj}"
    print(log_mesaj)
    with open(LOG_DOSYASI, 'a', encoding='utf-8') as f:
        f.write(log_mesaj + '\n')


def musteri_klasorlerini_bul(ana_dizin):
    """Ana dizindeki musteri klasorlerini bul"""
    musteriler = {}
    
    if not os.path.exists(ana_dizin):
        log_yaz(f"HATA: Ana dizin bulunamadi: {ana_dizin}")
        return musteriler
    
    for item in os.listdir(ana_dizin):
        item_yol = os.path.join(ana_dizin, item)
        if os.path.isdir(item_yol):
            # Klasor adindan sirket adini cikar
            # Ornek: "ABC LTD" veya "12345678901_AHMET_YILMAZ"
            musteri_adi = item.strip()
            musteriler[musteri_adi.lower()] = {
                'klasor': item,
                'yol': item_yol,
                'ad': musteri_adi
            }
    
    return musteriler


def beyanname_turu_belirle(dosya_adi):
    """Dosya adindan beyanname turunu belirle"""
    dosya_adi_lower = dosya_adi.lower()
    
    turler = {
        'kdv': ['kdv', 'katma deger', 'katmadeger'],
        'muhtasar': ['muhtasar', 'muhtasir'],
        'gecici_vergi': ['gecici vergi', 'gecicivergi', 'gv', 'kv'],
        'gelir_beyani': ['gelir beyani', 'gelirbeyani', 'kurumlar vergi', 'kurumlarvergi'],
        'sgk': ['sgk', 'sosyal guvenlik', 'sosyalguvenlik', 'sigorta'],
        'poşet': ['poset', 'poşet', 'plastik'],
        'damga_vergisi': ['damga', 'damga vergisi'],
        'kurum_gecici': ['kurum gecici', 'kurumgecici'],
        'muhtasar_prim': ['muhtasar prim', 'muhtasarprim', 'prim hizmet', 'primhizmet'],
        'beyanname': ['beyanname', 'beyan']
    }
    
    for tur, anahtar_kelime in turler.items():
        for kelime in anahtar_kelime:
            if kelime in dosya_adi_lower:
                return tur
    
    return 'diger'


def musteri_eslestir(dosya_adi, musteriler):
    """Dosya adindan musteri eslestir"""
    dosya_adi_lower = dosya_adi.lower()
    
    # Once tam eslesme ara
    for musteri_key, musteri_bilgi in musteriler.items():
        if musteri_key in dosya_adi_lower:
            return musteri_bilgi
    
    # Kismi eslesme ara (kelime bazli)
    dosya_kelimeler = set(re.findall(r'\w+', dosya_adi_lower))
    
    en_iyi_eslesme = None
    en_iyi_skor = 0
    
    for musteri_key, musteri_bilgi in musteriler.items():
        musteri_kelimeler = set(re.findall(r'\w+', musteri_key))
        ortak_kelimeler = dosya_kelimeler.intersection(musteri_kelimeler)
        
        if len(ortak_kelimeler) > en_iyi_skor:
            en_iyi_skor = len(ortak_kelimeler)
            en_iyi_eslesme = musteri_bilgi
    
    # En az 2 ortak kelime olmali
    if en_iyi_skor >= 2:
        return en_iyi_eslesme
    
    return None


def beyanname_kopyala():
    """Beyanname dosyalarini musteri klasorlerine kopyala"""
    log_yaz("=" * 60)
    log_yaz("BEYANNAME KOPYALAMA ISLEMI BASLADI")
    log_yaz("=" * 60)
    
    # Musteri klasorlerini bul
    musteriler = musteri_klasorlerini_bul(HEDEF_ANA_DIZIN)
    log_yaz(f"Toplam {len(musteriler)} musteri klasoru bulundu.")
    
    if not os.path.exists(BEYANNAME_KAYNAK):
        log_yaz(f"HATA: Beyanname kaynak dizini bulunamadi: {BEYANNAME_KAYNAK}")
        return
    
    kopyalanan = 0
    eslestirilemeyen = []
    
    # Beyanname dosyalarini tara
    for dosya in os.listdir(BEYANNAME_KAYNAK):
        dosya_yol = os.path.join(BEYANNAME_KAYNAK, dosya)
        
        if not os.path.isfile(dosya_yol):
            continue
        
        # Musteri eslestir
        musteri = musteri_eslestir(dosya, musteriler)
        
        if musteri:
            # Hedef klasoru olustur
            beyanname_klasor = os.path.join(musteri['yol'], 'Beyannameler')
            os.makedirs(beyanname_klasor, exist_ok=True)
            
            # Dosyayi kopyala
            hedef_yol = os.path.join(beyanname_klasor, dosya)
            
            try:
                shutil.copy2(dosya_yol, hedef_yol)
                log_yaz(f"KOPYALANDI: {dosya} -> {musteri['ad']}/Beyannameler/")
                kopyalanan += 1
            except Exception as e:
                log_yaz(f"HATA: {dosya} kopyalanamadi: {str(e)}")
        else:
            eslestirilemeyen.append(dosya)
    
    log_yaz(f"\nToplam {kopyalanan} beyanname dosyasi kopyalandi.")
    
    if eslestirilemeyen:
        log_yaz(f"\nEslestirilemeyen dosyalar ({len(eslestirilemeyen)} adet):")
        for dosya in eslestirilemeyen:
            log_yaz(f"  - {dosya}")


def vergi_levhasi_kopyala():
    """Vergi levhasi dosyalarini musteri klasorlerine kopyala"""
    log_yaz("\n" + "=" * 60)
    log_yaz("VERGI LEVHASI KOPYALAMA ISLEMI BASLADI")
    log_yaz("=" * 60)
    
    # Musteri klasorlerini bul
    musteriler = musteri_klasorlerini_bul(HEDEF_ANA_DIZIN)
    
    if not os.path.exists(VERGI_LEVHASI_KAYNAK):
        log_yaz(f"HATA: Vergi levhasi kaynak dizini bulunamadi: {VERGI_LEVHASI_KAYNAK}")
        return
    
    kopyalanan = 0
    eslestirilemeyen = []
    
    # Vergi levhasi dosyalarini tara
    for dosya in os.listdir(VERGI_LEVHASI_KAYNAK):
        dosya_yol = os.path.join(VERGI_LEVHASI_KAYNAK, dosya)
        
        if not os.path.isfile(dosya_yol):
            continue
        
        # Musteri eslestir
        musteri = musteri_eslestir(dosya, musteriler)
        
        if musteri:
            # Hedef klasoru olustur
            vergi_klasor = os.path.join(musteri['yol'], 'Vergi Levhalari')
            os.makedirs(vergi_klasor, exist_ok=True)
            
            # Dosyayi kopyala
            hedef_yol = os.path.join(vergi_klasor, dosya)
            
            try:
                shutil.copy2(dosya_yol, hedef_yol)
                log_yaz(f"KOPYALANDI: {dosya} -> {musteri['ad']}/Vergi Levhalari/")
                kopyalanan += 1
            except Exception as e:
                log_yaz(f"HATA: {dosya} kopyalanamadi: {str(e)}")
        else:
            eslestirilemeyen.append(dosya)
    
    log_yaz(f"\nToplam {kopyalanan} vergi levhasi dosyasi kopyalandi.")
    
    if eslestirilemeyen:
        log_yaz(f"\nEslestirilemeyen dosyalar ({len(eslestirilemeyen)} adet):")
        for dosya in eslestirilemeyen:
            log_yaz(f"  - {dosya}")


def main():
    """Ana fonksiyon"""
    log_yaz("\n" + "=" * 60)
    log_yaz("MUBiS ERP - DOSYA KOPYALAMA SCRIPTI")
    log_yaz("=" * 60)
    
    # Beyannameleri kopyala
    beyanname_kopyala()
    
    # Vergi levhalarini kopyala
    vergi_levhasi_kopyala()
    
    log_yaz("\n" + "=" * 60)
    log_yaz("ISLEM TAMAMLANDI")
    log_yaz(f"Log dosyasi: {LOG_DOSYASI}")
    log_yaz("=" * 60)
    
    print(f"\nIslem tamamlandi. Detaylar icin log dosyasini kontrol edin:")
    print(f"{LOG_DOSYASI}")


if __name__ == "__main__":
    main()
