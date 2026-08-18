"""
e-Tebligat robotu.

Hedef: e-Devlet veya Dijital Vergi Dairesi üzerinden gelen tebliğatları
listeleyip PDF olarak indirmek.

NOT: Bu iskelet fonksiyonudur. Gerçek portalların URL ve HTML yapısına
göre selector'lar güncellenmelidir.
"""
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

from worker.browsers.base import BaseRobot
from shared.storage import get_temporary_download_path

class ETebligatRobot(BaseRobot):
    def run(self, client: dict, credentials: dict) -> list:
        self.start()
        docs = []

        dvs = credentials.get("dvs", {})
        username = dvs.get("u") or client.get("username") or client.get("vkn") or client.get("tc")
        password = dvs.get("p")

        if not username or not password:
            print(f"[e-Tebligat] {client.get('name')} için eksik giriş bilgisi")
            return docs

        try:
            # 1. e-Devlet / Dijital Vergi Dairesi giriş
            # TODO: Gerçek login URL'si ve adımları eklenecek
            self.page.goto("https://ivd.gib.gov.tr/", wait_until="networkidle")

            # Örnek giriş adımları (placeholder)
            # self.safe_fill('input[name="username"]', username)
            # self.safe_fill('input[name="password"]', password)
            # self.safe_click('button[type="submit"]')

            # 2. e-Tebligat listesine git
            self.page.goto("https://ivd.gib.gov.tr/tespit-davet-ve-teblig-islemleri", wait_until="networkidle")

            # 3. Son 7 gün içindeki tebliğatları listele
            rows = self.page.query_selector_all("table.dataTable tbody tr")
            print(f"[e-Tebligat] {len(rows)} satır bulundu")

            for i, row in enumerate(rows[:20]):  # en fazla 20
                try:
                    cells = row.query_selector_all("td")
                    if len(cells) < 3:
                        continue

                    teblig_no = cells[0].inner_text().strip()
                    teblig_tarihi = cells[1].inner_text().strip()
                    konu = cells[2].inner_text().strip()

                    # Tarih parse
                    doc_date = None
                    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d"):
                        try:
                            doc_date = datetime.strptime(teblig_tarihi, fmt).strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue

                    # İndir butonuna tıkla
                    download_btn = row.query_selector("button.download, a.download")
                    if not download_btn:
                        continue

                    local_path = self.wait_and_download(
                        f"table.dataTable tbody tr:nth-child({i+1}) .download",
                        Path(get_temporary_download_path()).parent,
                    )

                    docs.append({
                        "local_path": local_path,
                        "source_id": teblig_no,
                        "title": f"e-Tebligat - {konu}",
                        "document_date": doc_date,
                        "metadata": {
                            "teblig_no": teblig_no,
                            "konu": konu,
                            "portal": "ivd",
                        },
                    })
                except Exception as e:
                    print(f"[e-Tebligat] Satır işlenirken hata: {e}")

        except Exception as e:
            print(f"[e-Tebligat] Hata: {e}")
            raise

        return docs
