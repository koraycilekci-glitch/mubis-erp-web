import { useState, useRef } from 'react'
import { Upload, X, FileText, Image, File, CheckCircle, AlertCircle, Eye, Download, Trash2 } from 'lucide-react'

export default function FileUploader({ documents, setDocuments }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const fileInputRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    processFiles(files)
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    processFiles(files)
  }

  const processFiles = (files) => {
    setUploading(true)
    
    files.forEach(file => {
      // Dosya boyutu kontrolü (25MB)
      if (file.size > 25 * 1024 * 1024) {
        alert(`${file.name} dosyası 25MB'dan büyük!`)
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const newDoc = {
          id: Date.now() + Math.random(),
          name: file.name,
          type: file.type.includes('pdf') ? 'PDF' : 
                file.type.includes('image') ? 'IMAGE' : 'FILE',
          size: formatFileSize(file.size),
          date: new Date().toISOString().split('T')[0],
          url: e.target.result,
          category: 'Genel'
        }
        setDocuments(prev => [newDoc, ...prev])
      }
      reader.readAsDataURL(file)
    })

    setTimeout(() => setUploading(false), 1000)
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleDelete = (id) => {
    if (window.confirm('Bu evrakı silmek istediğinize emin misiniz?')) {
      setDocuments(prev => prev.filter(d => d.id !== id))
    }
  }

  const getFileIcon = (type) => {
    if (type === 'PDF') return <FileText className="w-8 h-8 text-red-400" />
    if (type === 'IMAGE') return <Image className="w-8 h-8 text-green-400" />
    return <File className="w-8 h-8 text-blue-400" />
  }

  return (
    <div>
      {/* Yükleme Alanı */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
          isDragging 
            ? 'border-yellow-500 bg-yellow-500/10 scale-105' 
            : 'border-blue-700/50 hover:border-yellow-500/50 hover:bg-blue-900/20'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.xml"
        />
        
        {uploading ? (
          <div className="space-y-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto"></div>
            <p className="text-yellow-500 font-medium">Yükleniyor...</p>
          </div>
        ) : (
          <>
            <Upload className={`w-16 h-16 mx-auto mb-4 transition-colors ${isDragging ? 'text-yellow-500' : 'text-gray-500'}`} />
            <p className="text-gray-300 text-lg mb-2">
              {isDragging ? '📂 Dosyaları Bırakın!' : 'Dosyalarınızı buraya sürükleyin'}
            </p>
            <p className="text-gray-500 text-sm mb-4">veya</p>
            <button className="btn-gold px-6 py-2">
              Dosya Seç
            </button>
            <p className="text-gray-600 text-xs mt-4">PDF, JPG, PNG, DOC, XLS, XML (Max: 25MB)</p>
          </>
        )}
      </div>

      {/* Evrak Listesi */}
      {documents.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              📄 Yüklenen Evraklar ({documents.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div key={doc.id} 
                className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/20 hover:border-yellow-500/30 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  {getFileIcon(doc.type)}
                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPreviewFile(doc); }}
                      className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30"
                      title="Önizle"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); }}
                      className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"
                      title="İndir"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                      className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-white text-sm font-medium truncate">{doc.name}</p>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">{doc.type}</span>
                    <span>{doc.size}</span>
                    <span>{doc.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Önizleme Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPreviewFile(null)}>
          <div className="bg-blue-950 rounded-2xl p-6 w-full max-w-2xl border border-blue-700/50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center">
                {getFileIcon(previewFile.type)}
                <span className="ml-2">{previewFile.name}</span>
              </h3>
              <button onClick={() => setPreviewFile(null)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {previewFile.type === 'IMAGE' ? (
              <img src={previewFile.url} alt={previewFile.name} className="w-full rounded-xl max-h-96 object-contain bg-blue-900/30" />
            ) : previewFile.type === 'PDF' ? (
              <iframe src={previewFile.url} className="w-full h-96 rounded-xl bg-white" title={previewFile.name} />
            ) : (
              <div className="text-center py-16 bg-blue-900/30 rounded-xl">
                <File className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">Bu dosya türü için önizleme mevcut değil</p>
                <button className="btn-gold mt-4 text-sm px-4 py-2">
                  <Download className="w-4 h-4 inline mr-2" />İndir
                </button>
              </div>
            )}
            
            <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
              <span>{previewFile.type}</span>
              <span>{previewFile.size}</span>
              <span>{previewFile.date}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}