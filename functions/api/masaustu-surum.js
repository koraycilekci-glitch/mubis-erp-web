// MUBiS Masaüstü Otomasyon - sürüm kontrolü
// GET /api/masaustu-surum -> { surum, url, notlar }
export async function onRequestGet({ env, request }) {
  return new Response(JSON.stringify({
    surum: "1.1.0",
    url: "https://mubiserp.com/downloads/MUBiS-Masaustu-Otomasyon-Setup-1.1.0.exe",
    notlar: "Z Raporu OCR tarama, Ortak şifre doldurma, ÖKC hasılat sorgulama"
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
}