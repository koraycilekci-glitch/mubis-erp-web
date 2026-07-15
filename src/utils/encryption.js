import CryptoJS from 'crypto-js'

const SECRET_KEY = 'MUBIS-ERP-2026-AES256-SECRET-KEY'

export function encrypt(text) {
  if (!text) return ''
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString()
}

export function decrypt(encrypted) {
  if (!encrypted) return ''
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY)
    return bytes.toString(CryptoJS.enc.Utf8)
  } catch {
    return ''
  }
}

export function encryptCredentials(username, password) {
  return {
    username: encrypt(username),
    password: encrypt(password)
  }
}

export function decryptCredentials(encryptedData) {
  return {
    username: decrypt(encryptedData.username),
    password: decrypt(encryptedData.password)
  }
}