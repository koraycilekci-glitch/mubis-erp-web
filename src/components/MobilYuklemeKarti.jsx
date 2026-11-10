import { useState } from 'react'
import { Smartphone, Download, ChevronDown, ChevronUp, ScanLine } from 'lucide-react'

// APK sürümü güncellendiğinde bu linki yeni EAS derlemesinin buildUrl'i ile değiştirin.
export const MOBIL_APK_URL = 'https://expo.dev/artifacts/eas/Tybi2Cehs9lWjxEMqCkV0LWT2XshF-vmGpvNpjYm4f8.apk'
export const MOBIL_SURUM = '1.2.1'

// Mobil tarama uygulaması yükleme kartı — admin Taramalar sayfası + müşteri portalı
export default function MobilYuklemeKarti({ baslik = 'Mobil Tarama Uygulaması' }) {
  const [acik, setAcik] = useState(false)
  return (
    <div className="bg-gradient-to-r from-blue-950/60 to-cyan-950/30 border border-cyan-800/40 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="text-white font-semibold">{baslik}</div>
            <div className="text-gray-400 text-xs mt-0.5">Android · v{MOBIL_SURUM} · Fiş ve Z raporu tarama</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={MOBIL_APK_URL} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
            <Download className="w-4 h-4" /> APK'yı İndir
          </a>
          <button onClick={() => setAcik(a => !a)}
            className="flex items-center gap-1.5 bg-blue-900/60 hover:bg-blue-800 text-blue-200 rounded-lg px-3 py-2 text-xs font-medium transition">
            Yükleme Adımları {acik ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {acik && (
        <ol className="mt-3 space-y-1.5 text-sm text-gray-300 border-t border-cyan-900/40 pt-3 list-decimal list-inside">
          <li>Yukarıdaki <b className="text-cyan-300">APK'yı İndir</b> düğmesiyle dosyayı telefonunuza indirin.</li>
          <li>İndirilen dosyaya dokunun. "Bilinmeyen kaynak" uyarısı çıkarsa <b>Ayarlar → İzin ver</b> deyin (tek seferlik).</li>
          <li><b>Yükle</b> deyin — uygulama telefona "MUBiS Tarama" olarak kurulur.</li>
          <li>Uygulamayı açın, MUBiS e-posta ve şifrenizle giriş yapın.</li>
          <li><ScanLine className="w-3.5 h-3.5 inline text-cyan-300" /> Müşteri ve dönem seçin, kamerayla çekin veya galeriden seçip gönderin.</li>
        </ol>
      )}
    </div>
  )
}
