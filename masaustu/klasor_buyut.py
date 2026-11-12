# -*- coding: utf-8 -*-
# EDEFTER altındaki GIDEN/GİDEN, GELEN, ZRAPORU, GIDERFISI/GİDERFİŞI/GİDERFİŞİ
# varyantlarını tek canonical isimde birleştirir (içerik kaybı olmadan).
import os

KOK = r"G:\Drive'ım\EDEFTER"
CANONICAL = {'GIDEN': 'GİDEN', 'GELEN': 'GELEN', 'ZRAPORU': 'ZRAPORU', 'GIDERFISI': 'GİDERFİŞİ'}


def norm(s):
    return s.upper().replace('İ', 'I').replace('Ş', 'S')


def merge(src, dst):
    """src içeriğini dst'ye taşır, src'yi silmeye çalışır."""
    for ad in os.listdir(src):
        s = os.path.join(src, ad)
        d = os.path.join(dst, ad)
        if os.path.isdir(d) and os.path.isdir(s):
            merge(s, d)
        elif os.path.exists(d):
            kok_, uz = os.path.splitext(ad)
            i = 1
            while os.path.exists(d):
                i += 1
                d = os.path.join(dst, f"{kok_}_{i}{uz}")
            os.rename(s, d)
            print(f"  taşındı (çakışma): {s} -> {d}")
        else:
            os.rename(s, d)
    try:
        os.rmdir(src)
        print(f"  birleştirildi: {src} -> {dst}")
    except OSError:
        print(f"  UYARI: {src} boşaltılamadı/silinemedi")


def unify(parent, derinlik=0):
    """parent içindeki canonical adaylı klasörleri tekilleştirir."""
    gruplar = {}
    for ad in os.listdir(parent):
        p = os.path.join(parent, ad)
        if not os.path.isdir(p):
            continue
        k = norm(ad)
        if k in CANONICAL:
            gruplar.setdefault(k, []).append((ad, p))
    for k, varyantlar in gruplar.items():
        canonical_ad = CANONICAL[k]
        canonical_yol = os.path.join(parent, canonical_ad)
        if not any(ad == canonical_ad for ad, _ in varyantlar):
            os.rename(varyantlar[0][1], canonical_yol)
            print(f"{'  ' * derinlik}büyük harfe çevrildi: {varyantlar[0][1]} -> {canonical_yol}")
            varyantlar[0] = (canonical_ad, canonical_yol)
        for ad, p in varyantlar:
            if p == canonical_yol:
                continue
            merge(p, canonical_yol)
    # canonical klasörlerin içini de tarayarak devam et (zraporu/giderfişi seviyesi)
    for ad in os.listdir(parent):
        p = os.path.join(parent, ad)
        if os.path.isdir(p) and norm(ad) in CANONICAL and derinlik == 0:
            unify(p, derinlik + 1)


sayac = 0
if os.path.isdir(KOK):
    for musteri in sorted(os.listdir(KOK)):
        m_yol = os.path.join(KOK, musteri)
        if not os.path.isdir(m_yol) or musteri.startswith('_'):
            continue
        for yil in os.listdir(m_yol):
            y_yol = os.path.join(m_yol, yil)
            if not os.path.isdir(y_yol):
                continue
            for ay in os.listdir(y_yol):
                a_yol = os.path.join(y_yol, ay)
                if os.path.isdir(a_yol):
                    unify(a_yol)
print("\nTamamlandı.")
