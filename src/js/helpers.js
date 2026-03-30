/**
 * helpers.js — Utility functions for Sugar Count
 */

/* ── Date helpers ── */
export function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/* ── Number formatting ── */
export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '0gr'
  const rounded = Math.round(n * 10) / 10
  return (rounded % 1 === 0 ? rounded : rounded.toFixed(1)) + 'gr'
}

/* ── Glucose level estimate ── */
export function glucoseLevel(pct, fiberRatio = 0) {
  // Fiber reduces glycemic impact
  const adjusted = pct * (1 - fiberRatio * 0.3)
  return Math.min(100, Math.max(0, Math.round(adjusted)))
}

/* ── Sugar limit calculation — Mifflin-St Jeor completa ──
 *
 * Parámetros:
 *   weight   — kg
 *   height   — cm
 *   age      — años (default 30)
 *   sex      — 'male' | 'female' (default 'female')
 *   activity — 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
 *
 * Lógica:
 *   1. Calcular TMB (Tasa Metabólica Basal) con Mifflin-St Jeor
 *   2. Multiplicar por factor de actividad → TDEE (calorías totales)
 *   3. La OMS recomienda que el azúcar libre sea < 10% de las calorías totales
 *      (ideal < 5%, equivale a ~25gr para dieta de 2000kcal)
 *   4. Aplicar cap mínimo (15gr) y máximo (60gr)
 *
 * Ejemplos reales:
 *   - Chica 16 años, 55kg, 165cm, sedentaria → ~22gr
 *   - Chico 16 años, 70kg, 189cm, activo     → ~38gr
 *   - Mujer 30 años, 60kg, 165cm, moderada   → ~27gr
 *   - Hombre 25 años, 80kg, 180cm, activo    → ~36gr
 */
export function calculateRecommendedMaxSugar(
  weight = 70,
  height = 170,
  age = 30,
  sex = 'female',
  activity = 'moderate'
) {
  // Mifflin-St Jeor
  let bmr
  if (sex === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161
  }

  // Factores de actividad (Harris-Benedict adaptado)
  const activityFactors = {
    sedentary:   1.2,   // Trabajo de oficina, sin ejercicio
    light:       1.375, // Ejercicio ligero 1-3 días/semana
    moderate:    1.55,  // Ejercicio moderado 3-5 días/semana
    active:      1.725, // Ejercicio intenso 6-7 días/semana
    very_active: 1.9    // Trabajo físico + ejercicio intenso diario
  }
  const factor = activityFactors[activity] || activityFactors.moderate
  const tdee = bmr * factor

  // OMS: azúcar libre < 10% TDEE, objetivo < 5%
  // Usamos ~7% como punto medio razonable
  // 1g de azúcar = 4 kcal
  const sugarKcal = tdee * 0.07
  const sugarGrams = sugarKcal / 4

  // Clamp entre 15gr (mínimo seguro) y 60gr (máximo OMS para adultos activos)
  return Math.round(Math.min(60, Math.max(15, sugarGrams)))
}

/* ── Chart data helpers ── */
export function dailyTotalsSync(logs, days) {
  const pts = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const e = new Date(d); e.setHours(23, 59, 59, 999)
    const label = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    const total = logs
      .filter(l => { const ld = new Date(l.date); return ld >= d && ld <= e })
      .reduce((s, l) => s + (l.sugar || 0), 0)
    pts.push({ label, total })
  }
  return pts
}

export function hourlyTotalsSync(logs, hours) {
  const pts = []
  const now = new Date()
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(d.getHours() - i, 0, 0, 0)
    const e = new Date(d); e.setMinutes(59, 59, 999)
    const label = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    const total = logs
      .filter(l => { const ld = new Date(l.date); return ld >= d && ld <= e })
      .reduce((s, l) => s + (l.sugar || 0), 0)
    pts.push({ label, total })
  }
  return pts
}

export function predictionData(logs) {
  const today = new Date()
  const labels = []
  const real   = []
  const pred   = []

  // 7 días reales
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const e = new Date(d); e.setHours(23, 59, 59, 999)
    const total = logs
      .filter(l => { const ld = new Date(l.date); return ld >= d && ld <= e })
      .reduce((s, l) => s + (l.sugar || 0), 0)
    labels.push(d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))
    real.push(total)
  }

  // 7 días predicción (media móvil simple)
  const avg = real.reduce((s, v) => s + v, 0) / (real.length || 1)
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    labels.push(d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))
    pred.push(Math.round(avg * (0.95 + Math.random() * 0.1)))
  }

  return { labels, real, pred }
}
