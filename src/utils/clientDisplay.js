const collator = new Intl.Collator('tr', { sensitivity: 'base' })

export function clientDisplayName(client) {
  const fullName = [client?.name, client?.unvan, client?.company, client?.adSoyad, client?.ad_soyad, client?.ad, client?.isim]
    .find(value => typeof value === 'string' && value.trim())
  const shortName = [client?.shortName, client?.short_name, client?.kisaAd]
    .find(value => typeof value === 'string' && value.trim())
  return (fullName || shortName)?.trim() || (client?.id != null ? `Müşteri #${client.id}` : 'İsimsiz müşteri')
}

export function sortClients(clients) {
  return [...(clients || [])].sort((first, second) => collator.compare(clientDisplayName(first), clientDisplayName(second)))
}
