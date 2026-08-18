"""
SGK e-Bildirge / e-SGK robotu.

Hedef: SGK portalına giriş yaparak sigorta tahakkuk fişi, hizmet listesi
ve borç dökümü indirmek.

NOT: Bu iskelet fonksiyonudur. Gerçek SGK portalının URL ve HTML yapısına
göre selector'lar güncellenmelidir.
"""
import os
from datetime import datetime
from pathlib import Path

from worker.browsers.base import BaseRobot
from shared.storage import get_temporary_download_path

class SGKRobot(BaseRobot):
    def run(self, client: dict, credentials: dict) -> list:
        self.start()
        docs = []

        sgk = credentials.get("sgk", {})
        username = sgk.get("u") or client.get("sgk_user")
        isyeri_kodu = sgk.get("isyeri_kodu") or client.get("sgk_isyeri_kodu")
        sistem_sifre = sgk.get("sistem_s") or client.get("sgk_sistem_sifre")
        isyeri_sifre = sgk.get("isyeri_s") or client.get("sgk_isyeri_sifre")

        if not username or not sistem_sifre:
            print(f"[SGK] {client.get('name')} için eksik giriş bilgisi")
            return docs

        try:
            # 1. SGK e-SGK giriş
            self.page.goto("https://uyg.sgk.gov.tr/", wait_until="networkidle")

            # TODO: Gerçek login adımları
            # self.safe_fill('input[name="kullaniciAdi"]', username)
            # self.safe_fill('input[name="sifre"]', sistem_sifre)
            # self.safe_click('button#login')

            # 2. Tahakkuk fişi indir
            docs.extend(self._download_tahakkuk(client))

            # 3. Hizmet listesi indir
            docs.extend(self._download_hizmet_listesi(client))

            # 4. Borç dökümü indir
            docs.extend(self._download_borc_dokumu(client))

        except Exception as e:
            print(f"[SGK] Hata: {e}")
            raise

        return docs

    def _download_tahakkuk(self, client: dict) -> list:
        docs = []
        try:
            self.page.goto("https://uyg.sgk.gov.tr/Esnet/tahakkukfisleri", wait_until="networkidle")
            # TODO: Gerçek indirme selector'ları
            local_path = self.wait_and_download(
                ".download-tahakkuk",
                Path(get_temporary_download_path()).parent,
            )
            docs.append({
                "local_path": local_path,
                "document_type": "sgk_tahakkuk",
                "source_id": f"{datetime.now().year}-{datetime.now().month:02d}",
                "title": "SGK Sigorta Tahakkuk Fişi",
                "document_date": datetime.now().strftime("%Y-%m-%d"),
                "metadata": {"portal": "sgk", "tur": "tahakkuk"},
            })
        except Exception as e:
            print(f"[SGK] Tahakkuk indirilemedi: {e}")
        return docs

    def _download_hizmet_listesi(self, client: dict) -> list:
        docs = []
        try:
            self.page.goto("https://uyg.sgk.gov.tr/Esnet/hizmetlistesi", wait_until="networkidle")
            local_path = self.wait_and_download(
                ".download-hizmet",
                Path(get_temporary_download_path()).parent,
            )
            docs.append({
                "local_path": local_path,
                "document_type": "sgk_hizmet",
                "source_id": f"{datetime.now().year}-{datetime.now().month:02d}",
                "title": "SGK Hizmet Listesi",
                "document_date": datetime.now().strftime("%Y-%m-%d"),
                "metadata": {"portal": "sgk", "tur": "hizmet_listesi"},
            })
        except Exception as e:
            print(f"[SGK] Hizmet listesi indirilemedi: {e}")
        return docs

    def _download_borc_dokumu(self, client: dict) -> list:
        docs = []
        try:
            self.page.goto("https://uyg.sgk.gov.tr/Esnet/borcdokumu", wait_until="networkidle")
            local_path = self.wait_and_download(
                ".download-borc",
                Path(get_temporary_download_path()).parent,
            )
            docs.append({
                "local_path": local_path,
                "document_type": "sgk_borc_dokumu",
                "source_id": f"{datetime.now().year}-{datetime.now().month:02d}",
                "title": "SGK Borç Dökümü",
                "document_date": datetime.now().strftime("%Y-%m-%d"),
                "metadata": {"portal": "sgk", "tur": "borc_dokumu"},
            })
        except Exception as e:
            print(f"[SGK] Borç dökümü indirilemedi: {e}")
        return docs
