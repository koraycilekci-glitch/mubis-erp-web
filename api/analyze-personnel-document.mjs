/**
 * ===========================================================
 * MUBIS PERSONEL BELGE OKUMA (Ise Giris / Isten Cikis Bildirgesi)
 * Server Side
 *
 * SGK Ise Giris Bildirgesi veya Isten Cikis Bildirgesi (PDF/gorsel)
 * okuyup TC kimlik, ad soyad, dogum tarihi ve ilgili tarihi (ise
 * giris ya da isten cikis) JSON olarak dondurur.
 *
 * analyze-document.mjs'teki OpenAI gorsel-okuma deseniyle aynı
 * altyapiyi (gpt-4o, base64 gonderim, JSON ayristirma) kullanir;
 * tahakkuk fisi degil personel bildirgesi icin ayri bir prompt/semadir.
 * ===========================================================
 */

export default async function handler(req, res) {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS")
        return res.status(200).json({ ok: true });

    if (req.method !== "POST")
        return res.status(405).json({ success: false, error: "Method Not Allowed" });

    try {

        const { fileUrl, bildirgeTipi } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ success: false, error: "fileUrl gerekli" });
        }

        if (!["ise_giris", "isten_cikis"].includes(bildirgeTipi)) {
            return res.status(400).json({ success: false, error: "bildirgeTipi 'ise_giris' veya 'isten_cikis' olmalı" });
        }

        const result = await runPersonnelAnalysis(fileUrl, bildirgeTipi);
        return res.status(result.success ? 200 : 422).json(result);

    } catch (err) {

        console.error("Personel Belge Okuma hatası:", err);
        return res.status(500).json({ success: false, error: err.message });

    }
}

async function runPersonnelAnalysis(fileUrl, bildirgeTipi) {

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return { success: false, error: "OPENAI_API_KEY bulunamadı." };
    }

    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
        return { success: false, error: "Belge indirilemedi." };
    }

    const contentType = fileResponse.headers.get("content-type") || "";
    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const isImage = contentType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(fileUrl);

    const belgeAdi = bildirgeTipi === "ise_giris" ? "İşe Giriş Bildirgesi" : "İşten Çıkış Bildirgesi";
    const tarihAlani = bildirgeTipi === "ise_giris" ? "ise_giris_tarihi" : "isten_cikis_tarihi";

    const prompt = `Sen deneyimli bir Türk muhasebe/SGK uzmanısın.
Sana bir SGK ${belgeAdi} belgesi verilecek.
Belgeyi oku ve SADECE JSON döndür. Hiçbir açıklama yazma.

KURALLAR:
- tc_kimlik: 11 haneli TC kimlik numarası, sadece rakam.
- ad_soyad: sigortalının adı soyadı, büyük/küçük harf düzeltilmiş halde (ör. "Ahmet Yılmaz").
- dogum_tarihi: "YYYY-MM-DD" formatında.
- ${tarihAlani}: belgedeki ${bildirgeTipi === "ise_giris" ? "işe giriş" : "işten çıkış"} tarihi, "YYYY-MM-DD" formatında.
- Emin olamadığın bir alanı boş string "" olarak bırak, tahmin etme.

JSON:
{
"tc_kimlik":"",
"ad_soyad":"",
"dogum_tarihi":"",
"${tarihAlani}":""
}`;

    const contentBlock = isImage
        ? {
            type: "image_url",
            image_url: { url: `data:${contentType || "image/jpeg"};base64,${base64}` }
        }
        : {
            type: "file",
            file: {
                filename: "bildirge.pdf",
                file_data: `data:application/pdf;base64,${base64}`
            }
        };

    try {

        const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    temperature: 0,
                    max_tokens: 500,
                    messages: [{
                        role: "user",
                        content: [contentBlock, { type: "text", text: prompt }]
                    }]
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            console.error("OpenAI hatası:", data.error.message);
            return { success: false, error: data.error.message };
        }

        const content = data.choices?.[0]?.message?.content || "";
        const json = content.match(/\{[\s\S]*\}/);
        if (!json) {
            return { success: false, error: "Belgeden veri okunamadı." };
        }

        const result = JSON.parse(json[0]);

        if (!result.tc_kimlik && !result.ad_soyad) {
            return { success: false, error: "Belgede TC kimlik veya ad soyad bulunamadı." };
        }

        return {
            success: true,
            bildirge_tipi: bildirgeTipi,
            tc_kimlik: (result.tc_kimlik || "").replace(/\D/g, ""),
            ad_soyad: result.ad_soyad || "",
            dogum_tarihi: result.dogum_tarihi || "",
            [tarihAlani]: result[tarihAlani] || ""
        };

    } catch (err) {

        console.error("Personel belge OpenAI analizi hatası:", err);
        return { success: false, error: err.message };

    }

}
