# MUBiS ERP - Beyanname ve Vergi Levhasi Otomatik Kopyalama

## Kurulum

1. Python yuklu olmali (3.7+)
2. Gerekli kutuphaneleri yukleyin:
```bash
pip install pandas openpyxl
```

## Kullanim

### 1. Basit Versiyon

```bash
cd "C:\Users\hp\PROJELER\mubis-erp-web\scripts"
python beyanname_kopyala.py
```

### 2. Gelismis Versiyon (Onerilen)

```bash
cd "C:\Users\hp\PROJELER\mubis-erp-web\scripts"
python beyanname_kopyala_gelismis.py
```

## Yapilandirma

Scriptin basindaki degiskenleri kendi sisteminize gore ayarlayin:

```python
# KAYNAK KLASORLER
BEYANNAME_KAYNAK = r"G:\Drive'ım\BEYANNAME"
VERGI_LEVHASI_KAYNAK = r"G:\Drive'ım\2025 VERGİ LEVHALARI"

# HEDEF KLASOR
HEDEF_ANA_DIZIN = r"G:\Drive'ım"

# Opsiyonel: Excel musteri listesi
MUSTERI_LISTESI = r"G:\Drive'ım\musteri_listesi.xlsx"
```

## Excel Musteri Listesi Formatı

Eger musteri listesi kullanmak isterseniz, Excel dosyaniz su kolonlari icermeli:

| Sirket_Adi | Vergi_No | Klasor_Adi |
|-----------|----------|------------|
| ABC LTD | 1234567890 | ABC LTD |
| XYZ A.S. | 9876543210 | XYZ A.S. |

## Eslestirme Mantigi

Script su sekilde calisir:

1. **Tam Eslestirme**: Dosya adinda musteri adi geciyorsa dogrudan eslestirir
2. **Kismi Eslestirme**: Kelime bazli benzerlik skoru hesaplar (esik degeri: 0.6)
3. **Turkce Karakter Destegi**: I/I, S/s, C/c, U/u, O/o, G/g karakterlerini normalize eder

## Klasor Yapisi

Kopyalama sonrasi olusan yapı:

```
G:\Drive'ım\
├── ABC LTD\
│   ├── Beyannameler\
│   │   ├── 2025_KDV_Beyanname.pdf
│   │   └── 2025_Muhtasar_Beyanname.pdf
│   └── Vergi Levhalari\
│       └── 2025_Vergi_Levhasi.pdf
├── XYZ A.S.\
│   ├── Beyannameler\
│   └── Vergi Levhalari\
```

## Log Dosyasi

Islem sonrasi `G:\Drive'ım\kopyalama_log.txt` dosyasi olusur. 
Bu dosyada:
- Basarili kopyalamalar
- Hatalar
- Eslestirilemeyen dosyalar

listelenir.

## Sorun Giderme

### "Musteri bulunamadi" hatasi
- Klasor adlarinin dosya adlariyla eslestiginden emin olun
- Excel musteri listesi kullanarak manuel eslestirme yapabilirsiniz

### "Kaynak dizin bulunamadi" hatasi
- Yolun dogru oldugunu kontrol edin
- Turkce karakterler (ı, ğ, ü, ş, ö, ç) sorun cikarabilir, yolu kontrol edin

### Eslestirilemeyen dosyalar
- Log dosyasini kontrol edin
- Dosya adlarini musteri klasor adlariyla karsilastirin
- Gerekirse Excel listesi ile manuel eslestirme yapin

## Guvenlik

- Script sadece kopyalama yapar, kaynak dosyalari silmez
- Hedef klasorde ayni isimli dosya varsa uzerine yazar
- Once yedek almaniz onerilir

## Iletisim

Sorulariniz icin: info@mubiserp.com.tr
