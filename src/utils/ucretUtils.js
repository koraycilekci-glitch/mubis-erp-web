const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

const toNumber = (value) => {
  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.')
    return Number(normalized) || 0
  }
  return Number(value) || 0
}

export function nettenBruteUcret(netUcret, options = {}) {
  const net = toNumber(netUcret)
  if (net <= 0) return 0

  const gelirVergisiOrani = toNumber(options.gelirVergisiOrani || 0.15)
  const damgaVergisiOrani = toNumber(options.damgaVergisiOrani || 0.00759)
  const sgkIsciOrani = toNumber(options.sgkIsciOrani || 0.14)
  const issizlikIsciOrani = toNumber(options.issizlikIsciOrani || 0.01)
  const kesintiOrani = gelirVergisiOrani + damgaVergisiOrani + sgkIsciOrani + issizlikIsciOrani

  if (kesintiOrani >= 1) return roundMoney(net)
  return roundMoney(net / (1 - kesintiOrani))
}

export function brutUcretHesapla(employee = {}, options = {}) {
  const brut = toNumber(employee.brut_ucret ?? employee.brut_maas ?? employee.brutUcret)
  if (brut > 0) return roundMoney(brut)

  const net = toNumber(employee.net_ucret ?? employee.net_maas ?? employee.netUcret)
  return nettenBruteUcret(net, options)
}

export function personelUcretAlanlariniHazirla(employee = {}, options = {}) {
  const brut = brutUcretHesapla(employee, options)
  const net = toNumber(employee.net_ucret ?? employee.net_maas ?? employee.netUcret)

  return {
    ...employee,
    brut_ucret: brut,
    brut_maas: brut,
    brutUcret: brut,
    net_ucret: net,
    net_maas: net,
    netUcret: net,
    hesaplanan_brut_ucret: brut
  }
}

export default brutUcretHesapla