/**
 * ===========================================================
 * MUBIS DOCUMENT INTELLIGENCE ENGINE v2.0
 * Server Side
 *
 * Katmanlar
 * 1- PDF Parser
 * 2- Rule Engine (Regex)
 * 3- AI Fallback (Groq)
 * ===========================================================
 */

let pdfjsLib = null;
const analysisCache = new Map();
const analysisInFlight = new Map();

/**
 * PDF.js yükle
 */
async function getPdfJs() {

    if (pdfjsLib) return pdfjsLib;

    pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    return pdfjsLib;
}

/**
 * pdf-parse ile metin çıkar (pdfjs yetersiz kalırsa fallback)
 */
async function extractWithPdfParse(arrayBuffer) {

    try {

        const { PDFParse } = await import("pdf-parse");

        const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });

        const textResult = await parser.getText();

        await parser.destroy();

        return textResult.text || "";

    } catch (err) {

        console.error("pdf-parse hatası:", err);

        return "";

    }

}

export default async function handler(req, res) {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS")
        return res.status(200).json({ ok: true });

    if (req.method !== "POST")
        return res.status(405).json({
            success:false,
            error:"Method Not Allowed"
        });

    try {

        const { pdfUrl } = req.body;

        if(!pdfUrl){

            return res.status(400).json({
                success:false,
                error:"pdfUrl gerekli"
            });

        }

        if (analysisCache.has(pdfUrl)) {
            return res.status(200).json(analysisCache.get(pdfUrl));
        }

        if (analysisInFlight.has(pdfUrl)) {
            const cached = await analysisInFlight.get(pdfUrl);
            return res.status(200).json(cached);
        }

        const promise = runAnalysis(pdfUrl);
        analysisInFlight.set(pdfUrl, promise);

        try {
            const result = await promise;
            if (result.success) {
                analysisCache.set(pdfUrl, result);
            }
            return res.status(result.success ? 200 : 422).json(result);
        } finally {
            analysisInFlight.delete(pdfUrl);
        }

    } catch (err) {

        console.error("Document Intelligence hatası :", err);

        return res.status(500).json({
            success:false,
            error:err.message
        });

    }
}

async function runAnalysis(pdfUrl) {

        console.log("================================");
        console.log("MUBIS DOCUMENT INTELLIGENCE");
        console.log("================================");
        console.log("PDF :",pdfUrl);

        //--------------------------------------------------
        // PDF İNDİR
        //--------------------------------------------------

        const response = await fetch(pdfUrl);

        if(!response.ok){

            throw new Error("PDF indirilemedi");

        }

        const arrayBuffer = await response.arrayBuffer();

        console.log("PDF Boyutu :",arrayBuffer.byteLength);

        //--------------------------------------------------
        // PDF PARSER
        //--------------------------------------------------

        let pdfText="";

        try{

            const pdfjs=await getPdfJs();

            const loadingTask=pdfjs.getDocument({

                data:new Uint8Array(arrayBuffer)

            });

            const pdf=await loadingTask.promise;

            console.log("Sayfa :",pdf.numPages);

            for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){

                const page=await pdf.getPage(pageNo);

                const textContent=await page.getTextContent();

                const pageText=textContent.items
                    .map(item=>item.str)
                    .join(" ");

                pdfText += pageText + "\n";

            }

            pdfText = pdfText
                .replace(/\s+/g," ")
                .replace(/\n\s+/g,"\n")
                .trim();

            console.log("Metin uzunluğu :",pdfText.length);

        }catch(err){

            console.error("PDF Parser Hatası :",err);

        }

        //--------------------------------------------------
        // pdfjs yetersiz kaldıysa pdf-parse dene
        //--------------------------------------------------

        if(pdfText.length < 100){

            console.log("pdfjs yetersiz, pdf-parse deneniyor...");

            const altText = await extractWithPdfParse(arrayBuffer);

            if(altText.length > pdfText.length){

                pdfText = altText
                    .replace(/\s+/g," ")
                    .trim();

            }

            console.log("pdf-parse sonrası metin uzunluğu :",pdfText.length);

        }

        //--------------------------------------------------
        // Parser başarılıysa Regex'e geç
        //--------------------------------------------------

        if(pdfText.length>100){

            console.log("PDF Parser başarılı.");

        }else{

            console.log("PDF metni çıkarılamadı, OpenAI dosya analizi deneniyor...");

            const openAiResult = await analyzePdfWithOpenAI(arrayBuffer);

            if(openAiResult && openAiResult.success){

                return openAiResult;

            }

            return {
                success:false,
                error:"PDF metni çıkarılamadı.",
                document_type:"BILINMIYOR",
                tax_type:"",
                amount:0,
                raw_text:""
            };

        }
