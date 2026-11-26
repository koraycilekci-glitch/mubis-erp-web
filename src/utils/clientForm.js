export function normalizeClientDate(value) {
  if (value === '') return null
  if (typeof value !== 'string') return value
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value
}

export function normalizeRentalDates(rental) {
  if (!rental || typeof rental !== 'object' || Array.isArray(rental)) return rental
  const normalize = (item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const result = { ...item }
    for (const field of ['kiraBaslangic', 'kiraBitis']) {
      if (Object.hasOwn(result, field)) result[field] = normalizeClientDate(result[field])
    }
    return result
  }
  const result = normalize(rental)
  for (const field of ['isyeriSahipleri', 'evSahipleri', 'kiraGecmisi']) {
    if (Array.isArray(result[field])) result[field] = result[field].map(normalize)
  }
  return result
}
