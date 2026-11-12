# -*- coding: utf-8 -*-
"""
MUBiS Tarama (fi-6130 yardımcı programı)
========================================
1) Ekranından müşteri + yıl + ay + belge tipi (Z Raporu / Gider Fişi) seçilir.
2) Klasör yapısı hazırlanır:
   Z Raporu    : G:\\Drive'ım\\EDEFTER\\<Müşteri>\\<Yıl>\\<Ay>\\GİDEN\\ZRAPORU
   Gider Fişi  : G:\\Drive'ım\\EDEFTER\\<Müşteri>\\<Yıl>\\<Ay>\\GELEN\\GİDERFİŞİ
3) Tarayıcı profili "klasöre JPEG tarama" olarak GİRİŞ klasörüne ayarlanır;
   program GİRİŞ'e düşen her taramayı seçili hedef klasöre otomatik taşır.
4) 8770 portunda mini sunucu açar; MUBiS web (Fişler sayfası) buradan
   taranmış dosyaları listeler ve MUBiS'e yükler.
"""
import json
import os
import shutil
import threading
import time
import tkinter as tk
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from tkinter import ttk
from urllib.parse import parse_qs, urlparse, unquote

KOK = r"G:\Drive'ım\EDEFTER"
GIRIS = os.path.join(KOK, "_TARAMA_GIRIS")
PORT = 8770
EXT = ('.jpg', '.jpeg', '.png', '.webp')
AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ',
         'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']


def tr_upper(s):
    return str(s).replace('i', 'İ').replace('ı', 'I').upper()


def ay_adi(ay):
    """'9'/'09' → 'EYLÜL'; zaten ad ise olduğu gibi (büyük harf)."""
    ay = str(ay or '').strip()
    if ay.isdigit():
        return AYLAR[int(ay) - 1]
    return tr_upper(ay)

DURUM = {'hedef': None, 'musteri': None, 'yil': None, 'ay': None, 'tip': None}
LOG = []


def logla(mesaj):
    LOG.append(f"[{datetime.now().strftime('%H:%M:%S')}] {mesaj}")
    if len(LOG) > 300:
        del LOG[:100]


def hedef_kur(musteri, yil, ay, tip):
    """Klasör yapısını kur, hedefi ayarla ve döndür."""
    musteri = tr_upper((musteri or '').strip().strip('\\/'))
    if not musteri:
        raise ValueError('Müşteri adı boş')
    yil = str(yil).strip()
    ay = ay_adi(ay)
    tip = 'z' if str(tip).lower().startswith('z') else 'fis'
    if tip == 'z':
        yol = os.path.join(KOK, musteri, yil, ay, 'GİDEN', 'ZRAPORU')
    else:
        yol = os.path.join(KOK, musteri, yil, ay, 'GELEN', 'GİDERFİŞİ')
    os.makedirs(yol, exist_ok=True)
    DURUM.update({'hedef': yol, 'musteri': musteri, 'yil': yil, 'ay': ay, 'tip': tip})
    logla(f"Hedef klasör: {yol}")
    return yol


def tasi_bekleyenler():
    """GİRİŞ klasöründeki taramaları hedef klasöre taşır."""
    hedef = DURUM['hedef']
    if not hedef:
        return 0
    try:
        os.makedirs(GIRIS, exist_ok=True)
        adet = 0
        for ad in os.listdir(GIRIS):
            if not ad.lower().endswith(EXT):
                continue
            kaynak = os.path.join(GIRIS, ad)
            if not os.path.isfile(kaynak):
                continue
            yeni_ad = ad
            i = 0
            while os.path.exists(os.path.join(hedef, yeni_ad)):
                kok_, uz = os.path.splitext(ad)
                i += 1
                yeni_ad = f"{kok_}_{i}{uz}"
                if i > 50:
                    kok_, uz = os.path.splitext(ad)
                    yeni_ad = f"{kok_}_{datetime.now().strftime('%Y%m%d%H%M%S')}{uz}"
                    break
            shutil.move(kaynak, os.path.join(hedef, yeni_ad))
            adet += 1
            logla(f"Taşındı: {ad} → {DURUM['musteri']}/{DURUM['yil']}/{DURUM['ay']}")
        if adet:
            logla(f"{adet} tarama hedef klasöre alındı")
        return adet
    except Exception as e:
        logla(f"Taşıma hatası: {e}")
        return 0


