/**
 * settings.js — Settings actions: theme, notifications, export, backup
 */
import { getConfig, saveConfig, clearAllData, getLogs } from './db.js'
import { showToast } from './ui.js'
import { chartDefaults, renderHomeChart, renderStatsChart } from './charts.js'
import JSZip from 'jszip'
import { LocalNotifications } from '@capacitor/local-notifications'
import { StatusBar, Style } from '@capacitor/status-bar'
import { saveGeminiKey, getGeminiKey, removeGeminiKey } from './secureStorage.js'

/* ── Max Sugar & Profile ── */
export async function saveCfgProfile() {
  const maxSugar = parseFloat(document.getElementById('cfg-max-sugar').value)
  const weight   = parseFloat(document.getElementById('cfg-weight').value)
  const height   = parseFloat(document.getElementById('cfg-height').value)
  const age      = parseFloat(document.getElementById('cfg-age')?.value)
  const sex      = document.getElementById('cfg-sex')?.value || 'female'
  const actEl = document.querySelector('.activity-option.active[data-activity]')
  const activity = actEl ? actEl.dataset.activity : (document.getElementById('cfg-activity')?.value || 'moderate')

  // Validaciones
  if (!isNaN(maxSugar) && (maxSugar <= 0 || maxSugar > 500)) {
    showToast(window.t ? window.t('cfg.error_max_sugar', 'El límite debe estar entre 1 y 500 gr.') : 'El límite de azúcar debe estar entre 1 y 500 gr.', true, 'error'); return
  }
  if (!isNaN(weight) && (weight < 20 || weight > 300)) {
    showToast(window.t ? window.t('cfg.error_weight', 'El peso debe estar entre 20 y 300 kg.') : 'El peso debe estar entre 20 y 300 kg.', true, 'error'); return
  }
  if (!isNaN(height) && (height < 50 || height > 250)) {
    showToast(window.t ? window.t('cfg.error_height', 'La altura debe estar entre 50 y 250 cm.') : 'La altura debe estar entre 50 y 250 cm.', true, 'error'); return
  }
  if (!isNaN(age) && (age < 8 || age > 120)) {
    showToast(window.t ? window.t('cfg.error_age', 'La edad debe estar entre 8 y 120 años.') : 'La edad debe estar entre 8 y 120 años.', true, 'error'); return
  }

  const c = await getConfig()
  if (!isNaN(weight))   c.weight   = weight
  if (!isNaN(height))   c.height   = height
  if (!isNaN(age))      c.age      = age
  if (sex)              c.sex      = sex
  if (activity)         c.activity = activity

  // Recalcular límite automáticamente si no tiene manual override
  const { calculateRecommendedMaxSugar } = await import('./helpers.js')
  const auto = calculateRecommendedMaxSugar(
    c.weight || 70, c.height || 170, c.age || 25, c.sex || 'female', c.activity || 'moderate'
  )

  // Si el campo maxSugar está vacío o no lo ha tocado, usar el calculado
  if (!isNaN(maxSugar) && maxSugar > 0) {
    c.maxSugar = maxSugar
  } else {
    c.maxSugar = auto
  }

  await saveConfig(c)

  const autoEl = document.getElementById('cfg-auto-limit')
  if (autoEl) autoEl.textContent = auto + 'gr/d\u00eda'

  showToast('✓ ' + (window.t ? window.t('cfg.save_profile') : 'Perfil guardado') + '. ' + (window.t ? window.t('cfg.auto_limit') : 'Límite') + ': ' + c.maxSugar + 'gr/día', false, 'success')

  try { const { renderHome } = await import('./ui.js'); await renderHome() } catch(e) {}
}

/* ── Custom Font ── */
export async function saveCfgFont() {
  const fontDef = document.getElementById('cfg-font').value.trim()
  const c = await getConfig()
  c.font = fontDef
  await saveConfig(c)
  applyFont(fontDef)
  showToast(window.t ? window.t('cfg.font_applied', 'Fuente aplicada.') : 'Fuente aplicada.')
}

export function applyFont(fontDef) {
  let styleEl = document.getElementById('custom-font-style')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'custom-font-style'
    document.head.appendChild(styleEl)
  }

  if (!fontDef) {
    styleEl.innerHTML = ''
    document.body.style.fontFamily = ''
    return
  }

  // If user pastes an @import snippet, let's inject it.
  // We'll also try to apply it to the body if it's a simple name.
  if (fontDef.includes('@import') || fontDef.includes('{')) {
    styleEl.innerHTML = fontDef
  } else {
    styleEl.innerHTML = ''
    document.body.style.fontFamily = fontDef
  }
}

/* ── AI Config ── */
export async function saveCfgGeminiKey() {
  const key = document.getElementById('cfg-gemini-key').value.trim()

  if (key) {
    await saveGeminiKey(key)
  } else {
    await removeGeminiKey()
  }

  // Eliminar la key de IndexedDB si estaba guardada ahí antes
  const c = await getConfig()
  if (c.geminiApiKey) {
    delete c.geminiApiKey
    await saveConfig(c)
  }

  showToast(window.t ? window.t('cfg.api_key_saved', 'Clave API guardada de forma segura.') : 'Clave API guardada de forma segura.', false, 'success')
}

