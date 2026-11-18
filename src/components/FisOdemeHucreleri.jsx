import { fisOdemeBilgisi } from '../utils/fisDetay'

export default function FisOdemeHucreleri({ fatura, ilkSatir = true, coklu = false }) {
  const fisMi = ['Z RAPORU', 'GİDER FİŞİ', 'GİDER DÖKÜMÜ'].includes(fatura.fatura_turu)
  const odeme = fisOdemeBilgisi(fatura)
  return ['nakit', 'kredi'].map(alan => (
    <td key={alan} className="py-2 whitespace-nowrap text-right text-cyan-300" title={fisMi ? (fatura.fisDetayUyari || (coklu ? 'Belgenin ödeme toplamı; yalnızca ilk KDV satırında gösterilir.' : 'Belgenin ödeme tutarı')) : ''}>
      {fisMi && ilkSatir ? (odeme[alan] == null ? 'Bilinmiyor' : odeme[alan].toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '—'}
      {fisMi && ilkSatir && coklu && <span className="block text-[10px] text-gray-500">Belge toplamı</span>}
    </td>
  ))
}