def izleyici():
    while True:
        tasi_bekleyenler()
        time.sleep(1.5)


def guvenli_yol(yol):
    """Sadece EDEFTER altındaki yollara izin ver."""
    tam = os.path.realpath(unquote(yol))
    kok = os.path.realpath(KOK)
    if os.path.commonpath([kok, tam]) != kok:
        return None
    return tam


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, obj, code=200):
        veri = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(veri)))
        self.end_headers()
        self.wfile.write(veri)

    def _qs(self):
        return parse_qs(urlparse(self.path).query)

    def do_GET(self):
        try:
            q = self._qs()
            yol = urlparse(self.path).path
            if yol == '/ping':
                return self._json({'ok': True, 'app': 'mubis-tarama', 'version': '1.0',
                                   'hedef': DURUM['hedef'], 'kok': KOK, 'giris': GIRIS})
            if yol == '/musteriler':
                liste = []
                if os.path.isdir(KOK):
                    liste = sorted(d for d in os.listdir(KOK)
                                   if os.path.isdir(os.path.join(KOK, d)) and not d.startswith('_'))
                return self._json({'musteriler': liste})
            if yol in ('/hazirla', '/liste'):
                musteri = q.get('musteri', [DURUM['musteri']])[0]
                yil = q.get('yil', [DURUM['yil']])[0]
                ay = q.get('ay', [DURUM['ay']])[0]
                tip = q.get('tip', [DURUM['tip'] or 'fis'])[0]
                if not musteri:
                    return self._json({'hata': 'musteri gerekli'}, 400)
                hedef = hedef_kur(musteri, yil, ay, tip)
                dosyalar = []
                if yol == '/liste':
                    for ad in sorted(os.listdir(hedef)):
                        tam = os.path.join(hedef, ad)
                        if os.path.isfile(tam) and ad.lower().endswith(EXT):
                            dosyalar.append({'ad': ad, 'yol': tam,
                                             'boyut': os.path.getsize(tam),
                                             'mtime': os.path.getmtime(tam)})
                return self._json({'hedef': hedef, 'dosyalar': dosyalar})
            if yol == '/dosya':
                tam = guvenli_yol(q.get('yol', [''])[0])
                if not tam or not os.path.isfile(tam):
                    return self._json({'hata': 'dosya yok'}, 404)
                uz = os.path.splitext(tam)[1].lower()
                tip_ = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                        '.png': 'image/png', '.webp': 'image/webp'}.get(uz, 'application/octet-stream')
                with open(tam, 'rb') as f:
                    veri = f.read()
                self.send_response(200)
                self._cors()
                self.send_header('Content-Type', tip_)
                self.send_header('Content-Length', str(len(veri)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(veri)
                return
            return self._json({'hata': 'bilinmeyen yol'}, 404)
        except Exception as e:
            try:
                self._json({'hata': str(e)}, 500)
            except Exception:
                pass

    def do_POST(self):
        try:
            boyut = int(self.headers.get('Content-Length') or 0)
            govde = self.rfile.read(boyut) if boyut else b'{}'
            veri = json.loads(govde.decode('utf-8') or '{}')
            if urlparse(self.path).path == '/hazirla':
                hedef = hedef_kur(veri.get('musteri'), veri.get('yil'), veri.get('ay'), veri.get('tip'))
                return self._json({'ok': True, 'hedef': hedef})
            return self._json({'hata': 'bilinmeyen yol'}, 404)
        except Exception as e:
            try:
                self._json({'hata': str(e)}, 500)
            except Exception:
                pass


def sunucu_baslat():
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    logla(f"Mini sunucu: http://127.0.0.1:{PORT}")


class Uygulama(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('MUBiS Tarama — fi-6130')
        self.geometry('640x430')
        self.minsize(560, 380)

        ust = ttk.LabelFrame(self, text='Tarama Seçimi')
        ust.pack(fill='x', padx=10, pady=(10, 6))

        ttk.Label(ust, text='Müşteri:').grid(row=0, column=0, sticky='w', padx=6, pady=6)
        self.musteri = ttk.Combobox(ust, width=34)
        self.musteri.grid(row=0, column=1, sticky='we', padx=6, pady=6)
        ust.columnconfigure(1, weight=1)

        ttk.Label(ust, text='Yıl:').grid(row=0, column=2, sticky='w', padx=6)
        self.yil = ttk.Combobox(ust, width=6, values=[str(y) for y in range(2020, 2036)])
        self.yil.set(str(datetime.now().year))
        self.yil.grid(row=0, column=3, padx=6)

        ttk.Label(ust, text='Ay:').grid(row=1, column=0, sticky='w', padx=6, pady=6)
        self.ay = ttk.Combobox(ust, width=10, values=AYLAR, state='readonly')
        self.ay.set(AYLAR[datetime.now().month - 1])
        self.ay.grid(row=1, column=1, sticky='w', padx=6)

        self.tip = tk.StringVar(value='z')
        rf = ttk.Frame(ust)
        rf.grid(row=1, column=2, columnspan=2, sticky='w', padx=6)
        ttk.Radiobutton(rf, text='Z Raporu (giden)', value='z', variable=self.tip).pack(side='left')
        ttk.Radiobutton(rf, text='Gider Fişi (gelen)', value='fis', variable=self.tip).pack(side='left', padx=10)

        self.btn = ttk.Button(ust, text='Klasörü Hazırla', command=self.hazirla)
        self.btn.grid(row=2, column=0, columnspan=2, sticky='we', padx=6, pady=(2, 8))

        bilgi = ttk.LabelFrame(self, text='Durum')
        bilgi.pack(fill='x', padx=10, pady=6)
        self.hedef_lbl = ttk.Label(bilgi, text='Hedef klasör: —', wraplength=600, justify='left')
        self.hedef_lbl.pack(anchor='w', padx=6, pady=4)
        self.giris_lbl = ttk.Label(bilgi, text=f'Tarayıcı GİRİŞ klasörü (profilini buraya ayarla): {GIRIS}',
                                   wraplength=600, justify='left', foreground='#555')
        self.giris_lbl.pack(anchor='w', padx=6, pady=(0, 6))

        gunluk = ttk.LabelFrame(self, text='Günlük')
        gunluk.pack(fill='both', expand=True, padx=10, pady=(6, 10))
        self.log = tk.Text(gunluk, height=8, state='disabled', font=('Consolas', 9))
        self.log.pack(fill='both', expand=True, padx=4, pady=4)

        self.musterileri_doldur()
        sunucu_baslat()
        threading.Thread(target=izleyici, daemon=True).start()
        logla(f"GİRİŞ klasörü hazır: {GIRIS}")
        self.after(1000, self.tasi_ve_yaz)
        self.protocol('WM_DELETE_WINDOW', self.kapat)

    def musterileri_doldur(self):
        try:
            os.makedirs(GIRIS, exist_ok=True)
            liste = sorted(d for d in os.listdir(KOK)
                           if os.path.isdir(os.path.join(KOK, d)) and not d.startswith('_'))
            self.musteri['values'] = liste
        except Exception as e:
            logla(f"Müşteri listesi okunamadı: {e}")

    def hazirla(self):
        try:
            yol = hedef_kur(self.musteri.get(), self.yil.get(), self.ay.get(), self.tip.get())
            self.hedef_lbl.config(text=f'Hedef klasör: {yol}')
            os.startfile(yol)
            self.tasi_ve_yaz()
        except Exception as e:
            logla(f"Hazırlama hatası: {e}")

    def tasi_ve_yaz(self):
        tasi_bekleyenler()
        if DURUM['hedef']:
            self.hedef_lbl.config(text=f"Hedef klasör: {DURUM['hedef']}")
        self.log.config(state='normal')
        self.log.delete('1.0', 'end')
        self.log.insert('end', '\n'.join(LOG[-120:]))
        self.log.see('end')
        self.log.config(state='disabled')
        self.after(1000, self.tasi_ve_yaz)

    def kapat(self):
        self.destroy()


if __name__ == '__main__':
    os.makedirs(GIRIS, exist_ok=True)
    Uygulama().mainloop()
