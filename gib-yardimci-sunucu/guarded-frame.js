// guarded-frame.js — Frame işlemlerine zaman aşımı koruması
// Her frame.evaluate/frame.goto çağrısı çevresine alınarak,
// yanıt gelmediği takdirde işlem iptal edilir ve hatra kaydedilir.
// Bu, lunası biten frame'ler (hangirse) sistemin takılması önlenir.

const fs = require('node:fs')
const path = require('node:path')

// Frame'e gönderilecek eylemlerin çevresine zaman aşımı wrapper'ı
function guardedEval(frame, fn, options = {}) {
  const {
    timeout = 15000,          // varsayılan 15 saniye
    retries = 0,             // deneme sayısı (0 = tek deneme)
    onTimeout = () => { }    // zaman aşı callback'i
  } = options

  // Promise ile çevrele, timeout'u çatallayarak iptal et
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer)
      onTimeout(new Error(`Guarded frame eval timeout after ${timeout}ms`))
      reject(new Error(`Frame eval timeout: ${timeout}ms`))
    }, timeout)

    try {
      frame.evaluate(fn)
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(err => {
          clearTimeout(timer)
          reject(err)
        })
    } catch (e) {
      clearTimeout(timer)
      reject(e)
    }
  })
}

// Frame'e goto benzeri operasyonlar için de kullanılabilir
function guardedGoto(page, url, options = {}) {
  const { timeout = 30000, onTimeout = () => { } } = options

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer)
      onTimeout(new Error(`Guided page goto timeout after ${timeout}ms`))
      reject(new Error(`Page goto timeout: ${timeout}ms`))
    }, timeout)

    page.goto(url, { waitUntil: 'domcontentloaded' })
      .then(() => {
        clearTimeout(timer)
        resolve()
      })
      .catch(err => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

module.exports = { guardedEval, guardedGoto }