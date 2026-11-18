// MUBIS Beyan Hatırlatma Cron Worker
// Cloudflare Worker + Cron Trigger: her gün 07:00 UTC (TR 10:00) beyan
// hatırlatma ucunu tetikler. Pages projelerine doğrudan cron bağlanamadığı
// için ayrı worker (wrangler.toml notu ile uyumlu).
export default {
  async scheduled(event, env, ctx) {
    const hedefler = [
      'https://www.mubiserp.com/api/beyan-hatirlatma'
    ]
    for (const url of hedefler) {
      try {
        const r = await fetch(url, { method: 'POST' })
        const j = await r.json().catch(() => ({}))
        console.log(`[mubis-beyan-cron] ${url} -> HTTP ${r.status}`, JSON.stringify(j).slice(0, 300))
      } catch (e) {
        console.error(`[mubis-beyan-cron] ${url} hata:`, e?.message)
      }
    }
  }
}