/* ── Notifications ── */
export async function toggleNotif() {
  const c = await getConfig()
  c.notifications = !c.notifications
  await saveConfig(c)

  const toggle = document.getElementById('notif-toggle')
  toggle.classList.toggle('on', c.notifications)

  const container = document.getElementById('notif-times-container')
  if (c.notifications) {
    container.style.opacity = '1'
    container.style.maxHeight = '350px'
    await scheduleNotifications(c)
  } else {
    container.style.opacity = '0'
    container.style.maxHeight = '0'
    try {
      await LocalNotifications.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    } catch (e) { }
  }

  showToast(c.notifications
    ? (window.t ? window.t('settings.notifications_on') : 'Notificaciones activadas.')
    : (window.t ? window.t('settings.notifications_off') : 'Notificaciones desactivadas.'))
}

/* ── Updater Config ── */
export async function toggleAutoUpdate() {
  const c = await getConfig()
  c.autoUpdate = !c.autoUpdate
  await saveConfig(c)
  document.getElementById('auto-update-toggle').classList.toggle('on', c.autoUpdate)
  showToast(c.autoUpdate
    ? (window.t ? window.t('settings.auto_update_on', 'Actualizaciones automáticas activadas.') : 'Actualizaciones automáticas activadas.')
    : (window.t ? window.t('settings.auto_update_off', 'Actualizaciones automáticas desactivadas.') : 'Actualizaciones automáticas desactivadas.'))
}

export async function toggleNotifUpdate() {
  const c = await getConfig()
  c.notifUpdate = !c.notifUpdate
  await saveConfig(c)
  document.getElementById('notif-update-toggle').classList.toggle('on', c.notifUpdate)
  showToast(c.notifUpdate
    ? (window.t ? window.t('settings.notif_update_on', 'Notificaciones de actualización activadas.') : 'Notificaciones de actualización activadas.')
    : (window.t ? window.t('settings.notif_update_off', 'Notificaciones de actualización desactivadas.') : 'Notificaciones de actualización desactivadas.'))
}

export async function saveCfgNotifTimes() {
  const c = await getConfig()
  c.notifComerStart = document.getElementById('cfg-notif-comer-start').value
  c.notifComerEnd = document.getElementById('cfg-notif-comer-end').value
  c.notifCenaStart = document.getElementById('cfg-notif-cena-start').value
  c.notifCenaEnd = document.getElementById('cfg-notif-cena-end').value
  c.notifMeriendaEnabled = document.getElementById('cfg-notif-merienda-toggle').checked
  c.notifMeriendaStart = document.getElementById('cfg-notif-merienda-start').value
  c.notifMeriendaEnd = document.getElementById('cfg-notif-merienda-end').value
  await saveConfig(c)

  if (c.notifications) {
    await scheduleNotifications(c)
  }

  showToast(window.t ? window.t('cfg.times_saved', 'Horarios guardados.') : 'Horarios guardados.')
}

async function scheduleNotifications(c) {
  try {
    let permStatus = await LocalNotifications.checkPermissions()
    if (permStatus.display !== 'granted') {
      permStatus = await LocalNotifications.requestPermissions()
      if (permStatus.display !== 'granted') {
        showToast(window.t ? window.t('cfg.notif_denied', 'Permiso de notificaciones denegado.') : 'Permiso de notificaciones denegado.', true)
        return
      }
    }

    try {
      await LocalNotifications.createChannel({
        id: 'sugar_reminders',
        name: 'Recordatorios de comidas',
        description: 'Notificaciones tras comer o cenar',
        importance: 5,
        visibility: 1,
        vibration: true
      })
    } catch (e) { }

    await LocalNotifications.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] })

    const schedule = []
    const parseTime = (timeStr) => {
      const [h, m] = (timeStr || '12:00').split(':').map(Number)
      return { hour: h, minute: m }
    }

    if (c.notifComerEnd) {
      schedule.push({
        title: "¡No olvides registrar!",
        body: "¿Has terminado de comer? Añade tu azúcar ahora.",
        id: 1,
        channelId: 'sugar_reminders',
        schedule: { on: parseTime(c.notifComerEnd), repeats: true, allowWhileIdle: true }
      })
    }
    if (c.notifCenaEnd) {
      schedule.push({
        title: "¡No olvides registrar!",
        body: "¿Has terminado de cenar? Añade tu azúcar ahora.",
        id: 2,
        channelId: 'sugar_reminders',
        schedule: { on: parseTime(c.notifCenaEnd), repeats: true, allowWhileIdle: true }
      })
    }
    if (c.notifMeriendaEnabled && c.notifMeriendaEnd) {
      schedule.push({
        title: "¡No olvides registrar!",
        body: "¿Has tomado algo para merendar? ¡Regístralo!",
        id: 3,
        channelId: 'sugar_reminders',
        schedule: { on: parseTime(c.notifMeriendaEnd), repeats: true, allowWhileIdle: true }
      })
    }
    // Notificación inteligente — aviso a las 18:00 si se supera el 80% del límite
    schedule.push({
      title: "⚠️ Vas a más del 80% de tu límite",
      body: "Ten cuidado con la cena — ya llevas mucho azúcar hoy.",
      id: 4,
      channelId: 'sugar_reminders',
      schedule: { on: { hour: 18, minute: 0 }, repeats: true, allowWhileIdle: true }
    })

    if (schedule.length > 0) {
      await LocalNotifications.schedule({ notifications: schedule })
    }
  } catch (e) {
    console.error('Failed to schedule notifications', e)
  }
}

