/**
 * charts.js — Chart.js rendering for Sugar Count
 */
import { Chart, registerables } from 'chart.js'
import { getLogs, getConfig } from './db.js'
import { dailyTotalsSync, hourlyTotalsSync, predictionData, calculateRecommendedMaxSugar } from './helpers.js'

Chart.register(...registerables)

export let homeChart = null
export let statsChart = null

export function chartDefaults() {
  const s = getComputedStyle(document.documentElement)
  Chart.defaults.color = s.getPropertyValue('--text-dim').trim()
  Chart.defaults.borderColor = s.getPropertyValue('--border').trim()
  Chart.defaults.font.family = "'SN Pro','Inter',sans-serif"
}

export async function renderHomeChart() {
  const logs = await getLogs()
  const cfg = await getConfig()
  const { labels, real, pred } = predictionData(logs)
  const trueMaxSugar = calculateRecommendedMaxSugar(
    cfg.weight || 70, cfg.height || 170, cfg.age || 25, cfg.sex || 'female', cfg.activity || 'moderate'
  )
  const activeMaxSugar = cfg.maxSugar > 0 ? cfg.maxSugar : trueMaxSugar

  const s = getComputedStyle(document.documentElement)
  const accent  = s.getPropertyValue('--accent').trim()
  const accentL = s.getPropertyValue('--accent-l').trim()

  const ctx = document.getElementById('chart-home')?.getContext('2d')
  if (!ctx) return
  if (homeChart) homeChart.destroy()

  // Una sola línea continua: real + predicción unidos
  // labels ya contiene 7 reales + 7 predicción = 14, igual que allData
  const allLabels  = labels
  const joinIdx    = real.length - 1  // índice donde empieza la predicción
  const allData    = [...real, ...pred]

  const allValues  = allData.filter(v => v != null && !isNaN(v))
  const dataMax    = allValues.length ? Math.max(...allValues) : 10
  const dataMin    = allValues.length ? Math.min(...allValues) : 0
  const dataRange  = dataMax - dataMin || dataMax || 10
  const yMax       = dataMax + dataRange * 0.35
  const yMin       = Math.max(0, dataMin - dataRange * 0.2)

  // Plugin personalizado: dibuja la línea en dos segmentos DESPUÉS de Chart.js
  const splitLinePlugin = {
    id: 'splitLine',
    afterDraw(chart) {
      const { ctx: c, scales: { x, y }, data } = chart
      const pts = data.datasets[0].data
      if (!pts || pts.length < 2) return

      c.save()

      // Segmento real — línea sólida accent
      c.beginPath()
      c.strokeStyle = accent
      c.lineWidth   = 2.5
      c.lineJoin    = 'round'
      c.setLineDash([])
      let started = false
      for (let i = 0; i <= joinIdx && i < pts.length; i++) {
        const px = x.getPixelForValue(i)
        const py = y.getPixelForValue(pts[i])
        if (!started) { c.moveTo(px, py); started = true }
        else c.lineTo(px, py)
      }
      c.stroke()

      // Segmento predicción — línea punteada más tenue
      c.beginPath()
      c.strokeStyle = accentL
      c.lineWidth   = 2
      c.globalAlpha = 0.55
      c.lineJoin    = 'round'
      c.setLineDash([5, 5])
      started = false
      for (let i = joinIdx; i < pts.length; i++) {
        const px = x.getPixelForValue(i)
        const py = y.getPixelForValue(pts[i])
        if (!started) { c.moveTo(px, py); started = true }
        else c.lineTo(px, py)
      }
      c.stroke()

      c.restore()
    }
  }

  homeChart = new Chart(ctx, {
    type: 'line',
    plugins: [splitLinePlugin],
    data: {
      labels: allLabels,
      datasets: [
        {
          // Dataset invisible — solo para que Chart.js gestione las escalas y los puntos
          data: allData,
          borderColor: 'transparent',
          backgroundColor: accent + '18',
          fill: true,
          tension: 0.4,
          pointRadius: (ctx) => ctx.dataIndex === joinIdx ? 6 : ctx.dataIndex < real.length ? 3 : 2.5,
          pointBackgroundColor: (ctx) => ctx.dataIndex < real.length ? accent : accentL,
          pointBorderColor: 'transparent',
          pointHoverRadius: 6,
          borderWidth: 0,
          spanGaps: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      layout: { padding: { top: 14, bottom: 12, left: 8, right: 8 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          display: false,
          min: -(dataRange * 0.08),
          max: yMax * 1.1
        }
      }
    }
  })
}

/* ── Helper: get raw logs for a clicked chart bar ── */
function getLogsForPoint(allLogs, pts, idx, range) {
  // pts[idx].label es la etiqueta del punto (ej "21 mar" o "14:00")
  const pt = pts[idx]
  if (!pt) return []

  const now = new Date()

  if (range === '24h') {
    // Punto = hora concreta
    return allLogs.filter(l => {
      const d = new Date(l.date)
      const cutoff = new Date(now)
      cutoff.setHours(cutoff.getHours() - 24 + idx)
      const next = new Date(cutoff)
      next.setHours(next.getHours() + 1)
      return d >= cutoff && d < next
    })
  } else {
    // Punto = día concreto — comparar por fecha local
    return allLogs.filter(l => {
      const d = new Date(l.date)
      const label = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      return label === pt.label
    })
  }
}

export async function renderStatsChart(range) {
  const logs = await getLogs()
  let pts

  switch (range) {
    case '24h': pts = hourlyTotalsSync(logs, 24); break
    case '7d':  pts = dailyTotalsSync(logs, 7);   break
    case '14d': pts = dailyTotalsSync(logs, 14);  break
    case '1m':  pts = dailyTotalsSync(logs, 30);  break
    case '6m':  pts = dailyTotalsSync(logs, 180); break
    case '1y':  pts = dailyTotalsSync(logs, 365); break
    default:    pts = dailyTotalsSync(logs, 7)
  }

  // Aggregate by week for long ranges
  if (range === '6m' || range === '1y') {
    const w = []
    for (let i = 0; i < pts.length; i += 7) {
      const c = pts.slice(i, i + 7)
      w.push({ label: c[0]?.label || '', total: c.reduce((s, p) => s + p.total, 0) })
    }
    pts = w
  }

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const data = pts.map(p => p.total)
  const labels = pts.map(p => p.label)
  const total = data.reduce((s, v) => s + v, 0)
  const numDays = range === '24h' ? 1 : range === '7d' ? 7 : range === '14d' ? 14 : range === '1m' ? 30 : range === '6m' ? 180 : 365

  const fmt = n => (n % 1 === 0 ? n : n.toFixed(1)) + 'gr'
  document.getElementById('sts-total').textContent = fmt(total)
  document.getElementById('sts-avg').textContent = fmt(+(total / numDays).toFixed(1))
  document.getElementById('sts-max').textContent = fmt(Math.max(...data) || 0)

  const ctx = document.getElementById('chart-stats')?.getContext('2d')
  if (!ctx) return
  if (statsChart) statsChart.destroy()

  const s2=getComputedStyle(document.documentElement),td2=s2.getPropertyValue('--text-dim').trim(),br2=s2.getPropertyValue('--border').trim()
  const bg2=accent+'bb';
  statsChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: bg2, borderColor: 'transparent', borderWidth: 0, borderRadius: 8, borderSkipped: false, hoverBackgroundColor: accent }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: 'rgba(30,30,46,0.95)', titleColor: td2, bodyColor: accent, bodyFont: { size: 13, weight: '700' }, titleFont: { size: 10 }, padding: 10, cornerRadius: 10, displayColors: false, callbacks: { label: function(c){ return c.parsed.y.toFixed(1)+'gr' } } }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: td2 }, grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 10 }, color: td2, maxTicksLimit: 5 }, grid: { color: br2+'55', drawTicks: false }, border: { display: false, dash: [4,4] } }
      },
      onClick: (event, elements) => {
        if (!elements.length) return
        const idx = elements[0].index, label = labels[idx], pointLogs = getLogsForPoint(logs, pts, idx, range)
        if (window.openDayDetail) window.openDayDetail(label, pointLogs, range)
      }
    }
  })

  return { logs, range }
}
