import fs from 'fs'
import path from 'path'

const dataDir = path.resolve('backup')
fs.mkdirSync(dataDir, { recursive: true })
const now = new Date().toISOString().slice(0, 10)
const out = path.join(dataDir, `cashmet-backup-${now}.json`)
fs.writeFileSync(out, JSON.stringify({ generatedAt: now, note: 'Export manual (Firestore)' }, null, 2))
console.log('Wrote', out)
