/**
 * gamification.js — Streak tracking and achievement system (mejorado)
 */
import { getConfig, saveConfig, getLogs } from './db.js'
import { startOfDay, endOfDay, calculateRecommendedMaxSugar } from './helpers.js'
import { showToast } from './ui.js'

/* ── Achievement definitions ── */
const ACHIEVEMENTS = [
  // ── Rachas buenas (días SIN superar el límite) ──
  {
    id: 'streak1',
    name: 'Primer día limpio',
    desc: '1 día sin superar tu límite de azúcar.',
    icon: '🌱',
    type: 'good',
    threshold: 1
  },
  {
    id: 'streak3',
    name: '3 días seguidos',
    desc: '3 días consecutivos dentro del límite.',
    icon: '🔥',
    type: 'good',
    threshold: 3
  },
  {
    id: 'streak7',
    name: 'Una semana perfecta',
    desc: '7 días seguidos sin pasarte.',
    icon: '⭐',
    type: 'good',
    threshold: 7
  },
  {
    id: 'streak14',
    name: 'Dos semanas de control',
    desc: '14 días consecutivos dentro del límite.',
    icon: '💪',
    type: 'good',
    threshold: 14
  },
  {
    id: 'streak30',
    name: 'Un mes impecable',
    desc: '30 días seguidos sin superar el límite.',
    icon: '🏆',
    type: 'good',
    threshold: 30
  },
  {
    id: 'streak60',
    name: 'Dos meses de disciplina',
    desc: '60 días consecutivos bajo control.',
    icon: '🎯',
    type: 'good',
    threshold: 60
  },
  {
    id: 'streak100',
    name: '100 días de leyenda',
    desc: '100 días seguidos sin pasarte. Eres increíble.',
    icon: '👑',
    type: 'good',
    threshold: 100
  },
  {
    id: 'streak365',
    name: 'Un año sin rendirse',
    desc: '365 días consecutivos dentro del límite. Historia.',
    icon: '🌟',
    type: 'good',
    threshold: 365
  },

  // ── Primer registro ──
  {
    id: 'first',
    name: 'Primer registro',
    desc: 'Añadiste tu primer alimento.',
    icon: '📝',
    type: 'milestone',
    threshold: -1
  },

  // ── Hitos de registros totales ──
  {
    id: 'logs10',
    name: '10 registros',
    desc: 'Llevas 10 alimentos registrados.',
    icon: '📊',
    type: 'milestone',
    logsThreshold: 10
  },
  {
    id: 'logs50',
    name: '50 registros',
    desc: 'Llevas 50 alimentos registrados.',
    icon: '📈',
    type: 'milestone',
    logsThreshold: 50
  },
  {
    id: 'logs100',
    name: '100 registros',
    desc: '100 alimentos registrados. ¡Constancia al poder!',
    icon: '🗂️',
    type: 'milestone',
    logsThreshold: 100
  },
  {
    id: 'logs500',
    name: '500 registros',
    desc: '500 entradas. Ya eres un experto en tu dieta.',
    icon: '🏅',
    type: 'milestone',
    logsThreshold: 500
  },

  // ── Logros malos (días superando el límite seguidos) ──
  {
    id: 'badstreak3',
    name: '3 días de exceso',
    desc: '3 días seguidos superando tu límite. ¡Vuelve al camino!',
    icon: '⚠️',
    type: 'bad',
    badThreshold: 3
  },
  {
    id: 'badstreak7',
    name: 'Semana difícil',
    desc: '7 días consecutivos por encima del límite.',
    icon: '📉',
    type: 'bad',
    badThreshold: 7
  },
  {
    id: 'badstreak10',
    name: '10 días de mala racha',
    desc: '10 días seguidos superando el límite. ¿Necesitas ayuda?',
    icon: '😟',
    type: 'bad',
    badThreshold: 10
  },
  {
    id: 'badstreak30',
    name: 'Mes complicado',
    desc: '30 días por encima del límite. Tómatelo en serio.',
    icon: '🚨',
    type: 'bad',
    badThreshold: 30
  },

  // ── Logros especiales ──
  {
    id: 'comeback',
    name: 'Vuelta a la pista',
    desc: 'Rompiste una mala racha de más de 3 días y volviste al límite.',
    icon: '💚',
    type: 'special',
    special: true
  },
  {
    id: 'perfectweek',
    name: 'Semana perfecta',
    desc: 'Una semana entera sin ni un solo día de exceso.',
    icon: '✨',
    type: 'special',
    special: true
  }
]

/* ── Helpers ── */
function getDailyTotal(logs, date) {
  const sod = startOfDay(date)
  const eod = endOfDay(date)
  return logs
    .filter(l => { const d = new Date(l.date); return d >= sod && d <= eod })
    .reduce((sum, l) => sum + l.sugar, 0)
}

function hadEntries(logs, date) {
  const sod = startOfDay(date)
  const eod = endOfDay(date)
  return logs.some(l => { const d = new Date(l.date); return d >= sod && d <= eod })
}

