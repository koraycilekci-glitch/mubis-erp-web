import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Calendar, AlertTriangle, CheckCircle, Clock, Download, MessageCircle, Mail, X, FileText, RefreshCw } from 'lucide-react'
import { getFormattedBeyanDeadline, getMonthName, getBeyanStorageKey } from '../utils/dateUtils'
import { getTahakkukList, sumTahakkukTutar } from '../utils/tahakkukUtils'
import { supabase } from '../lib/supabase'
import { sendEmail, openWhatsAppWeb } from '../services/whatsappService'
import { getSettings } from '../services/settingsService'
import { analyzeDocument } from '../services/documentIntelligenceEngine'

export default function VergiTakvimi({ clientId, beyanDurumlari: propBeyanDurumlari, onBeyanDurumlariUpdate }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  
  const [beyanDurumlari, setBeyanDurumlari] = useState(propBeyanDurumlari || {})
  const [loading, setLoading] = useState(true)
  const [selectedTahakkuk, setSelectedTahakkuk] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [settings, setSettings] = useState(null)
  const [documentUrl, setDocumentUrl] = useState(null)
  const analyzingRef = useRef(new Set())
  const attemptedAnalysisRef = useRef(new Set())

  useEffect(() => {
    setBeyanDurumlari(propBeyanDurumlari || {})
    setLoading(false)
    attemptedAnalysisRef.current = new Set()

    // TANI: SGK ile ilgili tum anahtarlari konsola dok (coklu tahakkuk sorunu tespiti)
    const map = propBeyanDurumlari || {}
    const sgkKeys = Object.keys(map).filter(k => k.includes('sgk'))
    if (sgkKeys.length > 0) {
      console.log('=== SGK TANI ===')
      sgkKeys.forEach(k => {
        const v = map[k]
        if (Array.isArray(v)) {
          console.log(k, `(${v.length} kayit):`, v.map(i => i?.url || i))
        } else {
          console.log(k, ':', v)
        }
      })
      console.log('================')
    }
  }, [propBeyanDurumlari])

  useEffect(() => {
    if (clientId) {
      loadSettings()
    }
  }, [clientId])

  const loadSettings = async () => {
    try {
      const s = await getSettings()
      setSettings(s)
    } catch (e) {
      console.error('Ayarlar yuklenemedi:', e)
    }
  }

  const resolveStatusKey = useCallback((item) => {
    const filingMonth = item.filingMonth != null ? item.filingMonth : month
    const filingYear = item.filingYear != null ? item.filingYear : year
    const storage = getBeyanStorageKey(item.type, filingYear, filingMonth)
    return storage?.statusKey || `${filingYear}_${filingMonth}_${item.type}`
  }, [month, year])

  const getTahakkukStatus = useCallback((item) => {
    const statusKey = resolveStatusKey(item)
    const durum = beyanDurumlari[statusKey] || 'yapilamadi'
    const tahakkuklar = getTahakkukList(beyanDurumlari, statusKey)
    const tahakkukUrl = tahakkuklar.length > 0 ? tahakkuklar[tahakkuklar.length - 1].url : null
    // Toplam tutar: liste varsa listedeki tutarlarin toplami, yoksa tek tutar alani
    const tutar = tahakkuklar.length > 0
      ? sumTahakkukTutar(tahakkuklar)
      : (Number(beyanDurumlari[`${statusKey}_tutar`]) || 0)
    const analizDurumu = beyanDurumlari[`${statusKey}_analiz_durumu`] || ''
    const sonOdeme = beyanDurumlari[`${statusKey}_son_odeme`] || ''
    const hasTahakkuk = tahakkuklar.length > 0 || tutar > 0

    return {
      tutar,
      durum,
      hasTahakkuk,
      analizDurumu,
      tahakkukUrl,
      tahakkuklar,
      sonOdeme,
      isHazirlaniyor: !hasTahakkuk && (durum === 'hazir' || durum === 'onaylandi'),
      isTamamlandi: durum === 'tahakkuk_gonderildi',
      statusKey
    }
  }, [beyanDurumlari, resolveStatusKey])

  const sortedTum = useMemo(() => {
    const current = new Date()
    const calendarItems = [
      { id: 'kdv', name: 'KDV', day: 28, type: 'kdv' },
      { id: 'kdv2', name: 'KDV2', day: 25, type: 'kdv2' },
      { id: 'muhtasar', name: 'Muhtasar', day: 26, type: 'muhtasar' },
      { id: 'sgk', name: 'SGK', day: 31, type: 'sgk' },
    ]

    const specialItems = []
    if (month === 1) {
      specialItems.push({ id: 'gecici_vergi', name: 'Gecici Vergi (4. Donem)', day: 17, type: 'gecici_vergi' })
    }
    if (month === 2) {
      specialItems.push({ id: 'gelir_vergi', name: 'Gelir Vergisi', day: 31, type: 'gelir_vergi' })
    }
    if (month === 3) {
      specialItems.push({ id: 'kurumlar_vergi', name: 'Kurumlar Vergisi', day: 30, type: 'kurumlar_vergi' })
    }
    if (month === 4) {
      specialItems.push({ id: 'gecici_vergi', name: 'Gecici Vergi (1. Donem)', day: 17, type: 'gecici_vergi' })
    }
    if (month === 7) {
      specialItems.push({ id: 'gecici_vergi', name: 'Gecici Vergi (2. Donem)', day: 17, type: 'gecici_vergi' })
    }
    if (month === 10) {
      specialItems.push({ id: 'gecici_vergi', name: 'Gecici Vergi (3. Donem)', day: 17, type: 'gecici_vergi' })
    }

    const allItems = [...calendarItems, ...specialItems].map(i => {
      const dl = getFormattedBeyanDeadline(year, month, i.day)
      const tahakkukInfo = getTahakkukStatus({ ...i, filingMonth: month, filingYear: year })

      return {
        ...i,
        filingMonth: month,
        filingYear: year,
        deadline: dl,
        deadlineDate: new Date(dl),
        gecmi: new Date(dl) < current,
        daysUntil: Math.ceil((new Date(dl) - current) / (1000 * 60 * 60 * 24)),
        ...tahakkukInfo,
        // Son odeme tarihi her zaman takvimden hesaplanan resmi tarih olsun
        // (DB'deki eski kayitlarda PDF'ten okunmus yanlis tarih kalabiliyor)
        sonOdeme: dl
      }
    })

    return allItems.sort((a, b) => {
      if (a.gecmi && !b.gecmi) return 1
      if (!a.gecmi && b.gecmi) return -1
      return a.deadlineDate - b.deadlineDate
    })
  }, [year, month, getTahakkukStatus])

  // patch: sadece bu bilesenin degistirdigi alanlar.
  // DB'den en guncel kaydi okuyup uzerine uygulariz; aksi halde admin
  // panelinden yapilan eszamanli degisiklikler (yeni tahakkuk) ezilir.
  const persistBeyanDurumlari = useCallback(async (patch) => {
    if (!clientId || !patch || Object.keys(patch).length === 0) return

    try {
      const { data: latest, error: readError } = await supabase
        .from('clients')
        .select('beyan_durumlari')
        .eq('id', clientId)
        .single()

      if (readError) throw readError

      const merged = { ...(latest?.beyan_durumlari || {}), ...patch }

      setBeyanDurumlari(merged)
      onBeyanDurumlariUpdate?.(merged)

      const { error } = await supabase
        .from('clients')
        .update({ beyan_durumlari: merged })
        .eq('id', clientId)

      if (error) {
        console.error('Tahakkuk tutari kaydedilemedi:', error)
      }
    } catch (err) {
      console.error('Beyan durumlari kayit hatasi:', err)
    }
  }, [clientId, onBeyanDurumlariUpdate])

  const runTahakkukAnalysis = useCallback(async (item, tahakkukUrl) => {
    if (!tahakkukUrl || analyzingRef.current.has(tahakkukUrl)) return

    analyzingRef.current.add(tahakkukUrl)

    setBeyanDurumlari(prev => ({
      ...prev,
      [`${item.statusKey}_analiz_durumu`]: 'analiz_ediliyor'
    }))

    try {
      const result = await analyzeDocument(tahakkukUrl)
      let patch = null

      setBeyanDurumlari(prev => {
        const next = { ...prev }
        const listKey = `${item.statusKey}_tahakkuklar`
        const list = getTahakkukList(next, item.statusKey)

        if (result.success && Number(result.amount) > 0) {
          // Bu dosyanin tutarini listeye yaz, toplami hesapla
          const newList = list.map(t =>
            t.url === tahakkukUrl
              ? { ...t, tutar: Number(result.amount), analiz_durumu: 'tamamlandi', son_odeme: item.deadline || result.due_date || '', vergi_turu: result.tax_type || '' }
              : t
          )
          next[listKey] = newList
          next[`${item.statusKey}_tutar`] = sumTahakkukTutar(newList)
          next[`${item.statusKey}_analiz_durumu`] = 'tamamlandi'
          // Son odeme tarihi olarak takvimde hesaplanan resmi tarihi kullan
          next[`${item.statusKey}_son_odeme`] = item.deadline || result.due_date || ''
          next[`${item.statusKey}_vergi_turu`] = result.tax_type || ''
          next[`${item.statusKey}_analiz_url`] = tahakkukUrl
          console.log('Tahakkuk tutari okundu:', item.name, result.amount, '- toplam:', next[`${item.statusKey}_tutar`])
        } else {
          const newList = list.map(t =>
            t.url === tahakkukUrl ? { ...t, analiz_durumu: 'basarisiz' } : t
          )
          next[listKey] = newList
          next[`${item.statusKey}_tutar`] = sumTahakkukTutar(newList)
          next[`${item.statusKey}_analiz_durumu`] = 'basarisiz'
          next[`${item.statusKey}_analiz_hata`] = result.error || 'Belge analiz edilemedi'
        }

        // Sadece bu analizin degistirdigi alanlari patch olarak topla;
        // persist sirasinda en guncel DB kaydiyla birlestirilecek
        patch = {}
        Object.keys(next).forEach(k => {
          if (next[k] !== prev[k]) patch[k] = next[k]
        })

        return next
      })

      if (patch && Object.keys(patch).length > 0) {
        await persistBeyanDurumlari(patch)
      }
    } catch (err) {
      console.error('Tahakkuk analiz hatasi:', err)
      const failPatch = {
        [`${item.statusKey}_analiz_durumu`]: 'basarisiz',
        [`${item.statusKey}_analiz_hata`]: err.message || 'Bilinmeyen hata'
      }
      setBeyanDurumlari(prev => ({ ...prev, ...failPatch }))
      await persistBeyanDurumlari(failPatch)
    } finally {
      analyzingRef.current.delete(tahakkukUrl)
    }
  }, [persistBeyanDurumlari])

  useEffect(() => {
    if (!clientId || loading) return

    sortedTum.forEach(item => {
      const list = item.tahakkuklar || []
      list.forEach(t => {
        if (!t.url) return
        // Bu dosya zaten basariyla analiz edildiyse atla
        if (Number(t.tutar) > 0 && t.analiz_durumu === 'tamamlandi') return
        if (t.analiz_durumu === 'analiz_ediliyor') return
        if (attemptedAnalysisRef.current.has(t.url)) return

        attemptedAnalysisRef.current.add(t.url)
        runTahakkukAnalysis(item, t.url)
      })
    })
  }, [clientId, loading, propBeyanDurumlari, runTahakkukAnalysis, sortedTum])

  const handleTahakkukClick = async (item) => {
    if (!item.hasTahakkuk) return

    setSelectedTahakkuk(item)
    setShowModal(true)
    setModalLoading(false)
    // Son tahakkuku varsayilan dokuman olarak sec (WhatsApp/mail gonderimi icin)
    const list = item.tahakkuklar || []
    setDocumentUrl(list.length > 0 ? list[list.length - 1].url : item.tahakkukUrl || null)
  }

  const handleDownload = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank')
    }
  }

  const handleWhatsAppSend = async () => {
    if (!documentUrl || !selectedTahakkuk) return

    try {
      const { data: client } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', clientId)
        .single()

      const message = `${selectedTahakkuk.name} tahakkuk dokumaniniz hazirdir.\n\nIndirmek icin linke tiklayin:\n${documentUrl}\n\nSaygilarimizla,\nMUBiS ERP`
      openWhatsAppWeb({ phone: client.phone, message })

      alert('WhatsApp penceresi acildi. Mesaji WhatsApp uzerinden gonderin.')
    } catch (err) {
      alert('Gonderim hatasi: ' + err.message)
    }
  }

  const handleEmailSend = async () => {
    if (!documentUrl || !selectedTahakkuk) return
    
    try {
      const { data: client } = await supabase
        .from('clients')
        .select('email')
        .eq('id', clientId)
        .single()
      
      await sendEmail({
        to: client.email,
        subject: `${selectedTahakkuk.name} Tahakkuk Dokumani`,
        body: `${selectedTahakkuk.name} tahakkuk dokumani ekte sunulmustur.`,
        smtpConfig: settings
      })
      
      alert('E-posta ile gonderildi!')
    } catch (err) {
      alert('Gonderim hatasi: ' + err.message)
    }
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-2xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-yellow-400" />
            {getMonthName(month)} {year} Vergi Takvimi
          </h3>
        </div>
        <div className="text-center py-8 text-gray-400">Yukleniyor...</div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-2xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-yellow-400" />
            {getMonthName(month)} {year} Vergi Takvimi
          </h3>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedTum.map(item => (
            <div 
              key={item.id + item.filingMonth} 
              onClick={() => item.hasTahakkuk && handleTahakkukClick(item)}
              className={`rounded-xl p-4 border transition-all ${
                item.gecmi 
                  ? 'bg-blue-900/10 border-blue-800/20 opacity-60' 
                  : item.isTamamlandi
                    ? 'bg-green-900/20 border-green-500/30'
                    : item.hasTahakkuk
                      ? 'bg-blue-800/30 border-blue-500/40 cursor-pointer hover:bg-blue-700/30 hover:border-blue-400/50'
                      : 'bg-blue-800/20 border-blue-700/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-white">{item.name}</div>
                {item.isTamamlandi && (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                )}
                {item.isHazirlaniyor && !item.isTamamlandi && (
                  <Clock className="w-4 h-4 text-blue-400" />
                )}
                {!item.isHazirlaniyor && !item.isTamamlandi && (
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                )}
              </div>
              
              <div className={`text-lg font-bold ${item.gecmi ? 'text-gray-500' : 'text-white'}`}>
                {item.deadline.split('-').reverse().join('.')}
              </div>
              
              {!item.gecmi && (
                <div className="text-xs text-gray-400 mt-1">
                  {item.daysUntil === 0 ? 'Bugun son gun!' : 
                   item.daysUntil < 0 ? `${Math.abs(item.daysUntil)} gun gecti` :
                   `${item.daysUntil} gun kaldi`}
                </div>
              )}
              
              <div className="mt-2">
                {item.hasTahakkuk ? (
                  <div className="space-y-1">
                    {/* Coklu tahakkuk: her biri ayri satirda */}
                    {(item.tahakkuklar || []).length > 1 ? (
                      <div className="space-y-1">
                        {item.tahakkuklar.map((t, idx) => (
                          <div key={t.url} className="text-xs flex items-center justify-between gap-2">
                            <span className="text-gray-400 truncate">Tahakkuk {idx + 1}</span>
                            <span className={Number(t.tutar) > 0 ? 'text-green-400 font-medium' : t.analiz_durumu === 'analiz_ediliyor' ? 'text-blue-400' : 'text-orange-400'}>
                              {Number(t.tutar) > 0
                                ? `${Number(t.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
                                : t.analiz_durumu === 'analiz_ediliyor'
                                  ? 'Analiz ediliyor...'
                                  : 'Okunamadi'}
                            </span>
                          </div>
                        ))}
                        {item.tutar > 0 && (
                          <div className="text-xs text-green-400 font-bold border-t border-blue-700/40 pt-1 mt-1">
                            💰 Toplam: {item.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </div>
                        )}
                      </div>
                    ) : item.tutar > 0 ? (
                      <div className="text-xs text-green-400 font-medium">
                        💰 {item.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </div>
                    ) : item.analizDurumu === 'analiz_ediliyor' ? (
                      <div className="text-xs text-blue-400 font-medium flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Tahakkuk analiz ediliyor...
                      </div>
                    ) : item.analizDurumu === 'basarisiz' ? (
                      <div className="text-xs text-orange-400 font-medium">
                        Tahakkuk okunamadi - Indirmek icin tiklayin
                      </div>
                    ) : (
                      <div className="text-xs text-green-400 font-medium">
                        Tahakkuk Hazir - Analiz bekleniyor
                      </div>
                    )}
                    {item.tutar > 0 && item.sonOdeme && (
                      <div className="text-xs text-gray-400">
                        Son Odeme: {item.sonOdeme}
                      </div>
                    )}
                    {item.isTamamlandi && (
                      <div className="text-xs text-green-500">Tahakkuk gonderildi</div>
                    )}
                    {item.isHazirlaniyor && !item.isTamamlandi && (
                      <div className="text-xs text-blue-400">Hazirlaniyor</div>
                    )}
                    {!item.isTamamlandi && item.analizDurumu !== 'analiz_ediliyor' && item.tutar <= 0 && (
                      <div className="text-xs text-yellow-400">Indirmek icin tiklayin</div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">
                    {item.gecmi ? 'Son tarih gecti' : 'Tahakkuk hazirlaniyor'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {sortedTum.some(item => item.hasTahakkuk) && (
          <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <div className="text-sm text-yellow-400 font-medium mb-1">Odeme Ozeti</div>
            <div className="text-xs text-gray-400">
              Toplam Odeme: {' '}
              <span className="text-white font-medium">
                {sortedTum
                  .filter(item => item.hasTahakkuk)
                  .reduce((toplam, item) => toplam + item.tutar, 0)
                  .toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
              </span>
            </div>
          </div>
        )}
      </div>

      {showModal && selectedTahakkuk && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-900 rounded-2xl border border-blue-700/50 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {selectedTahakkuk.name} - Tahakkuk
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-blue-800/30 rounded-xl p-4 border border-blue-700/30">
                <div className="text-sm text-gray-400">Odeme Tutari</div>
                <div className="text-2xl font-bold text-green-400">
                  {selectedTahakkuk.tutar > 0
                    ? `${selectedTahakkuk.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
                    : selectedTahakkuk.analizDurumu === 'analiz_ediliyor'
                      ? 'Analiz ediliyor...'
                      : 'Okunamadi'}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  Son Tarih: {selectedTahakkuk.sonOdeme || selectedTahakkuk.deadline.split('-').reverse().join('.')}
                </div>
              </div>

              {/* Tum tahakkuklar listesi */}
              {(selectedTahakkuk.tahakkuklar || []).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-400">Tahakkuk Dosyalari ({selectedTahakkuk.tahakkuklar.length})</div>
                  {selectedTahakkuk.tahakkuklar.map((t, idx) => (
                    <a
                      key={t.url}
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setDocumentUrl(t.url)}
                      className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition-colors ${
                        documentUrl === t.url
                          ? 'bg-blue-600/30 border-blue-500/50 text-white'
                          : 'bg-blue-800/20 border-blue-700/30 text-blue-300 hover:bg-blue-700/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="text-sm truncate">{t.name || `Tahakkuk ${idx + 1}`}</span>
                      </div>
                      <span className="text-xs text-green-400 shrink-0">
                        {Number(t.tutar) > 0
                          ? `${Number(t.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`
                          : t.analiz_durumu === 'analiz_ediliyor'
                            ? 'Analiz...'
                            : ''}
                      </span>
                    </a>
                  ))}
                </div>
              )}
              
              {modalLoading ? (
                <div className="text-center py-4 text-gray-400">Dokuman yukleniyor...</div>
              ) : documentUrl ? (
                <div className="space-y-2">
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Indir
                  </button>
                  
                  <button
                    onClick={handleWhatsAppSend}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    WhatsApp ile Gonder
                  </button>
                  
                  <button
                    onClick={handleEmailSend}
                    className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    <Mail className="w-5 h-5" />
                    E-Posta ile Gonder
                  </button>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Dokuman bulunamadi
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
