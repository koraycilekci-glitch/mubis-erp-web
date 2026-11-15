// Geçici denetim: JSX'te tanımsız bileşen adı kullanımı (runtime "X is not defined" önleyici)
import fs from 'node:fs'
import path from 'node:path'

const KOK = path.resolve('src')
const sorun = []

function tara(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) { tara(p); continue }
    if (!f.endsWith('.jsx')) continue
    const src = fs.readFileSync(p, 'utf8')

    const imported = new Set()
    let m
    const rxNamed = /import\s+(?:type\s+)?\{([^}]+)\}\s+from/g
    while ((m = rxNamed.exec(src))) {
      m[1].split(',').forEach(x => {
        const n = x.trim().split(/\s+as\s+/).pop().trim()
        if (/^[A-Za-z_]/.test(n)) imported.add(n)
      })
    }
    const rxDef = /import\s+(?:(\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?)\s+from/g
    while ((m = rxDef.exec(src))) { const n = m[2]; if (n && n !== 'type') imported.add(n) }

    const def = new Set()
    const rxd = /(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g
    while ((m = rxd.exec(src))) def.add(m[1])

    // destructure: fonksiyon/obj parametre listesindeki adlar
    const rxPar = /[{(][^(){}]{0,120}\b([A-Z][A-Za-z0-9]*)\b[^(){}]{0,120}[)}]/g
    const params = new Set()
    while ((m = rxPar.exec(src))) params.add(m[1])

    const rxt = /<([A-Z][A-Za-z0-9]*)(?=[\s/>])/g
    while ((m = rxt.exec(src))) {
      const t = m[1]
      if (imported.has(t) || def.has(t) || params.has(t)) continue
      sorun.push(`${path.relative(KOK, p)} :: <${t}>`)
    }
  }
}
tara(KOK)
console.log('Şüpheli:', sorun.length)
sorun.forEach(x => console.log(' -', x))