//------------------------------------------------------------
// BELGE TÜRÜ TESPİTİ
//------------------------------------------------------------

function classifyDocument(text){

    const upper=text.toUpperCase();

    return{

        type:"TAHAKKUK",

        subtype:detectTaxType(upper)

    };

}

function detectTaxType(text){

    if(text.includes("KATMA DEĞER VERGİSİ"))
        return "KDV";

    if(text.includes("KDV"))
        return "KDV";

    if(text.includes("MUHTASAR"))
        return "MUHTASAR";

    if(text.includes("SGK"))
        return "SGK";

    if(text.includes("SOSYAL GÜVENLİK"))
        return "SGK";

    if(text.includes("KURUMLAR VERGİSİ"))
        return "KURUMLAR";

    if(text.includes("GELİR VERGİSİ"))
        return "GELIR";

    if(text.includes("GEÇİCİ VERGİ"))
        return "GECICI";

    if(text.includes("DAMGA VERGİSİ"))
        return "DAMGA";

    return "DIGER";

}

//------------------------------------------------------------
// REGEX ENGINE
//------------------------------------------------------------

function parseDocumentWithRegex(text,documentType){

    switch(documentType.subtype){

        case "KDV":

        case "MUHTASAR":

        case "KURUMLAR":

        case "GELIR":

        case "GECICI":

        case "DAMGA":

            return parseTahakkukRegex(text,documentType.subtype);

        case "SGK":

            return parseSGKRegex(text);

        default:

            return parseGenericRegex(text);

    }

}

//------------------------------------------------------------
// TÜRKÇE PARA FORMATI PARSER
//------------------------------------------------------------

function parseTurkishAmount(str){

    if(!str) return 0;

    const cleaned=String(str)
        .replace(/[^\d.,-]/g,"")
        .replace(/\./g,"")
        .replace(",",".");

    const num=parseFloat(cleaned);

    return isNaN(num) ? 0 : num;

}

//------------------------------------------------------------
// SGK TAHAKKUK PARSER
//------------------------------------------------------------

