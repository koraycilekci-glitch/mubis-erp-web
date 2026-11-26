const assert = require('node:assert/strict')
const fs = require('node:fs')

const source = fs.readFileSync('src/components/AdminSidebar.jsx', 'utf8').replace(/\r\n/g, '\n')

// 1. Müşteriler bağımsız üst seviye öge olmalı
const musteriSatiri = "  { to: '/admin/musteriler', icon: Users, label: 'Müşteriler' },"
assert.ok(source.includes(musteriSatiri), 'Müşteriler bağımsız üst seviye satır değil')

// 2. Satır, Fatura İşlemleri grubunun KAPANIŞINDAN hemen sonra gelmeli
const faturaGrupKapanis = source.indexOf("    ]\n  },\n" + musteriSatiri)
assert.ok(faturaGrupKapanis > 0, 'Müşteriler, Fatura İşlemleri grubunun hemen altında değil')
// Kapanıştan önceki grup gerçekten fatura-islemleri olmalı
const faturaBaslangic = source.indexOf("id: 'fatura-islemleri'")
assert.ok(faturaBaslangic > 0 && faturaBaslangic < faturaGrupKapanis, 'Müşteriler fatura-islemleri grubundan sonra değil')

// 3. Müşteriler fatura-islemleri children içinde OLMAMALI
const grup = source.slice(faturaBaslangic, source.indexOf('\n    ]', faturaBaslangic))
assert.ok(!grup.includes('/admin/musteriler'), 'Müşteriler hâlâ grup içinde')

// 4. Personel varsayılanı filtresi kaldırılmış olmalı
assert.ok(!source.includes(".filter(t => t !== '/admin/musteriler')"), 'Personel varsayılan filtresi hâlâ duruyor')

console.log('PASS: Müşteriler, Fatura İşlemleri grubunun hemen altında bağımsız bir satır.')