/* ── updateStreak ── */
export async function updateStreak() {
  const cfg = await getConfig()
  const todayStr = new Date().toISOString().slice(0, 10)

  if (cfg.lastStreakDate === todayStr) return cfg

  const logs = await getLogs()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const maxSugar = cfg.maxSugar > 0
    ? cfg.maxSugar
    : calculateRecommendedMaxSugar(cfg.weight || 70, cfg.height || 170, cfg.age || 25, cfg.sex || 'female', cfg.activity || 'moderate')

  const yesterdayTotal = getDailyTotal(logs, yesterday)
  const yHadEntries = hadEntries(logs, yesterday)

  const prevBadStreak = cfg.badStreak || 0

  if (yHadEntries) {
    if (yesterdayTotal <= maxSugar) {
      // Día bueno
      cfg.streak = (cfg.streak || 0) + 1
      cfg.badStreak = 0

      // Logro especial: comeback tras mala racha ≥ 3 días
      if (prevBadStreak >= 3) {
        const unlocked = cfg.achievements || []
        if (!unlocked.includes('comeback')) {
          unlocked.push('comeback')
          cfg.achievements = unlocked
          const msg = window.t ? '💚 ' + (window.t('achievements.unlocked') || '¡Logro desbloqueado!') + ': ' + (window.t('achv.comeback_name') || 'Vuelta a la pista') : '💚 ¡Logro desbloqueado: Vuelta a la pista!'
          showToast(msg, false, 'success')
        }
      }
    } else {
      // Día malo
      cfg.badStreak = (cfg.badStreak || 0) + 1
      cfg.streak = 0
    }
  }
  // Sin entradas → mantenemos ambos streaks

  if (cfg.streak > (cfg.bestStreak || 0)) {
    cfg.bestStreak = cfg.streak
  }
  if (cfg.badStreak > (cfg.worstStreak || 0)) {
    cfg.worstStreak = cfg.badStreak
  }

  cfg.lastStreakDate = todayStr

  // ── Comprobar logros ──
  const unlocked = cfg.achievements || []
  const shownToasts = cfg.achievementsShown || [...(cfg.achievements || [])]
  const newlyUnlocked = []

  ACHIEVEMENTS.forEach(a => {
    if (unlocked.includes(a.id)) return

    // Primer registro
    if (a.id === 'first' && logs.length > 0) {
      unlocked.push(a.id); newlyUnlocked.push(a); return
    }

    // Racha buena
    if (a.threshold > 0 && cfg.streak >= a.threshold) {
      unlocked.push(a.id); newlyUnlocked.push(a); return
    }

    // Racha mala
    if (a.badThreshold && cfg.badStreak >= a.badThreshold) {
      unlocked.push(a.id); newlyUnlocked.push(a); return
    }

    // Hitos de registros
    if (a.logsThreshold && logs.length >= a.logsThreshold) {
      unlocked.push(a.id); newlyUnlocked.push(a); return
    }

    // Semana perfecta
    if (a.id === 'perfectweek' && cfg.streak >= 7) {
      unlocked.push(a.id); newlyUnlocked.push(a); return
    }
  })

  cfg.achievements = unlocked

  // Solo notificar los que NO se han mostrado antes
  const toNotify = newlyUnlocked.filter(a => !shownToasts.includes(a.id))
  toNotify.forEach(a => shownToasts.push(a.id))
  cfg.achievementsShown = shownToasts

  await saveConfig(cfg)

  // Mostrar toast solo para los genuinamente nuevos
  toNotify.forEach((a, i) => {
    setTimeout(() => {
      const isBad = a.type === 'bad'
      const prefix = isBad
        ? (window.t ? (window.t('achievements.streak') || 'Racha') + ': ' : 'Racha: ')
        : (window.t ? (window.t('achievements.unlocked') || '¡Logro desbloqueado!') + ': ' : '¡Logro desbloqueado: ')
      const achvName = window.t ? (window.t('achv.' + a.id + '_name') || a.name) : a.name
      showToast(
        `${a.icon} ${prefix}${achvName}!`,
        false,
        isBad ? 'warning' : 'success'
      )
    }, i * 1200)
  })

  return cfg
}

/* ── getAchievementList ── */
export function getAchievementList(unlockedIds = []) {
  return ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: unlockedIds.includes(a.id)
  }))
}

/* ── getStreakInfo — para mostrar en UI ── */
export async function getStreakInfo() {
  const cfg = await getConfig()
  return {
    streak:      cfg.streak      || 0,
    bestStreak:  cfg.bestStreak  || 0,
    badStreak:   cfg.badStreak   || 0,
    worstStreak: cfg.worstStreak || 0,
    achievements: cfg.achievements || []
  }
}

/* ── getNextAchievement — el siguiente logro bueno más cercano ── */
export async function getNextAchievement() {
  const cfg = await getConfig()
  const unlocked = cfg.achievements || []
  const streak = cfg.streak || 0

  const goodOnes = ACHIEVEMENTS
    .filter(a => a.threshold > 0 && a.type === 'good' && !unlocked.includes(a.id))
    .sort((a, b) => a.threshold - b.threshold)

  if (!goodOnes.length) return null

  const next = goodOnes[0]
  return {
    ...next,
    remaining: next.threshold - streak,
    progress: Math.min(1, streak / next.threshold)
  }
}
