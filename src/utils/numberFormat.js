export const parseMoneyInput = (value) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  let normalized = String(value).trim().replace(/\s/g, '')
  if (!normalized) return null

  const hasComma = normalized.includes(',')
  const hasDot = normalized.includes('.')

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(',')
    const lastDot = normalized.lastIndexOf('.')
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '')
  } else if (hasComma) {
    normalized = normalized.replace(',', '.')
  } else if (hasDot) {
    const parts = normalized.split('.')
    const lastPart = parts[parts.length - 1]
    normalized = parts.length > 1 && lastPart.length === 3
      ? parts.join('')
      : normalized
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export const requireMoneyInput = (value, label = 'Tutar') => {
  const parsed = parseMoneyInput(value)
  if (parsed === null || parsed < 0) {
    throw new Error(`${label} geçerli ve negatif olmayan bir sayı olmalıdır.`)
  }
  return parsed
}

export const formatMoney = (value) =>
  new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
export function parseTurkishNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value

  const text = String(value).trim()
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text

  const result = Number(normalized)
  return Number.isFinite(result) ? result : 0
}

export function formatTurkishInput(value) {
  if (value === null || value === undefined || value === '') return ''

  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseTurkishNumber(value))
}
