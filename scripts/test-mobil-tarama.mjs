import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import { mobilTaramaYolu, personelMi } from '../src/utils/mobilTarama.js'

assert.equal(mobilTaramaYolu('?tarama=z'), '/admin/z-raporu-yukle')
assert.equal(mobilTaramaYolu('?tarama=gider'), '/admin/gider-fisi-yukle')
assert.equal(mobilTaramaYolu('?tarama=https://example.com'), null)
assert.equal(mobilTaramaYolu('?tarama=//example.com'), null)
assert.equal(mobilTaramaYolu(''), null)
for (const role of ['admin', 'super_admin', 'personel']) assert.equal(personelMi({ role }), true)
for (const role of ['musteri', '', undefined]) assert.equal(personelMi({ role }), false)
assert.equal(personelMi(null), false)
for (const tip of ['z', 'gider']) {
  const url = `https://www.mubiserp.com/giris?tarama=${tip}`
  const svg = renderToStaticMarkup(React.createElement(QRCodeSVG, { value: url, size: 160, marginSize: 4 }))
  assert.match(svg, /^<svg/)
  assert.match(svg, /<path/)
  assert.doesNotMatch(svg, /password|token|secret/i)
}
console.log('Mobil tarama bağlantı ve QR kontrolleri başarılı')
