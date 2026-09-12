import { useRef, useState } from 'react'
import { FileCheck, FileSpreadsheet, FileText, Loader2, Upload, X } from 'lucide-react'

const DOCUMENT_TYPES = [
  { id: 'sigorta_tahakkuk', label: 'Tahakkuk Fişi', icon: FileCheck },
  { id: 'hizmet_listesi', label: 'Hizmet Listesi', icon: FileSpreadsheet },
  { id: 'bordro', label: 'Bordro', icon: FileText },
]

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('tr-TR')
}

export default function TahakkukEvrakPaneli({
  title = 'Tahakkuk / Hizmet Listesi / Bordro Yükleme',
  documents = [],
  onUpload,
  onDelete,
  onOpen,
  loading = false,
  allowDelete = true,
  compact = false,
}) {
  const inputRefs = useRef({})
  const [uploadingType, setUploadingType] = useState('')

  const handleFileChange = async (type, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || typeof onUpload !== 'function') return

    setUploadingType(type)
    try {
      await onUpload(file, type)
    } finally {
      setUploadingType('')
    }
  }

  return (
    <section className={`rounded-xl border border-blue-700/30 bg-blue-900/20 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-1 text-xs text-gray-400">Her belge türü ayrı kaydedilir ve müşteri evraklarında doğru adıyla gösterilir.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {DOCUMENT_TYPES.map(({ id, label, icon: Icon }) => (
          <div key={id} className="rounded-lg border border-blue-700/30 bg-blue-950/30 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-200">
              <Icon className="h-4 w-4 text-yellow-400" />
              <span>{label}</span>
            </div>
            <input
              ref={(element) => {
                inputRefs.current[id] = element
              }}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(event) => handleFileChange(id, event)}
            />
            <button
              type="button"
              disabled={loading || uploadingType === id}
              onClick={() => inputRefs.current[id]?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingType === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadingType === id ? 'Yükleniyor...' : 'Dosya seç'}
            </button>
          </div>
        ))}
      </div>

      {documents.length > 0 && (
        <div className="mt-5 divide-y divide-blue-800/40 rounded-lg border border-blue-800/30">
          {documents.map((document, index) => {
            const type = DOCUMENT_TYPES.find((item) => item.id === document.documentType || item.id === document.type)
            const label = type?.label || document.label || 'Evrak'
            return (
              <div key={document.id || document.storagePath || `${document.url}-${index}`} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <FileText className="h-4 w-4 shrink-0 text-blue-300" />
                    <span className="truncate">{document.name || document.fileName || label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                    <span>{label}</span>
                    <span>{formatDate(document.uploadedAt || document.createdAt || document.date)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {(document.url || document.storagePath) && (
                    <button
                      type="button"
                      onClick={() => onOpen?.(document)}
                      className="rounded-md bg-blue-500/15 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/25"
                    >
                      Görüntüle
                    </button>
                  )}
                  {allowDelete && onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(document)}
                      className="rounded-md p-1.5 text-red-300 hover:bg-red-500/15"
                      title="Evrakı sil"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}