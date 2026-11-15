// MUBiS lisans imza anahtarı üretici (tek seferlik)
const { generateKeyPairSync } = require('node:crypto')
const fs = require('fs')
const path = require('path')

const dir = path.join(process.cwd(), 'keys')
fs.mkdirSync(dir, { recursive: true })

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

fs.writeFileSync(path.join(dir, 'lisans-private.pem'), privateKey)
fs.writeFileSync(path.join(dir, 'lisans-public.pem'), publicKey)
console.log('OK — anahtarlar yazıldı:', dir)
