// Yardimci program ve surum dosyalarinin indirme adresleri.
// Dosyalar site deployment'indan cikarildi (boyut nedeniyle); Supabase
// Storage'daki "indirilenler" bucket'indan servis edilir.
// Not: Supabase ucretsiz planda tek dosya limiti 50 MB oldugu icin exe
// ZIP olarak yuklenir (35 MB); kullanici zip'i acip exe'yi calistirir.
// Gerekirse VITE_YARDIMCI_EXE_URL ile ezebilirsiniz.

import helperSurum from '../../public/downloads/helper-surum.json'

const TABAN = 'https://gxuqrxmpgoeyykoolmwv.supabase.co/storage/v1/object/public/indirilenler'

// Cache-buster: her yeni surumde farkli URL ile tarayici/CDN onbellegini as
const YARDIMCI_CB = helperSurum?.surum || Date.now().toString(36)

export const YARDIMCI_EXE_URL =
  import.meta.env.VITE_YARDIMCI_EXE_URL || `${TABAN}/mubis-gib-yardimci.zip?v=${YARDIMCI_CB}`

export const YARDIMCI_SURUM_URL = '/downloads/helper-surum.json'