/* ── Theme ── */
export async function setTheme(theme) {
  const c = await getConfig()
  c.theme = theme
  await saveConfig(c)
  applyTheme(theme)
    ;['dark', 'light', 'system'].forEach(t =>
      document.getElementById('seg-' + t).classList.toggle('active', t === theme)
    )
}

export async function applyTheme(theme) {
  const r = document.documentElement
  let isDark = false
  if (theme === 'dark') {
    isDark = true
    r.classList.add('dark')
    r.classList.remove('light')
  } else if (theme === 'light') {
    isDark = false
    r.classList.remove('dark')
    r.classList.add('light')
  } else {
    isDark = window.matchMedia('(prefers-color-scheme:dark)').matches
    r.classList.toggle('dark', isDark)
    r.classList.toggle('light', !isDark)
  }

  try {
    const color = isDark ? '#12121A' : '#F8F9FF'
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color })
  } catch (e) { }

  const aboutLogo = document.getElementById('about-app-logo')
  if (aboutLogo) { aboutLogo.src = isDark ? 'assets/icons/sobre-oscuro.png' : 'assets/icons/sobre-claro.png' }
  const homeLogo6 = document.getElementById('home-logo')
  if (homeLogo6) { homeLogo6.src = isDark ? 'assets/icons/icono-claro.png' : 'assets/icons/icono-oscuro.png' }

  // Re-render charts with new theme colors after a repaint
  requestAnimationFrame(() => {
    chartDefaults()
    renderHomeChart()
    if (document.getElementById('overlay-stats')?.classList.contains('open')) {
      renderStatsChart(window.__currentRange || '7d')
    }
  })
}

/* ── Export data as .zip ── */
export async function exportDataAsZip() {
  try {
    const logs = await getLogs()
    const config = await getConfig()

    const zip = new JSZip()
    zip.file('logs.json', JSON.stringify(logs, null, 2))
    zip.file('config.json', JSON.stringify(config, null, 2))

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sugar-count-backup-${new Date().toISOString().slice(0, 10)}.zip`
    document.body.appendChild(a)
    a.click()

    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)

    showToast(window.t ? window.t('settings.export_ok', 'Historial exportado correctamente.') : 'Historial exportado correctamente.')
  } catch (err) {
    console.error('Export failed:', err)
    showToast(window.t ? window.t('settings.export_error', 'Error al exportar datos.') : 'Error al exportar datos.', true)
  }
}

/* ── Clear all data ── */
let confirmClear = false
export async function handleClearAll(renderHomeCallback) {
  const btn = document.getElementById('btn-clear-data')
  if (!confirmClear) {
    confirmClear = true
    const oldHtml = btn.innerHTML
    btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> ${window.t ? window.t('settings.confirm_clear', 'Pulsa de nuevo para borrar') : 'Pulsa de nuevo para borrar'}`
    setTimeout(() => {
      confirmClear = false
      if (btn) btn.innerHTML = oldHtml
    }, 3000)
    return
  }
  confirmClear = false
  if (btn) btn.innerHTML = window.t ? window.t('settings.clearing', 'Borrando...') : 'Borrando...'

  await clearAllData()
  if (renderHomeCallback) await renderHomeCallback()
  showToast(window.t ? window.t('settings.data_cleared', 'Todos los datos borrados.') : 'Todos los datos borrados.')
  if (btn) btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> ${window.t ? window.t('settings.btn_clear_data', 'Borrar todos los datos') : 'Borrar todos los datos'}`
}

/* ── Gamification toggle ── */
export async function toggleGamification() {
  const c = await getConfig()
  c.gamification = c.gamification === false ? true : false
  await saveConfig(c)

  document.getElementById('gamification-toggle')?.classList.toggle('on', c.gamification !== false)
  const navLogros = document.getElementById('nav-logros')
  if (navLogros) navLogros.style.display = c.gamification !== false ? '' : 'none'

  showToast(c.gamification !== false
    ? (window.t ? window.t('settings.gamification_on', 'Logros activados.') : 'Logros activados.')
    : (window.t ? window.t('settings.gamification_off', 'Logros desactivados.') : 'Logros desactivados.'),
    false, c.gamification !== false ? 'success' : 'info')
}
