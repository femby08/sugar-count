/**
 * db.js — Dexie database layer for Sugar Count
 */
import Dexie from 'dexie'

const db = new Dexie('SugarCountDB')
db.version(1).stores({
  logs: 'id, date',
  settings: 'id'
})

const DEFAULT_CFG = { 
  id: 'config', 
  maxSugar: 50, 
  weight: 70, 
  height: 170,
  age: 25,
  sex: 'female',
  activity: 'moderate',
  font: '', 
  notifications: true, 
  notifComerStart: '14:30',
  notifComerEnd: '15:30',
  notifMeriendaEnabled: false,
  notifMeriendaStart: '18:00',
  notifMeriendaEnd: '19:00',
  notifCenaStart: '21:00',
  notifCenaEnd: '22:00',
  theme: 'dark',
  // Gamification
  streak: 0,
  bestStreak: 0,
  lastStreakDate: null,
  achievements: [],
  // AI
  geminiApiKey: '',
  // Update settings
  autoUpdate: true,
  notifUpdate: true
}

/* ── CRUD ── */
export async function getLogs() {
  return await db.logs.toArray()
}

export async function saveLog(log) {
  await db.logs.put(log)
}

export async function deleteLog(id) {
  await db.logs.delete(id)
}

export async function getConfig() {
  const cfg = await db.settings.get('config')
  return cfg || { ...DEFAULT_CFG }
}

export async function saveConfig(cfg) {
  cfg.id = 'config'
  await db.settings.put(cfg)
}

export async function clearAllData() {
  await Promise.all([db.logs.clear(), db.settings.clear()])
}

/* ── Helpers ── */
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export function endOfDay(d)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }

export async function getSugarTotals(startDate, endDate) {
  const logs = await db.logs.where('date').between(startDate.toISOString(), endDate.toISOString()).toArray()
  return logs.reduce((sum, log) => sum + log.sugar, 0)
}

/* ── Seed demo data ── */
export async function seed() {
  if (localStorage.getItem('sugar_count_seeded') === 'true') return
  const count = await db.logs.count()
  if (count > 0) {
    localStorage.setItem('sugar_count_seeded', 'true')
    return
  }

  const foods = [
    { food: 'Galletas', sugar: 12 }, { food: 'Zumo naranja', sugar: 8 },
    { food: 'Yogur', sugar: 6 },     { food: 'Cereales', sugar: 14 },
    { food: 'Refresco', sugar: 25 },  { food: 'Chocolate', sugar: 18 },
    { food: 'Café con leche', sugar: 4 }, { food: 'Fruta', sugar: 10 },
    { food: 'Mermelada', sugar: 9 },  { food: 'Helado', sugar: 22 },
  ]

  const now = new Date()
  const logs = []

  for (let d = 364; d >= 1; d--) {
    const n = Math.floor(Math.random() * 4)
    for (let e = 0; e < n; e++) {
      const f = foods[Math.floor(Math.random() * foods.length)]
      const dt = new Date(now)
      dt.setDate(dt.getDate() - d)
      dt.setHours(7 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 59))
      logs.push({ id: crypto.randomUUID(), date: dt.toISOString(), food: f.food, sugar: f.sugar })
    }
  }

  ;[
    { food: 'Galletas', sugar: 12 },
    { food: 'Zumo naranja', sugar: 8 },
    { food: 'Café con leche', sugar: 3 }
  ].forEach((f, i) => {
    const d = new Date(now)
    d.setHours(7 + i * 2, 30)
    logs.push({ id: crypto.randomUUID(), date: d.toISOString(), food: f.food, sugar: f.sugar })
  })

  await db.logs.bulkAdd(logs)
  localStorage.setItem('sugar_count_seeded', 'true')
  console.log('Demo data seeded.')
}
