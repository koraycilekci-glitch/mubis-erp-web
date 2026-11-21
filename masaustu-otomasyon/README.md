# MUBiS Masaüstü Otomasyon (Electron)

Luca / GİB otomasyonlarını masaüstünden yöneten program.
**MUBiS yardımcısından tamamen bağımsızdır.**

| | MUBiS Yardımcısı | Bu program |
|---|---|---|
| Dosya | `mubis-gib-yardimci.exe` | `mubis-otomasyon-motor.exe` |
| Port | 8765 | **8766** |
| Klasör | kendi konumu | `%LOCALAPPDATA%\MUBiS\MasaustuOtomasyon\motor` |
| config.json | kendi | kendi (ayrı) |
| Tepsi ikonu | var | yok (arayüz var) |
| Otomasyon planı | çalışır | kapalı |
| Luca kısayolu silme | yapar | yapmaz |

Aynı bilgisayarda ikisi birlikte sorunsuz çalışır.

## Geliştirme

```bash
# Motoru derle (gib-yardimci klasöründe)
cd ../gib-yardimci && cmd /c exe-yeni.cmd

# Motoru pakete koy
Move-Item dist\mubis-gib-yardimci.exe ..\masaustu-otomasyon\engine\mubis-otomasyon-motor.exe -Force

# Uygulamayı çalıştır
cd ../masaustu-otomasyon && ..\mubis-asistan\node_modules\.bin\electron.cmd .

# Kurulum + portable üret
..\mubis-asistan\node_modules\.bin\electron-builder.cmd --win nsis portable
```

Çıktı: `cikti/`
- `MUBiS Masaustu Otomasyon Setup 1.0.0.exe` — kurulum
- `MUBiS Masaustu Otomasyon 1.0.0.exe` — portable

## Ekranlar

Ana Ekran · Mükellef Bilgileri · Luca · Fatura Sorgulama · Beyanname İndirme ·
Borç Sorgulama · POS/KDV · e-Tebligat · Fiş İşlemleri · Ayarlar · Log
