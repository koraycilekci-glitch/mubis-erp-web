import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { 
  LayoutDashboard, Users, FileText, Bell, Calendar, 
  CheckCircle, AlertTriangle, Download, Settings,
  BarChart3, Eye, ChevronRight, TrendingUp,
  Bot, Clock, Zap, Star, ArrowUp, ArrowDown,
  Plus, Trash2, Edit3, X, Save, Search, Receipt, PenTool,
  MapPin, Phone, ChevronLeft, ChevronRightIcon
} from 'lucide-react'
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  LineChart, Line, Legend 
} from 'recharts'

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')

  const [tasks, setTasks] = useState([
    { id: 1, client: 'ABC Ltd. Şti.', task: 'KDV Beyannamesi', deadline: '2026-07-15', status: 'pending', priority: 'high' },
    { id: 2, client: 'XYZ Ticaret A.Ş.', task: 'Muhtasar Beyanname', deadline: '2026-07-20', status: 'pending', priority: 'medium' },
    { id: 3, client: '123 Danışmanlık', task: 'SGK Bildirgesi', deadline: '2026-07-18', status: 'completed', priority: 'high' },
    { id: 4, client: 'Demo İnşaat', task: 'Geçici Vergi', deadline: '2026-08-10', status: 'pending', priority: 'medium' },
    { id: 5, client: 'Mavi Teknoloji', task: 'e-Defter Yükleme', deadline: '2026-07-25', status: 'pending', priority: 'low' },
  ])

  const [newTask, setNewTask] = useState({ client: '', task: '', deadline: '', priority: 'medium' })

  const notifications = [
    { id: 1, type: 'warning', message: 'XYZ Ticaret e-İmza süresi 15 gün içinde dolacak', date: '2026-07-12', time: '14:30' },
    { id: 2, type: 'info', message: 'Yeni e-Tebligat geldi: ABC Ltd. Şti.', date: '2026-07-12', time: '11:15' },
    { id: 3, type: 'success', message: 'SGK Bildirgesi başarıyla gönderildi', date: '2026-07-11', time: '16:45' },
    { id: 4, type: 'warning', message: 'Demo İnşaat Mali Mühür yenileme tarihi yaklaşıyor', date: '2026-07-10', time: '09:20' },
    { id: 5, type: 'info', message: 'Mavi Teknoloji evrak yükledi: 3 fatura', date: '2026-07-10', time: '08:00' },
  ]

  const monthlyData = [
    { name: 'Oca', completed: 45, pending: 12 },
    { name: 'Şub', completed: 52, pending: 8 },
    { name: 'Mar', completed: 48, pending: 15 },
    { name: 'Nis', completed: 61, pending: 5 },
    { name: 'May', completed: 55, pending: 10 },
    { name: 'Haz', completed: 67, pending: 3 },
    { name: 'Tem', completed: 42, pending: 8 },
  ]

  const clientDistribution = [
    { name: 'Aktif', value: 45, color: '#10B981' },
    { name: 'Bekleyen', value: 12, color: '#F59E0B' },
    { name: 'Pasif', value: 8, color: '#6B7280' },
    { name: 'Yeni', value: 5, color: '#3B82F6' },
  ]

  const revenueData = [
    { name: 'Oca', gelir: 45000, gider: 32000 },
    { name: 'Şub', gelir: 52000, gider: 35000 },
    { name: 'Mar', gelir: 48000, gider: 38000 },
    { name: 'Nis', gelir: 61000, gider: 40000 },
    { name: 'May', gelir: 55000, gider: 42000 },
    { name: 'Haz', gelir: 67000, gider: 45000 },
    { name: 'Tem', gelir: 42000, gider: 30000 },
  ]

  const aiSuggestions = [
    { icon: Zap, text: 'ABC Ltd. KDV beyannamesi bugün son! Hemen tamamla.', priority: 'high' },
    { icon: Clock, text: '3 müşterinin e-İmza süresi 30 gün içinde doluyor.', priority: 'medium' },
    { icon: Star, text: 'Bu ay en çok işlem: Muhtasar Beyanname (15 adet)', priority: 'low' },
  ]

  const handleAddTask = () => {
    if (!newTask.client || !newTask.task || !newTask.deadline) return
    const task = { id: Date.now(), ...newTask, status: 'pending' }
    setTasks([task, ...tasks])
    setNewTask({ client: '', task: '', deadline: '', priority: 'medium' })
    setShowAddTask(false)
  }

  const handleDeleteTask = (id) => {
    if (window.confirm('Bu görevi silmek istediğinize emin misiniz?')) {
      setTasks(tasks.filter(t => t.id !== id))
    }
  }

  const handleToggleStatus = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t))
  }

  const handleEditTask = (task) => {
    setEditingTask(task)
    setNewTask({ client: task.client, task: task.task, deadline: task.deadline, priority: task.priority })
    setShowAddTask(true)
  }

  const handleUpdateTask = () => {
    if (!newTask.client || !newTask.task || !newTask.deadline) return
    setTasks(tasks.map(t => t.id === editingTask.id ? { ...t, ...newTask } : t))
    setNewTask({ client: '', task: '', deadline: '', priority: 'medium' })
    setEditingTask(null)
    setShowAddTask(false)
  }

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.client.toLowerCase().includes(searchTerm.toLowerCase()) || task.task.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority
    return matchesSearch && matchesStatus && matchesPriority
  })

  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const highPriorityCount = tasks.filter(t => t.priority === 'high' && t.status === 'pending').length

  const tabs = [
    { id: 'overview', label: 'Genel Bakış', icon: LayoutDashboard },
    { id: 'tasks', label: 'Görevler', icon: CheckCircle },
    { id: 'analytics', label: 'Analitik', icon: TrendingUp },
    { id: 'clients', label: 'Müşteriler', icon: Users },
    { id: 'reports', label: 'Raporlar', icon: BarChart3 },
    { id: 'notifications', label: 'Bildirimler', icon: Bell },
  ]

  const handleEfatura = () => {
    if (window.confirm('⚠️ e-Fatura için e-İmza/Mali Mühür bilgisayara takılı olmalıdır!\n\nDevam etmek istiyor musunuz?')) {
      window.open('https://portal.efatura.gov.tr/efatura/wsctgirisSSL.jsp', '_blank')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Hoş Geldin, {user?.name} 👋</h1>
          <p className="text-gray-400 mt-1 flex items-center">
            <Bot className="w-5 h-5 text-yellow-500 mr-2" />
            MUBİS AI: Bugün <span className="text-yellow-500 font-semibold mx-1">{pendingCount} işin</span> var, 
            <span className="text-red-400 font-semibold mx-1">{highPriorityCount}'ü öncelikli!</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
          <button onClick={() => navigate('/admin/institutions')} className="btn-primary text-sm px-4 py-2 flex items-center">🌐 Kurumlar</button>
          <button onClick={() => window.open('https://earsivportal.efatura.gov.tr/intragiris.html', '_blank')} className="bg-gradient-to-r from-orange-600 to-red-600 text-white text-sm px-4 py-2 rounded-lg flex items-center hover:from-orange-500 hover:to-red-500 transition-all">📄 e-Arşiv</button>
          <button onClick={handleEfatura} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm px-4 py-2 rounded-lg flex items-center hover:from-blue-500 hover:to-indigo-500 transition-all">📋 e-Fatura</button>
          <button onClick={() => { setEditingTask(null); setNewTask({ client: '', task: '', deadline: '', priority: 'medium' }); setShowAddTask(true); }} className="btn-gold text-sm px-4 py-2 flex items-center"><Plus className="w-4 h-4 mr-2" />Yeni Görev</button>
        </div>
      </div>

      {showAddTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 rounded-2xl p-6 w-full max-w-md border border-blue-700/50 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">{editingTask ? '✏️ Görevi Düzenle' : '➕ Yeni Görev'}</h3>
              <button onClick={() => { setShowAddTask(false); setEditingTask(null); }} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            <div className="space-y-4">
              <div><label className="text-gray-400 text-sm block mb-2">Müşteri</label><input type="text" value={newTask.client} onChange={(e) => setNewTask({...newTask, client: e.target.value})} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" placeholder="Müşteri adı..." /></div>
              <div><label className="text-gray-400 text-sm block mb-2">Görev</label><input type="text" value={newTask.task} onChange={(e) => setNewTask({...newTask, task: e.target.value})} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" placeholder="Görev açıklaması..." /></div>
              <div><label className="text-gray-400 text-sm block mb-2">Son Tarih</label><input type="date" value={newTask.deadline} onChange={(e) => setNewTask({...newTask, deadline: e.target.value})} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" /></div>
              <div><label className="text-gray-400 text-sm block mb-2">Öncelik</label><select value={newTask.priority} onChange={(e) => setNewTask({...newTask, priority: e.target.value})} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-yellow-500"><option value="low" className="bg-blue-900">🔵 Düşük</option><option value="medium" className="bg-blue-900">🟡 Orta</option><option value="high" className="bg-blue-900">🔴 Yüksek</option></select></div>
              <button onClick={editingTask ? handleUpdateTask : handleAddTask} className="btn-gold w-full py-3 text-lg flex items-center justify-center space-x-2">{editingTask ? <><Save className="w-5 h-5" /><span>Güncelle</span></> : <><Plus className="w-5 h-5" /><span>Ekle</span></>}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { icon: Users, label: 'Aktif Müşteri', value: '45', change: '+5', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
          { icon: FileText, label: 'Bekleyen Görev', value: pendingCount.toString(), change: highPriorityCount.toString() + ' acil', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
          { icon: CheckCircle, label: 'Tamamlanan', value: completedCount.toString(), change: '+23', color: 'text-green-400', bgColor: 'bg-green-500/10' },
          { icon: AlertTriangle, label: 'Acil İşlem', value: highPriorityCount.toString(), change: 'Öncelikli', color: 'text-red-400', bgColor: 'bg-red-500/10' },
        ].map((card, index) => (
          <div key={index} className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 card-hover border border-blue-800/30">
            <div className="flex items-center justify-between mb-4"><div className={`${card.bgColor} p-3 rounded-xl`}><card.icon className={`w-6 h-6 ${card.color}`} /></div></div>
            <div className="text-3xl font-bold text-white mb-1">{card.value}</div>
            <div className="text-gray-400 text-sm">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="flex space-x-1 bg-blue-950/40 rounded-xl p-1 mb-8 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}><tab.icon className="w-4 h-4" /><span>{tab.label}</span></button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-1 bg-gradient-to-br from-yellow-500/10 to-blue-500/10 backdrop-blur-sm rounded-2xl p-6 border border-yellow-500/20">
              <div className="flex items-center space-x-2 mb-4"><Bot className="w-6 h-6 text-yellow-500" /><h3 className="text-lg font-semibold text-white">MUBİS AI Asistan</h3></div>
              <div className="space-y-3">
                {aiSuggestions.map((item, i) => (
                  <div key={i} className={`p-3 rounded-xl ${item.priority === 'high' ? 'bg-red-500/10 border border-red-500/20' : item.priority === 'medium' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                    <div className="flex items-start space-x-2"><item.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${item.priority === 'high' ? 'text-red-400' : item.priority === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`} /><p className="text-gray-300 text-sm">{item.text}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
              <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-white">📍 Günlük Görevler</h3><span className="text-gray-400 text-sm">{pendingCount} bekleyen</span></div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {tasks.filter(t => t.status === 'pending').slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-4 bg-blue-900/20 rounded-xl hover:bg-blue-900/30 transition-colors group">
                    <div className="flex items-center space-x-4"><div className={`w-3 h-3 rounded-full ${task.priority === 'high' ? 'bg-red-400' : task.priority === 'medium' ? 'bg-yellow-400' : 'bg-blue-400'}`} /><div><div className="text-white font-medium group-hover:text-yellow-400 transition-colors">{task.task}</div><div className="text-gray-400 text-sm">{task.client}</div></div></div>
                    <div className="flex items-center space-x-3"><span className="text-gray-400 text-sm hidden sm:flex items-center"><Calendar className="w-4 h-4 mr-1" />{task.deadline}</span><button onClick={() => handleToggleStatus(task.id)} className="p-2 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30 transition-colors"><CheckCircle className="w-4 h-4" /></button></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center"><BarChart3 className="w-5 h-5 text-yellow-500 mr-2" />Aylık İşlem Grafiği</h3>
              <ResponsiveContainer width="100%" height={280}><BarChart data={monthlyData} barGap={4}><CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" /><XAxis dataKey="name" stroke="#6B7280" fontSize={12} /><YAxis stroke="#6B7280" fontSize={12} /><Tooltip contentStyle={{ backgroundColor: '#0f2744', border: '1px solid #1e3a5f', borderRadius: '12px', color: '#F9FAFB' }} /><Legend /><Bar dataKey="completed" name="Tamamlanan" fill="#10B981" radius={[6, 6, 0, 0]} /><Bar dataKey="pending" name="Bekleyen" fill="#F59E0B" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
            </div>
            <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center"><Users className="w-5 h-5 text-yellow-500 mr-2" />Müşteri Dağılımı</h3>
              <div className="flex items-center"><ResponsiveContainer width="60%" height={250}><PieChart><Pie data={clientDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value">{clientDistribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />))}</Pie><Tooltip contentStyle={{ backgroundColor: '#0f2744', border: '1px solid #1e3a5f', borderRadius: '12px', color: '#F9FAFB' }} /></PieChart></ResponsiveContainer><div className="space-y-3">{clientDistribution.map((item) => (<div key={item.name} className="flex items-center space-x-3"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-gray-300 text-sm">{item.name}</span><span className="text-white font-semibold text-sm">{item.value}</span></div>))}</div></div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'tasks' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h3 className="text-xl font-semibold text-white">📋 Görev Yönetimi</h3>
            <div className="flex flex-wrap gap-2">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-blue-900/30 text-gray-300 rounded-lg pl-10 pr-4 py-2 text-sm border border-blue-700/50 w-48 focus:outline-none focus:border-yellow-500" placeholder="Ara..." /></div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-blue-900/30 text-gray-300 rounded-lg px-3 py-2 text-sm border border-blue-700/50"><option value="all">Tüm Durumlar</option><option value="pending">Bekleyen</option><option value="completed">Tamamlanan</option></select>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="bg-blue-900/30 text-gray-300 rounded-lg px-3 py-2 text-sm border border-blue-700/50"><option value="all">Tüm Öncelikler</option><option value="high">Yüksek</option><option value="medium">Orta</option><option value="low">Düşük</option></select>
              <button onClick={() => { setEditingTask(null); setNewTask({ client: '', task: '', deadline: '', priority: 'medium' }); setShowAddTask(true); }} className="btn-gold text-sm px-4 py-2 flex items-center"><Plus className="w-4 h-4 mr-2" />Yeni Görev</button>
            </div>
          </div>
          {filteredTasks.length === 0 ? (
            <div className="text-center py-16"><CheckCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" /><p className="text-gray-400 text-lg">Görev bulunamadı</p></div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr className="text-left text-gray-400 text-sm border-b border-blue-800/30"><th className="pb-3">Müşteri</th><th className="pb-3">Görev</th><th className="pb-3">Son Tarih</th><th className="pb-3">Öncelik</th><th className="pb-3">Durum</th><th className="pb-3">İşlem</th></tr></thead><tbody>{filteredTasks.map((task) => (<tr key={task.id} className="border-b border-blue-800/20 text-gray-300 hover:bg-blue-900/20 transition-colors"><td className="py-4 font-medium text-white">{task.client}</td><td className="py-4">{task.task}</td><td className="py-4">{task.deadline}</td><td className="py-4"><span className={`px-2 py-1 rounded text-xs font-medium ${task.priority === 'high' ? 'bg-red-500/20 text-red-400' : task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>{task.priority === 'high' ? '🔴 Yüksek' : task.priority === 'medium' ? '🟡 Orta' : '🔵 Düşük'}</span></td><td className="py-4"><span className={`px-2 py-1 rounded text-xs font-medium ${task.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{task.status === 'completed' ? '✅ Tamamlandı' : '⏳ Bekliyor'}</span></td><td className="py-4"><div className="flex space-x-2"><button onClick={() => handleToggleStatus(task.id)} className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"><CheckCircle className="w-4 h-4" /></button><button onClick={() => handleEditTask(task)} className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30"><Edit3 className="w-4 h-4" /></button><button onClick={() => handleDeleteTask(task.id)} className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30"><Trash2 className="w-4 h-4" /></button></div></td></tr>))}</tbody></table></div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30"><h3 className="text-lg font-semibold text-white mb-4">📊 Aylık İşlem Grafiği</h3><ResponsiveContainer width="100%" height={300}><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" /><XAxis dataKey="name" stroke="#6B7280" /><YAxis stroke="#6B7280" /><Tooltip contentStyle={{ backgroundColor: '#0f2744', border: '1px solid #1e3a5f', borderRadius: '12px', color: '#F9FAFB' }} /><Legend /><Bar dataKey="completed" name="Tamamlanan" fill="#10B981" radius={[8, 8, 0, 0]} /><Bar dataKey="pending" name="Bekleyen" fill="#F59E0B" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
            <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30"><h3 className="text-lg font-semibold text-white mb-4">💰 Gelir/Gider</h3><ResponsiveContainer width="100%" height={300}><LineChart data={revenueData}><CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" /><XAxis dataKey="name" stroke="#6B7280" /><YAxis stroke="#6B7280" /><Tooltip contentStyle={{ backgroundColor: '#0f2744', border: '1px solid #1e3a5f', borderRadius: '12px', color: '#F9FAFB' }} /><Legend /><Line type="monotone" dataKey="gelir" name="Gelir (₺)" stroke="#10B981" strokeWidth={2} /><Line type="monotone" dataKey="gider" name="Gider (₺)" stroke="#EF4444" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
          </div>
        </div>
      )}

      {activeTab === 'clients' && <ClientsTab navigate={navigate} />}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-xl font-semibold text-white mb-6">📑 Raporlama Merkezi</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[{ title: 'Aylık İşlem Raporu', desc: 'Bu ay yapılan tüm işlemler', icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' }, { title: 'Müşteri Performans', desc: 'Müşteri bazlı tamamlanma oranları', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' }, { title: 'Beyan Takip Raporu', desc: 'Bekleyen ve tamamlanan beyanlar', icon: CheckCircle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' }, { title: 'Gelir/Gider Raporu', desc: 'Aylık finansal özet', icon: BarChart3, color: 'text-purple-400', bg: 'bg-purple-500/10' }, { title: 'e-Defter Durumu', desc: 'Berat ve yükleme takibi', icon: FileText, color: 'text-indigo-400', bg: 'bg-indigo-500/10' }, { title: 'Personel Performans', desc: 'Çalışan bazlı iş takibi', icon: Users, color: 'text-pink-400', bg: 'bg-pink-500/10' }].map((report, index) => (
                <div key={index} className="bg-blue-900/20 rounded-xl p-6 hover:bg-blue-900/40 transition-colors cursor-pointer border border-blue-800/20 hover:border-yellow-500/30 text-center">
                  <div className={`${report.bg} p-4 rounded-xl inline-block mb-4`}><report.icon className={`w-10 h-10 ${report.color}`} /></div>
                  <h4 className="text-white font-semibold mb-2">{report.title}</h4><p className="text-gray-400 text-sm mb-4">{report.desc}</p>
                  <button className="btn-gold text-sm px-4 py-2"><Download className="w-4 h-4 inline mr-2" />İndir</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Musteri Listesi Bileseni
function ClientsTab({ navigate }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const allClients = [
    { id: 1, name: 'ABC Ltd. Sti.', vkn: '1234567890', taxOffice: 'Beyoglu VD', phone: '0212 555 01 01', status: 'active', type: 'earsiv', city: 'Istanbul', contactPerson: 'Ali Yilmaz', taskCount: 5 },
    { id: 2, name: 'XYZ Ticaret A.S.', vkn: '9876543210', taxOffice: 'Kadikoy VD', phone: '0216 555 02 02', status: 'active', type: 'efatura', city: 'Istanbul', contactPerson: 'Mehmet Kaya', taskCount: 3 },
    { id: 3, name: '123 Danismanlik', vkn: '4567890123', taxOffice: 'Cankaya VD', phone: '0312 555 03 03', status: 'active', type: 'earsiv', city: 'Ankara', contactPerson: 'Zeynep Demir', taskCount: 7 },
    { id: 4, name: 'Demo Insaat Ltd.', vkn: '7890123456', taxOffice: 'Konak VD', phone: '0232 555 04 04', status: 'passive', type: 'efatura', city: 'Izmir', contactPerson: 'Can Ozdemir', taskCount: 2 },
    { id: 5, name: 'Mavi Teknoloji A.S.', vkn: '2345678901', taxOffice: 'Sisli VD', phone: '0212 555 05 05', status: 'active', type: 'earsiv', city: 'Istanbul', contactPerson: 'Ebru Celik', taskCount: 4 },
    { id: 6, name: 'Yesil Enerji A.S.', vkn: '8901234567', taxOffice: 'Ostim VD', phone: '0312 555 06 06', status: 'active', type: 'efatura', city: 'Ankara', contactPerson: 'Deniz Arslan', taskCount: 1 },
    { id: 7, name: 'Kirmizi Bilisim Ltd.', vkn: '3456789012', taxOffice: 'Maltepe VD', phone: '0216 555 07 07', status: 'active', type: 'earsiv', city: 'Istanbul', contactPerson: 'Burcu Sahin', taskCount: 6 },
    { id: 8, name: 'Sari Medya A.S.', vkn: '5678901234', taxOffice: 'Beylikduzu VD', phone: '0212 555 08 08', status: 'passive', type: 'efatura', city: 'Istanbul', contactPerson: 'Tarik Aydin', taskCount: 0 },
    { id: 9, name: 'Mor Tekstil San.', vkn: '6789012345', taxOffice: 'Osmangazi VD', phone: '0224 555 09 09', status: 'active', type: 'earsiv', city: 'Bursa', contactPerson: 'Gul Yilmaz', taskCount: 3 },
    { id: 10, name: 'Beyaz Gida Tic.', vkn: '7890123457', taxOffice: 'Selcuklu VD', phone: '0332 555 10 10', status: 'active', type: 'efatura', city: 'Konya', contactPerson: 'Hakan Kara', taskCount: 2 },
    { id: 11, name: 'Siyah Otomotiv', vkn: '8901234568', taxOffice: 'Gebze VD', phone: '0262 555 11 11', status: 'active', type: 'earsiv', city: 'Kocaeli', contactPerson: 'Omer Faruk', taskCount: 4 },
    { id: 12, name: 'Mavi Denizcilik', vkn: '9012345678', taxOffice: 'Konak VD', phone: '0232 555 12 12', status: 'passive', type: 'efatura', city: 'Izmir', contactPerson: 'Asli Yildiz', taskCount: 0 },
    { id: 13, name: 'Altin Insaat A.S.', vkn: '1122334455', taxOffice: 'Cankaya VD', phone: '0312 555 13 13', status: 'active', type: 'earsiv', city: 'Ankara', contactPerson: 'Ahmet Demir', taskCount: 8 },
    { id: 14, name: 'Gumus Kuyumculuk', vkn: '2233445566', taxOffice: 'Fatih VD', phone: '0212 555 14 14', status: 'active', type: 'efatura', city: 'Istanbul', contactPerson: 'Leyla Koc', taskCount: 1 },
    { id: 15, name: 'Kristal Cam San.', vkn: '3344556677', taxOffice: 'Uskudar VD', phone: '0216 555 15 15', status: 'active', type: 'earsiv', city: 'Istanbul', contactPerson: 'Murat Can', taskCount: 5 },
    { id: 16, name: 'Elmas Muhendislik', vkn: '4455667788', taxOffice: 'Karsiyaka VD', phone: '0232 555 16 16', status: 'passive', type: 'efatura', city: 'Izmir', contactPerson: 'Pinar Ak', taskCount: 0 },
    { id: 17, name: 'Yakut Yazilim', vkn: '5566778899', taxOffice: 'Kadikoy VD', phone: '0216 555 17 17', status: 'active', type: 'earsiv', city: 'Istanbul', contactPerson: 'Kemal Ozturk', taskCount: 3 },
    { id: 18, name: 'Zumrut Ticaret', vkn: '6677889900', taxOffice: 'Nilufer VD', phone: '0224 555 18 18', status: 'active', type: 'efatura', city: 'Bursa', contactPerson: 'Cemre Kaya', taskCount: 2 },
    { id: 19, name: 'Safir Enerji A.S.', vkn: '7788990011', taxOffice: 'Etimesgut VD', phone: '0312 555 19 19', status: 'active', type: 'earsiv', city: 'Ankara', contactPerson: 'Aliye Sengul', taskCount: 6 },
    { id: 20, name: 'Topaz Lojistik', vkn: '8899001122', taxOffice: 'Pendik VD', phone: '0216 555 20 20', status: 'passive', type: 'efatura', city: 'Istanbul', contactPerson: 'Selim Toprak', taskCount: 0 },
  ]

  const cities = ['all', ...new Set(allClients.map(c => c.city))].sort()

  const filtered = allClients.filter(c => {
    const m = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.vkn.includes(searchTerm) || c.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
    const t = filterType === 'all' || c.type === filterType
    const s = filterStatus === 'all' || c.status === filterStatus
    const ct = filterCity === 'all' || c.city === filterCity
    return m && t && s && ct
  })

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedClients = filtered.slice(startIndex, startIndex + itemsPerPage)

  return (
    <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-white">👥 Müşteri Listesi ({filtered.length})</h3>
          <button className="btn-gold text-sm px-4 py-2 flex items-center"><Plus className="w-4 h-4 mr-2" />Yeni Müşteri</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" /><input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }} className="w-full bg-blue-900/30 text-gray-300 rounded-lg pl-10 pr-4 py-2 text-sm border border-blue-700/50 focus:outline-none focus:border-yellow-500" placeholder="İsim, VKN veya yetkili ara..." /></div>
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1) }} className="bg-blue-900/30 text-gray-300 rounded-lg px-3 py-2 text-sm border border-blue-700/50"><option value="all">Tüm Türler</option><option value="earsiv">e-Arşiv</option><option value="efatura">e-Fatura</option></select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1) }} className="bg-blue-900/30 text-gray-300 rounded-lg px-3 py-2 text-sm border border-blue-700/50"><option value="all">Tüm Durumlar</option><option value="active">Aktif</option><option value="passive">Pasif</option></select>
          <select value={filterCity} onChange={(e) => { setFilterCity(e.target.value); setCurrentPage(1) }} className="bg-blue-900/30 text-gray-300 rounded-lg px-3 py-2 text-sm border border-blue-700/50">{cities.map(c => <option key={c} value={c}>{c === 'all' ? 'Tüm Şehirler' : c}</option>)}</select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-400 text-sm border-b border-blue-800/30">
              <th className="pb-3">Müşteri</th><th className="pb-3">VKN</th><th className="pb-3">Vergi Dairesi</th><th className="pb-3 hidden md:table-cell">Şehir</th><th className="pb-3 hidden md:table-cell">Yetkili</th><th className="pb-3 hidden lg:table-cell">Tür</th><th className="pb-3">Durum</th><th className="pb-3">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {paginatedClients.map((client) => (
              <tr key={client.id} className="border-b border-blue-800/20 text-gray-300 hover:bg-blue-900/20 transition-colors cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                <td className="py-3 font-medium text-white">{client.name}</td>
                <td className="py-3 text-sm">{client.vkn}</td>
                <td className="py-3 text-sm">{client.taxOffice}</td>
                <td className="py-3 text-sm hidden md:table-cell">{client.city}</td>
                <td className="py-3 text-sm hidden md:table-cell">{client.contactPerson}</td>
                <td className="py-3 hidden lg:table-cell">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${client.type === 'earsiv' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {client.type === 'earsiv' ? '📄 e-Arşiv' : '📋 e-Fatura'}
                  </span>
                </td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${client.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {client.status === 'active' ? '🟢 Aktif' : '🔴 Pasif'}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex space-x-1">
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/client/${client.id}`) }} className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30"><Eye className="w-4 h-4" /></button>
                    <button onClick={(e) => e.stopPropagation()} className="p-1.5 bg-yellow-500/20 rounded-lg text-yellow-400 hover:bg-yellow-500/30"><Edit3 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16"><Search className="w-16 h-16 text-gray-600 mx-auto mb-4" /><p className="text-gray-400 text-lg">Müşteri bulunamadı</p></div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-blue-800/30">
          <span className="text-gray-400 text-sm">Sayfa {currentPage} / {totalPages}</span>
          <div className="flex space-x-2">
            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-2 bg-blue-900/30 rounded-lg text-gray-400 hover:text-white disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button key={page} onClick={() => setCurrentPage(page)} className={`px-3 py-1 rounded-lg text-sm ${currentPage === page ? 'bg-blue-600 text-white' : 'bg-blue-900/30 text-gray-400 hover:text-white'}`}>{page}</button>
            ))}
            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-2 bg-blue-900/30 rounded-lg text-gray-400 hover:text-white disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}