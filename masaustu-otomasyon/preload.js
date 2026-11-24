// MUBiS Masaüstü Otomasyon — güvenli köprü (contextIsolation açık)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mubis', {
  durum: () => ipcRenderer.invoke('durum'),
  motorBaslat: () => ipcRenderer.invoke('motor-baslat'),
  motorDurdur: () => ipcRenderer.invoke('motor-durdur'),
  motorYeniden: () => ipcRenderer.invoke('motor-yeniden'),
  lucaKaydet: (veri) => ipcRenderer.invoke('luca-kaydet', veri),
  lucaBilgi: () => ipcRenderer.invoke('luca-bilgi'),
  otomatikBaslat: (acik) => ipcRenderer.invoke('otomatik-baslat', acik),
  disariAc: (adres) => ipcRenderer.invoke('disari-ac', adres),
  klasorAc: () => ipcRenderer.invoke('klasor-ac'),
  logAc: () => ipcRenderer.invoke('log-ac'),
  pencereKucult: () => ipcRenderer.invoke('pencere-kucult'),
  isCalistir: (isAdi, params) => ipcRenderer.invoke('is-calistir', isAdi, params),
  gibAyarOku: () => ipcRenderer.invoke('gib-ayar-oku'),
  gibAyarYaz: (veri) => ipcRenderer.invoke('gib-ayar-yaz', veri),
  dosyalar: () => ipcRenderer.invoke('dosyalar'),
  indirmeKlasoruAc: () => ipcRenderer.invoke('indirme-klasoru-ac'),
  dosyaKaydet: (veri) => ipcRenderer.invoke('dosya-kaydet', veri),
  dosyaAc: (veri) => ipcRenderer.invoke('dosya-ac', veri),
  edefterDurum: () => ipcRenderer.invoke('edefter-durum'),
  edefterKur: () => ipcRenderer.invoke('edefter-kur'),
  edefterAc: () => ipcRenderer.invoke('edefter-ac'),
  durumDinle: (cb) => {
    const dinleyici = (_e, veri) => cb(veri)
    ipcRenderer.on('durum', dinleyici)
    return () => ipcRenderer.removeListener('durum', dinleyici)
  },
  logDinle: (cb) => {
    const dinleyici = (_e, metin) => cb(metin)
    ipcRenderer.on('log', dinleyici)
    return () => ipcRenderer.removeListener('log', dinleyici)
  }
})
