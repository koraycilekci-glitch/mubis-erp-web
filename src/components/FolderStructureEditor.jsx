import { useState } from 'react'
import { Folder, FileText, Plus, Trash2, ChevronDown, ChevronRight, Edit2, Check, X } from 'lucide-react'

const CONTENT_TYPES = [
  { source: 'gelir_beyani', docType: 'beyanname', label: 'Gelir/Kurumlar Vergi Beyanı' },
  { source: 'gelir_beyani', docType: 'tahakkuk', label: 'Gelir/Kurumlar Tahakkuk' },
  { source: 'gelir_beyani', docType: 'mizan', label: 'Gelir/Kurumlar Mizan' },
  { source: 'gecici_vergi', docType: 'beyanname', label: 'Geçici Vergi Beyanname' },
  { source: 'gecici_vergi', docType: 'tahakkuk', label: 'Geçici Vergi Tahakkuk' },
  { source: 'gecici_vergi', docType: 'mizan', label: 'Geçici Vergi Mizan' },
  { source: 'vergi_levhasi', label: 'Vergi Levhası' },
  { source: 'mali_evraklar', category: 'imza_beyani', label: 'Mali Evrak - İmza Beyanı' },
  { source: 'mali_evraklar', category: 'gazete', label: 'Mali Evrak - Gazete' },
  { source: 'mali_evraklar', category: 'kurulus', label: 'Mali Evrak - Kuruluş' },
  { source: 'mali_evraklar', category: 'diger', label: 'Mali Evrak - Diğer' },
  { source: 'mali_evraklar', category: 'bordro', label: 'Mali Evrak - Bordro' },
  { source: 'mali_evraklar', category: 'hizmet_listesi', label: 'Mali Evrak - Hizmet Listesi' },
  { source: 'mali_evraklar', category: 'sigorta_tahakkuk', label: 'Mali Evrak - Sigorta Tahakkuk' }
]

function contentKey(c) {
  return [c.source, c.docType || '', c.category || ''].join('|')
}

function findContentLabel(c) {
  return CONTENT_TYPES.find(ct => contentKey(ct) === contentKey(c))?.label || 'Bilinmeyen İçerik'
}

function generateId() {
  return 'folder_' + Math.random().toString(36).slice(2, 9)
}

function FolderItem({ folder, depth = 0, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(folder.name)
  const [showContentSelect, setShowContentSelect] = useState(false)

  const updateField = (field, value) => {
    onChange({ ...folder, [field]: value })
  }

  const addChild = () => {
    const children = Array.isArray(folder.children) ? folder.children : []
    onChange({
      ...folder,
      children: [...children, { id: generateId(), name: 'Yeni Klasör', contents: [], children: [] }]
    })
    setExpanded(true)
  }

  const updateChild = (idx, child) => {
    const children = [...(folder.children || [])]
    children[idx] = child
    onChange({ ...folder, children })
  }

  const deleteChild = (idx) => {
    const children = [...(folder.children || [])]
    children.splice(idx, 1)
    onChange({ ...folder, children })
  }

  const toggleContent = (ct) => {
    const key = contentKey(ct)
    const contents = Array.isArray(folder.contents) ? folder.contents : []
    const exists = contents.some(c => contentKey(c) === key)
    const next = exists
      ? contents.filter(c => contentKey(c) !== key)
      : [...contents, ct]
    updateField('contents', next)
  }

  return (
    <div className={`${depth > 0 ? 'ml-6 border-l border-blue-700/30 pl-3' : ''}`}>
      <div className="flex items-center gap-2 py-2 group">
        <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-white">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Folder className="w-4 h-4 text-yellow-500" />
        {editing ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-blue-900/30 border border-blue-700/50 rounded px-2 py-1 text-sm text-white"
            />
            <button
              onClick={() => { updateField('name', name); setEditing(false) }}
              className="text-green-400 hover:text-green-300"
            >
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setName(folder.name); setEditing(false) }} className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="text-white text-sm flex-1">{folder.name}</span>
            <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-white opacity-0 group-hover:opacity-100">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowContentSelect(!showContentSelect)} className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100">
              <FileText className="w-3.5 h-3.5" /> İçerik
            </button>
            <button onClick={addChild} className="text-green-400 hover:text-green-300 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100">
              <Plus className="w-3.5 h-3.5" /> Alt
            </button>
            {onDelete && (
              <button onClick={onDelete} className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {showContentSelect && (
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mb-2 ml-6">
          <p className="text-gray-400 text-xs mb-2">Bu klasörde görünecek içerikleri seçin:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONTENT_TYPES.map(ct => {
              const key = contentKey(ct)
              const checked = (folder.contents || []).some(c => contentKey(c) === key)
              return (
                <label key={key} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleContent(ct)}
                    className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500"
                  />
                  <span>{ct.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {expanded && (
        <div>
          {(folder.contents || []).length > 0 && (
            <div className="ml-6 mb-2 flex flex-wrap gap-2">
              {(folder.contents || []).map((c, i) => (
                <span key={i} className="bg-blue-800/40 text-blue-200 text-xs px-2 py-1 rounded flex items-center gap-1">
                  {findContentLabel(c)}
                  <button onClick={() => toggleContent(c)} className="hover:text-red-300">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {(folder.children || []).map((child, idx) => (
            <FolderItem
              key={child.id}
              folder={child}
              depth={depth + 1}
              onChange={(c) => updateChild(idx, c)}
              onDelete={() => deleteChild(idx)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FolderStructureEditor({ value, onChange }) {
  const folders = Array.isArray(value?.folders) ? value.folders : []

  const updateFolder = (idx, folder) => {
    const next = [...folders]
    next[idx] = folder
    onChange({ folders: next })
  }

  const deleteFolder = (idx) => {
    const next = [...folders]
    next.splice(idx, 1)
    onChange({ folders: next })
  }

  const addRootFolder = () => {
    onChange({
      folders: [...folders, { id: generateId(), name: 'Yeni Klasör', contents: [], children: [] }]
    })
  }

  return (
    <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium">Klasör Yapısı</h3>
        <button
          onClick={addRootFolder}
          className="bg-green-500/20 text-green-400 hover:bg-green-500/30 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Kök Klasör Ekle
        </button>
      </div>
      {folders.length === 0 && (
        <p className="text-gray-500 text-sm">Henüz klasör tanımlanmamış.</p>
      )}
      <div className="space-y-1">
        {folders.map((folder, idx) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            onChange={(f) => updateFolder(idx, f)}
            onDelete={() => deleteFolder(idx)}
          />
        ))}
      </div>
    </div>
  )
}
