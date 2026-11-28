export function mobilTaramaYolu(search) {
  const tip = new URLSearchParams(search).get('tarama')
  if (tip === 'z') return '/admin/z-raporu-yukle'
  if (tip === 'gider') return '/admin/gider-fisi-yukle'
  return null
}

export function personelMi(user) {
  return ['admin', 'super_admin', 'personel'].includes(user?.role)
}
