const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('asistan', {
  surukle: (dx, dy) => ipcRenderer.send('surukle', dx, dy),
  menuAc: () => ipcRenderer.send('menu-ac'),
  sohbetAc: () => ipcRenderer.send('sohbet-ac'),
  ayarlarAc: () => ipcRenderer.send('ayarlar-ac'),
  konusIste: () => ipcRenderer.send('konus-iste'),
  sohbetGonder: (m) => ipcRenderer.invoke('sohbet-gonder', m),
  ayarGetir: () => ipcRenderer.invoke('ayar-getir'),
  ayarKaydet: (a) => ipcRenderer.invoke('ayar-kaydet', a),
  hatirlatmaEkle: (h) => ipcRenderer.invoke('hatirlatma-ekle', h),
  hatirlatmaSil: (id) => ipcRenderer.invoke('hatirlatma-sil', id),
  kapat: () => ipcRenderer.invoke('asistan-kapat'),
  onPoz: (cb) => ipcRenderer.on('poz', (e, v) => cb(v)),
  onKonus: (cb) => ipcRenderer.on('konus', (e, v) => cb(v)),
  onYon: (cb) => ipcRenderer.on('yon', (e, v) => cb(v)),
  onAyar: (cb) => ipcRenderer.on('ayar', (e, v) => cb(v)),
  onTts: (cb) => ipcRenderer.on('tts', (e, v) => cb(v)),
  onSohbetYanit: (cb) => ipcRenderer.on('sohbet-yanit', (e, v) => cb(v))
})
