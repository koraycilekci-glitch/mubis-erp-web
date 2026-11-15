#!/usr/bin/env node
// ============================================================
// MUBiS — Lisans Kodu Üretici (SADECE ÜRETİCİ / koray çalıştırır)
//
// Akış:
//   1) Müşteri Ayarlar > Lisans bölümünden TALEP KODU üretir (MUBREQ1...)
//   2) Siz bu araçla talep kodunu (veya ofis+cihaz bilgisi) lisans koduna çevirirsiniz (MUBLIC1...)
//   3) Müşteri lisans kodunu Ayarlar > Lisans'a girer → aktive olur
//
// KULLANIM
//   node scripts/lisans-uret.mjs --talep "MUBREQ1.xxxx.yyyy" --plan yillik --bitis 2027-11-15
//   node scripts/lisans-uret.mjs --talep "MUBREQ1.xxxx.yyyy" --plan kalici
//   node scripts/lisans-uret.mjs --office 2 --device ABCD1234... --plan aylik --bitis 2026-12-31
//
// PLANLAR: deneme | aylik | yillik | kalici  (kalici'da --bitis gerekmez)
// GEREKLİ: keys/lisans-private.pem  (git'e girmez — YEDEKLEYİN!)
// ============================================================

import { readFileSync, existsSync } from 'node:fs'
import { createSign, createHash } from 'node:crypto'

const args = process.argv.slice(2)
const al = (ad) => {
  const i = args.indexOf('--' + ad)
  return i >= 0 ? args[i + 1] : null
}

const PRIVATE_PATH = 'keys/lisans-private.pem'
if (!existsSync(PRIVATE_PATH)) {
  console.error('HATA: ' + PRIVATE_PATH + ' yok. Anahtar yedekten geri yükleyin.')
  process.exit(1)
}
const privateKey = readFileSync(PRIVATE_PATH, 'utf8')

let office = al('office')
let device = (al('device') || '').toUpperCase()
const talep = al('talep')
const plan = (al('plan') || 'yillik').toLowerCase()
const bitis = al('bitis')

if (!['deneme', 'aylik', 'yillik', 'kalici'].includes(plan)) {
  console.error('HATA: plan deneme|aylik|yillik|kalici olmalı.')
  process.exit(1)
}
if (plan !== 'kalici' && !bitis) {
  console.error('HATA: ' + plan + ' plan için --bitis YYYY-MM-DD gerekli (kalici için gerekmez).')
  process.exit(1)
}
if (bitis && !/^\d{4}-\d{2}-\d{2}$/.test(bitis)) {
  console.error('HATA: bitis formatı YYYY-MM-DD olmalı.')
  process.exit(1)
}

if (talep) {
  const checksum = body => createHash('sha256').update('MUBREQ1.' + body).digest('hex').slice(0, 16)
  // JS tarafındaki karma ile aynı olmalı (xsHash128 benzeri) — burada node crypto
  // sha256 kullanır, istemci tarafı da sha256 kullanır. Fark: CF'de sha256
  // async; basitlik için checksum aynı algoritmada tutulmalı. Aşağıdaki
  // talep çözümü yalnızca node tarafında üretilen kodlarla birebir çalışır.
  const parts = String(talep).trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'MUBREQ1') {
    console.error('HATA: talep kodu formatı bozuk (MUBREQ1.<payload>.<checksum>).')
    process.exit(1)
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  office = Number(payload.office)
  device = String(payload.device || '').toUpperCase()
}

if (!office || !/^\d+$/.test(String(office))) {
  console.error('HATA: --office N gerekli (veya --talep verin).')
  process.exit(1)
}

const payload = {
  v: 1,
  office: Number(office),
  device: device || null,
  plan,
  bitis: bitis ? bitis + 'T23:59:59Z' : null,
}
const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
const imza = createSign('RSA-SHA256').update('MUBLIC1.' + body).sign(privateKey).toString('base64url')

console.log('\n=== LİSANS KODU (müşteriye gönderin) ===')
console.log(`MUBLIC1.${body}.${imza}`)
console.log('\nDetay:', JSON.stringify({ office: Number(office), device: device || null, plan, bitis: payload.bitis }))
