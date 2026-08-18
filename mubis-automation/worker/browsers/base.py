import os
from abc import ABC, abstractmethod
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

class BaseRobot(ABC):
    """Tüm otomasyon robotları için temel sınıf."""

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.playwright = None
        self.browser: Browser | None = None
        self.context: BrowserContext | None = None
        self.page: Page | None = None

    def start(self):
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(
            headless=self.headless,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        )
        self.context = self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            accept_downloads=True,
        )
        self.page = self.context.new_page()
        self.page.set_default_timeout(60000)

    def close(self):
        try:
            if self.context:
                self.context.close()
            if self.browser:
                self.browser.close()
            if self.playwright:
                self.playwright.stop()
        except Exception as e:
            print(f"Robot kapatma hatası: {e}")

    @abstractmethod
    def run(self, client: dict, credentials: dict) -> list:
        """Robotu çalıştırır, indirilen belge listesini döndürür."""
        pass

    def safe_click(self, selector: str, timeout: int = 10000):
        self.page.wait_for_selector(selector, timeout=timeout)
        self.page.click(selector)

    def safe_fill(self, selector: str, value: str):
        self.page.wait_for_selector(selector, timeout=10000)
        self.page.fill(selector, value)

    def wait_and_download(self, click_selector: str, download_dir: str, timeout: int = 30000) -> str:
        """Bir butona tıklayıp indirilen dosyanın yolunu döndürür."""
        with self.page.expect_download(timeout=timeout) as download_info:
            self.page.click(click_selector)
        download = download_info.value
        path = os.path.join(download_dir, download.suggested_filename)
        download.save_as(path)
        return path