function parseSGKRegex(text){

    const result={

        success:true,

        document_type:"TAHAKKUK",

        tax_type:"SGK",

        period:"",

        amount:0,

        tax_base:0,

        due_date:"",

        company:"",

        vkn:"",

        accrual_no:""

    };

    // DÖNEM : 2026/07 veya 07/2026
    const period=text.match(/(20\d\d)\s*[\/.]\s*(\d{2})/);

    if(period){

        result.period=`${period[1]}/${period[2]}`;

    }else{

        const period2=text.match(/(\d{2})\s*[\/.]\s*(20\d\d)/);

        if(period2){

            result.period=`${period2[2]}/${period2[1]}`;

        }

    }

    // TUTAR
    const totalPatterns=[

        /TAHAKKUK\s*TUTARI[\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,

        /ÖDENECEK\s*TUTAR[\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,

        /TOPLAM\s*BOR[CÇ][\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,

        /GENEL\s*TOPLAM[\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,

        /TOPLAM[\s\S]{0,30}?(\d{1,3}(?:\.\d{3})*,\d{2})/i

    ];

    for(const pattern of totalPatterns){

        const m=text.match(pattern);

        if(m){

            result.amount=parseTurkishAmount(m[1]);

            break;

        }

    }

    // SON ÖDEME TARİHİ
    const due=text.match(/(\d{2})[.\/](\d{2})[.\/](20\d\d)/);

    if(due){

        result.due_date=`${due[3]}-${due[2]}-${due[1]}`;

    }

    // BELGE NO
    const belge=text.match(/(?:BELGE|TAHAKKUK)\s*NO[: ]*([\w]+)/i);

    if(belge){

        result.accrual_no=belge[1];

    }

    // VKN / İŞYERİ SİCİL
    const vkn=text.match(/\b\d{10,11}\b/);

    if(vkn){

        result.vkn=vkn[0];

    }

    console.log(result);

    return result;

}

//------------------------------------------------------------
// GENEL PARSER (BİLİNMEYEN TÜR)
//------------------------------------------------------------

function parseGenericRegex(text){

    const result={

        success:true,

        document_type:"TAHAKKUK",

        tax_type:"DIGER",

        period:"",

        amount:0,

        tax_base:0,

        due_date:"",

        company:"",

        vkn:"",

        accrual_no:""

    };

    const period=text.match(/20\d\d\s*\/\s*\d\d/);

    if(period){

        result.period=period[0].replace(/\s/g,"");

    }

    // En büyük tutarı ödenecek olarak al
    const moneyRegex=/\d{1,3}(?:\.\d{3})*,\d{2}/g;

    const amounts=[...text.matchAll(moneyRegex)]
        .map(m=>parseTurkishAmount(m[0]))
        .filter(n=>n>0);

    if(amounts.length>0){

        result.amount=Math.max(...amounts);

    }

    const due=text.match(/(\d{2})[.\/](\d{2})[.\/](20\d\d)/);

    if(due){

        result.due_date=`${due[3]}-${due[2]}-${due[1]}`;

    }

    const vkn=text.match(/\b\d{10}\b/);

    if(vkn){

        result.vkn=vkn[0];

    }

    console.log(result);

    return result;

}

//------------------------------------------------------------
// TAHAKKUK PARSER
//------------------------------------------------------------

function parseTahakkukRegex(text,taxType){

    const result={

        success:true,

        document_type:"TAHAKKUK",

        tax_type:taxType,

        period:"",

        amount:0,

        tax_base:0,

        due_date:"",

        company:"",

        vkn:"",

        accrual_no:""

    };

    //--------------------------------------------------
    // DÖNEM
    //--------------------------------------------------

    const period=text.match(/20\d\d\s*\/\s*\d\d/);

    if(period){

        result.period=period[0].replace(/\s/g,"");

    }

    //--------------------------------------------------
    // TÜM TUTARLARI BUL
    //--------------------------------------------------

    const moneyRegex=/\d{1,3}(?:\.\d{3})*,\d{2}/g;

    const amounts=[...text.matchAll(moneyRegex)];

    console.log("Bulunan Tutarlar",amounts.map(x=>x[0]));

    //--------------------------------------------------
    // TOPLAM ÖDENECEK
    //--------------------------------------------------

    const totalPatterns=[

        /TOPLAM\s+ÖDENECEK[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,

        /ÖDENECEK\s+TUTAR[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,

        /YATIRILMASI\s+GEREKEN[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,

        /GENEL\s+TOPLAM[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i

    ];

    for(const pattern of totalPatterns){

        const m=text.match(pattern);

        if(m){

            result.amount=parseTurkishAmount(m[1]);

            break;

        }

    }

    //--------------------------------------------------
    // VERGİ ASLI
    //--------------------------------------------------

    const taxBase=text.match(

        /VERGİ\s+ASLI[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i

    );

    if(taxBase){

        result.tax_base=parseTurkishAmount(taxBase[1]);

    }

    //--------------------------------------------------
    // SON ÖDEME
    //--------------------------------------------------

    const due=text.match(

        /(\d{2})[./](\d{2})[./](20\d\d)/

    );

    if(due){

        result.due_date=

            `${due[3]}-${due[2]}-${due[1]}`;

    }

    //--------------------------------------------------
    // VKN
    //--------------------------------------------------

    const vkn=text.match(/\b\d{10}\b/);

    if(vkn){

        result.vkn=vkn[0];

    }

    //--------------------------------------------------
    // TAHAKKUK NO
    //--------------------------------------------------

    const tah=text.match(/TAHAKKUK\s*NO[: ]*(\d+)/i);

    if(tah){

        result.accrual_no=tah[1];

    }

    //--------------------------------------------------
    // FİRMA
    //--------------------------------------------------

    const firma=text.match(

        /MÜKELLEF[\s:]+(.+)/i

    );

    if(firma){

        result.company=firma[1].trim();

    }

    //--------------------------------------------------

    if(result.amount===0 && result.tax_base>0){

        result.amount=result.tax_base;

    }

    console.log(result);

    return result;

}
//------------------------------------------------------------
// TAX TYPE NORMALIZASYON
//------------------------------------------------------------

function normalizeTaxType(value){

    const v=String(value||"").toUpperCase();

    if(v.includes("KATMA DEĞER") || v.includes("KDV")) return "KDV";
    if(v.includes("MUHTASAR")) return "MUHTASAR";
    if(v.includes("SOSYAL GÜVENLİK") || v.includes("SGK")) return "SGK";
    if(v.includes("KURUMLAR VERGİSİ") || v.includes("KURUMLAR")) return "KURUMLAR";
    if(v.includes("GELİR VERGİSİ") || v.includes("GELIR") || v.includes("GELİR")) return "GELIR";
    if(v.includes("GEÇİCİ VERGİ") || v.includes("GECICI") || v.includes("GEÇİCİ")) return "GECICI";
    if(v.includes("DAMGA VERGİSİ") || v.includes("DAMGA")) return "DAMGA";

    return "";

}

//------------------------------------------------------------
// TUTAR DOGRULAMA (AI rakam transpose korumasi)
//------------------------------------------------------------
// AI bazen rakamlarin yerini karistirir (53.456,37 -> 53.546,37).
// Sonuc tutari PDF metninde birebir ara; yoksa metinde ayni rakam
// kumesine sahip gercek degeri bul ve onu kullan.

function digitSignature(num){

    return num.toFixed(2).replace(/[^\d]/g,"").split("").sort().join("");

}

function validateAmountAgainstText(amount, text){

    if(!amount || !text) return amount;

    const formatted = amount.toLocaleString("tr-TR",{
        minimumFractionDigits:2,
        maximumFractionDigits:2
    });

    // Metinde birebir geciyorsa guvenilir
    if(text.includes(formatted)) return amount;

    // Metindeki tum para degerlerini cikar
    const moneyRegex=/\d{1,3}(?:\.\d{3})*,\d{2}/g;

    const candidates=[...text.matchAll(moneyRegex)]
        .map(m=>({ raw:m[0], value:parseTurkishAmount(m[0]) }))
        .filter(c=>c.value>0);

    // Ayni rakam kumesine sahip adaylari bul (transpose tespiti)
    const sig=digitSignature(amount);

    const sameDigits=candidates.filter(c=>digitSignature(c.value)===sig);

    if(sameDigits.length>0){

        // Birden fazlaysa AI degerine en yakin olani sec
        sameDigits.sort((a,b)=>Math.abs(a.value-amount)-Math.abs(b.value-amount));

        console.warn(`Tutar transpose tespiti: ${formatted} metinde yok, ${sameDigits[0].raw} kullaniliyor`);

        return sameDigits[0].value;

    }

    return amount;

}

//------------------------------------------------------------
// AI FALLBACK (TEMİZLENMİŞ)
//------------------------------------------------------------

async function analyzeWithAI(pdfUrl, arrayBuffer, pdfText = "") {

    try {

        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
            throw new Error("GROQ_API_KEY bulunamadı.");
        }

        let documentText = pdfText;
        if (!documentText || documentText.length < 20) {
            documentText = "PDF Parser metni çıkaramadı. Belge OCR gerektiriyor.";
        }

        const prompt = `
Sen deneyimli bir Türk vergi uzmanısın.
Sana tahakkuk belgesi metni verilecektir.
SADECE JSON döndür.
Hiçbir açıklama yazma.
vergi_turu sadece aşağıdakilerden biri olabilir: KDV, MUHTASAR, SGK, KURUMLAR, GELIR, GECICI, DAMGA, DIGER

ÖNEMLİ KURALLAR:
- Belgede birden fazla tutar satırı varsa, "ÖDENECEK OLAN" sütunundaki TÜM değerleri topla.
- Eğer belgede "TOPLAM" satırı varsa, o satırdaki ödenecek değerini kullan.
- toplam_odenecek alanına yalnızca nihai ödenecek tutarı yaz; matrah, vergi aslı veya oran DEĞİL.
- Türkçe sayı formatı: 1.234.567,89 = 1234567.89

JSON
{
"vergi_turu":"",
"donem":"",
"vergi_asli":0,
"toplam_odenecek":0,
"son_odeme":"",
"vkn":"",
"unvan":"",
"tahakkuk_no":""
}

Belge

${documentText.substring(0,5000)}
`;

        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${groqApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    temperature: 0,
                    messages: [{ role: "user", content: prompt }]
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const content = data.choices[0].message.content;
        const json = content.match(/\{[\s\S]*\}/);
        if (!json) {
            throw new Error("JSON bulunamadı.");
        }

        const result = JSON.parse(json[0]);

        // AI tutarini PDF metnine karsi dogrula (rakam transpose korumasi)
        const validatedAmount = validateAmountAgainstText(Number(result.toplam_odenecek), documentText);

        return {
            success: true,
            document_type: "TAHAKKUK",
            tax_type: normalizeTaxType(result.vergi_turu),
            period: result.donem,
            amount: validatedAmount,
            tax_base: Number(result.vergi_asli),
            due_date: result.son_odeme,
            company: result.unvan,
            vkn: result.vkn,
            accrual_no: result.tahakkuk_no,
            raw_text: documentText
        };

    } catch (err) {

        console.error(err);
        return {
            success: false,
            error: err.message,
            document_type: "BILINMIYOR",
            tax_type: "",
            amount: 0,
            period: "",
            due_date: "",
            company: "",
            vkn: "",
            accrual_no: "",
            raw_text: pdfText
        };

    }

}
//------------------------------------------------------------
// OPENAI DOSYA ANALİZİ (metin çıkarılamayan PDF'ler için)
//------------------------------------------------------------
// pdfjs/pdf-parse metin çıkaramazsa (ör. SGK fişleri), PDF'i
// doğrudan base64 olarak OpenAI'a gönderir; model dosyayı görsel
// olarak okuyup JSON döndürür.

async function analyzePdfWithOpenAI(arrayBuffer) {

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    try {

        const base64 = Buffer.from(arrayBuffer).toString("base64");

        const prompt = `Sen deneyimli bir Türk muhasebe uzmanısın.
Sana bir tahakkuk fişi PDF'i verilecek (GİB veya SGK).
Belgeyi oku ve SADECE JSON döndür. Hiçbir açıklama yazma.

vergi_turu sadece aşağıdakilerden biri olabilir: KDV, MUHTASAR, SGK, KURUMLAR, GELIR, GECICI, DAMGA, DIGER

KURALLAR:
- toplam_odenecek: fişteki nihai ödenecek tutar. SGK fişlerinde "Tahakkuk Eden" veya "Ödenecek Tutar" toplamıdır; birden fazla satır varsa toplamını al.
- Rakamları HANE HANE, soldan sağa tek tek oku. 14.190 ile 14.390 gibi benzer sayıları karıştırma; önce binler, sonra yüzler hanesini ayrı ayrı teyit et.
- Tutarı JSON'a yazmadan önce belgedeki sayıyla birebir karşılaştır; emin olamadığın haneyi tahmin etme, belgeye tekrar bak.
- Türkçe sayı formatı: 1.234.567,89 = 1234567.89
- donem: "YYYY/MM" formatında (ör. 2026/06)
- son_odeme: "YYYY-MM-DD" formatında

JSON:
{
"vergi_turu":"",
"donem":"",
"vergi_asli":0,
"toplam_odenecek":0,
"son_odeme":"",
"vkn":"",
"unvan":"",
"tahakkuk_no":""
}`;

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
                    max_tokens: 800,
                    messages: [{
                        role: "user",
                        content: [
                            {
                                type: "file",
                                file: {
                                    filename: "tahakkuk.pdf",
                                    file_data: `data:application/pdf;base64,${base64}`
                                }
                            },
                            { type: "text", text: prompt }
                        ]
                    }]
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            console.error("OpenAI hatası:", data.error.message);
            return null;
        }

        const content = data.choices?.[0]?.message?.content || "";
        const json = content.match(/\{[\s\S]*\}/);
        if (!json) {
            console.error("OpenAI JSON bulunamadı");
            return null;
        }

        const result = JSON.parse(json[0]);
        const amount = Number(result.toplam_odenecek) || 0;

        if (amount <= 0) {
            console.error("OpenAI tutar okuyamadı");
            return null;
        }

        console.log("OpenAI dosya analizi başarılı, tutar:", amount);

        return {
            success: true,
            document_type: "TAHAKKUK",
            tax_type: normalizeTaxType(result.vergi_turu),
            period: result.donem || "",
            amount: amount,
            tax_base: Number(result.vergi_asli) || 0,
            due_date: result.son_odeme || "",
            company: result.unvan || "",
            vkn: result.vkn || "",
            accrual_no: result.tahakkuk_no || "",
            raw_text: "[OpenAI görsel analiz]"
        };

    } catch (err) {

        console.error("OpenAI dosya analizi hatası:", err);
        return null;

    }

}
//--------------------------------------------------
// REGEX ANALİZİ
//--------------------------------------------------

const documentInfo = classifyDocument(pdfText);

const result = parseDocumentWithRegex(pdfText, documentInfo);
result.tax_type = normalizeTaxType(result.tax_type || documentInfo.subtype);

//--------------------------------------------------
// CONFIDENCE SCORE
//--------------------------------------------------

let confidence = 0;

if (result.tax_type && result.tax_type !== "DIGER")
    confidence += 25;

if (result.amount > 0)
    confidence += 35;

if (result.period)
    confidence += 15;

if (result.vkn)
    confidence += 10;

if (result.due_date)
    confidence += 15;

result.confidence = confidence;

//--------------------------------------------------
// TUTAR DOGRULAMA (transpose korumasi)
//--------------------------------------------------

result.amount = validateAmountAgainstText(result.amount, pdfText);

//--------------------------------------------------
// ANALİZ BAŞARILI MI?
//--------------------------------------------------

if (confidence >= 60) {

    console.log("✅ Regex başarılı");
    console.log(result);

    //--------------------------------------------------
    // SUPABASE KAYDET
    //--------------------------------------------------

    try {

        if(process.env.SUPABASE_URL &&
           process.env.SUPABASE_SERVICE_ROLE_KEY){

            const { createClient } =
                await import("@supabase/supabase-js");

            const supabase = createClient(

                process.env.SUPABASE_URL,

                process.env.SUPABASE_SERVICE_ROLE_KEY

            );

            await supabase
                .from("tahakkuklar")
                .upsert({

                    pdf_url: pdfUrl,

                    tax_type: result.tax_type,

                    period: result.period,

                    amount: result.amount,

                    tax_base: result.tax_base,

                    due_date: result.due_date,

                    company: result.company,

                    vkn: result.vkn,

                    accrual_no: result.accrual_no,

                    raw_text: pdfText,

                    confidence: confidence,

                    created_at:new Date()

                });

            console.log("✅ Supabase kayıt başarılı");

        }

    }

    catch(err){

        console.error("Supabase kayıt hatası",err);

    }

    //--------------------------------------------------

    return {

        success:true,

        ...result,

        raw_text:pdfText

    };

}

//--------------------------------------------------
// Regex başarısızsa AI dene
//--------------------------------------------------

if (process.env.GROQ_API_KEY) {

    try {

        const aiResult = await analyzeWithAI(pdfUrl, arrayBuffer, pdfText);
        if (aiResult && aiResult.success) {
            return aiResult;
        }

    } catch (aiErr) {

        console.error("AI fallback hatası", aiErr);

    }

}

//--------------------------------------------------
// Groq da başarısızsa OpenAI dosya analizi dene
//--------------------------------------------------

const openAiResult = await analyzePdfWithOpenAI(arrayBuffer);

if (openAiResult && openAiResult.success) {

    return openAiResult;

}

return {
    success:false,
    error:"PDF metni çıkarılamadı veya güvenilir analiz yapılamadı.",
    document_type: "BILINMIYOR",
    tax_type: "",
    amount: 0,
    period: "",
    due_date: "",
    company: "",
    vkn: "",
    accrual_no: "",
    raw_text: pdfText
};

}