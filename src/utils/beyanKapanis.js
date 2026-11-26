const KAPANIS_UYGULANAN_TURLER = new Set(['kdv', 'kdv2', 'poset', 'muhtasar', 'muhtasar_3aylik', 'gecici_vergi', 'sgk'])

function tarihAyi(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text)
  const tr = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text)
  if (!iso && !tr) return null
  const year = Number(iso ? iso[1] : tr[3])
  const month = Number(iso ? iso[2] : tr[2])
  const day = Number(iso ? iso[3] : tr[1])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return year * 12 + month - 1
}

function kapanisAyi(client) {
  return tarihAyi(client?.closeDate !== undefined ? client.closeDate : client?.close_date)
}

function acilisAyi(client) {
  return tarihAyi(client?.openDate !== undefined ? client.openDate : client?.open_date)
}

export function acilisOncesiAy(client, year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false
  const openedMonth = acilisAyi(client)
  return openedMonth !== null && year * 12 + month - 1 < openedMonth
}

export function beyanDonemiAcilmadi(client, year, months) {
  if (!Number.isInteger(year) || !Array.isArray(months) || !months.length) return false
  if (!months.every(month => Number.isInteger(month) && month >= 0 && month <= 11)) return false
  const openedMonth = acilisAyi(client)
  return openedMonth !== null && year * 12 + Math.max(...months) < openedMonth
}

export function kapanisSonrasiAy(client, year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false
  const closedMonth = kapanisAyi(client)
  return closedMonth !== null && year * 12 + month - 1 > closedMonth
}

export function beyanDonemiKapandi(client, type, year, months) {
  if (!KAPANIS_UYGULANAN_TURLER.has(type) || !Number.isInteger(year) || !Array.isArray(months) || !months.length) return false
  if (!months.every(month => Number.isInteger(month) && month >= 0 && month <= 11)) return false
  const closedMonth = kapanisAyi(client)
  return closedMonth !== null && year * 12 + Math.min(...months) > closedMonth
}

export function matrisBeyanAylari(type, month) {
  if (!Number.isInteger(month) || month < 0 || month > 11) return []
  if (type === 'muhtasar_3aylik' || type === 'gecici_vergi') {
    return [2, 5, 8, 11].includes(month) ? [month - 2, month - 1, month] : []
  }
  return [month]
}
