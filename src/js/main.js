/**
 * main.js — App entry point (thin orchestrator)
 */
import '../css/style.css'
import { initI18n, t, applyTranslationsToDOM } from './i18n.js'
import { seed, getConfig, saveConfig } from './db.js'
import {
  goTo, openStats, closeStats, openSettings, closeSettings,
  openAddSheet, closeAddSheet, saveEntry, renderHome, setRange, setSortOrder,
  initCardExpansion, closeExpandedCard, initRipples, openCameraMenu, closeCameraMenu,
  openSettingsSection, settingsBack, initSheetGestures, openLogros, closeLogros,
  closeDayDetail, showToast, openEditSheet
} from './ui.js'
import {
  saveCfgProfile, saveCfgFont, applyFont, toggleNotif, saveCfgNotifTimes, setTheme, applyTheme,
  exportDataAsZip, handleClearAll, saveCfgGeminiKey, toggleAutoUpdate, toggleNotifUpdate
} from './settings.js'
import { updateStreak } from './gamification.js'
import { toggleGamification } from './settings.js'
import { generatePDF, generateCSV } from './reports.js'
import { scanBarcode, forceCleanupScanner, scanNutritionLabel } from './scanner.js'
import { App } from '@capacitor/app'
import { checkForAppUpdate } from './update.js'

/* ── Wire up all event listeners ── */
function initEvents() {
  initRipples()
  initSheetGestures()

  // Navbar
  document.getElementById('nav-home').addEventListener('click', () => goTo('home'))
  document.getElementById('nav-add').addEventListener('click', openAddSheet)
  document.getElementById('nav-cfg').addEventListener('click', openSettings)
  document.getElementById('nav-logros')?.addEventListener('click', openLogros)
  document.getElementById('btn-logros-back')?.addEventListener('click', () => { closeLogros(); goTo('home') })

  // Home → Stats
  document.querySelector('#view-home .btn-accent')?.addEventListener('click', openStats)
  document.getElementById('btn-stats-trigger')?.addEventListener('click', openStats)

  // Stats overlay back button
  document.getElementById('btn-stats-back')?.addEventListener('click', closeStats)
  document.getElementById('btn-day-detail-back')?.addEventListener('click', closeDayDetail)

  // Settings overlay back button
  document.getElementById('btn-settings-back')?.addEventListener('click', settingsBack)

  // Settings main list → detail sections
  document.querySelectorAll('.settings-row').forEach(row => {
    row.addEventListener('click', () => {
      const section = row.dataset.section
      const title = row.dataset.title
      if (section) openSettingsSection(section, title)
    })
  })

  // Range pills
  document.querySelectorAll('.range-pill').forEach(el =>
    el.addEventListener('click', e => setRange(e.target.dataset.range))
  )

  // Add sheet
  document.getElementById('sheet-backdrop').addEventListener('click', () => { closeAddSheet(); closeCameraMenu() })
  document.getElementById('btn-close-add')?.addEventListener('click', () => { closeAddSheet(); closeCameraMenu() })
  document.getElementById('btn-save-entry')?.addEventListener('click', saveEntry)

  // Camera Menu
  document.getElementById('btn-open-camera-menu')?.addEventListener('click', openCameraMenu)
  document.getElementById('btn-menu-scan-barcode')?.addEventListener('click', async () => {
    closeCameraMenu()
    await scanBarcode()
  })
  document.getElementById('btn-menu-scan-ai')?.addEventListener('click', async () => {
    closeCameraMenu()
    await scanNutritionLabel()
  })

  // Settings actions
  document.getElementById('btn-save-max-sugar')?.addEventListener('click', saveCfgProfile)

  // Activity selector wiring
  document.querySelectorAll('.activity-option[data-activity]').forEach(function(opt) {
    opt.addEventListener('click', function() {
      document.querySelectorAll('.activity-option[data-activity]').forEach(function(o) {
        o.classList.remove('active')
        var c = o.querySelector('.activity-check'); if (c) c.style.opacity = '0'
      })
      opt.classList.add('active')
      var chk = opt.querySelector('.activity-check'); if (chk) chk.style.opacity = '1'
      // Update hidden input value (settings.js reads it)
      var actInput = document.getElementById('cfg-activity')
      if (!actInput) {
        actInput = document.createElement('input')
        actInput.type = 'hidden'; actInput.id = 'cfg-activity'
        document.body.appendChild(actInput)
      }
      actInput.value = opt.dataset.activity
      updateAutoLimit()
    })
  })

  // Real-time auto limit calculation
  window.updateAutoLimit = function() {
    var w = parseFloat(document.getElementById('cfg-weight')?.value)
    var h = parseFloat(document.getElementById('cfg-height')?.value)
    var a = parseFloat(document.getElementById('cfg-age')?.value)
    var sex = document.getElementById('cfg-sex')?.value || 'female'
    var act = document.querySelector('.activity-option.active[data-activity]')?.dataset.activity || 'moderate'
    var chip = document.getElementById('cfg-auto-limit')
    if (!chip) return
    if (!isNaN(w) && !isNaN(h) && !isNaN(a)) {
      var bmr = sex === 'male' ? 10*w + 6.25*h - 5*a + 5 : 10*w + 6.25*h - 5*a - 161
      var factors = {sedentary:1.2, light:1.375, moderate:1.55, active:1.725, very_active:1.9}
      var tdee = bmr * (factors[act] || 1.55)
      var sugar = Math.round(Math.min(60, Math.max(15, (tdee * 0.07) / 4)))
      chip.textContent = sugar + 'gr/d\u00eda'
    } else {
      chip.textContent = '\u2014'
    }
  }
  window.updateAutoLimitChip = function(cfg) {
    if (!cfg) return
    // set activity selector from cfg
    var act = cfg.activity || 'moderate'
    document.querySelectorAll('.activity-option[data-activity]').forEach(function(o) {
      o.classList.toggle('active', o.dataset.activity === act)
      var c = o.querySelector('.activity-check'); if (c) c.style.opacity = o.dataset.activity===act?'1':'0'
    })
    // calc limit
    var w=cfg.weight||70, h=cfg.height||170, a=cfg.age||25, sex=cfg.sex||'female'
    var bmr = sex==='male'?10*w+6.25*h-5*a+5:10*w+6.25*h-5*a-161
    var factors={sedentary:1.2,light:1.375,moderate:1.55,active:1.725,very_active:1.9}
    var tdee=bmr*(factors[act]||1.55)
    var sugar=Math.round(Math.min(60,Math.max(15,(tdee*.07)/4)))
    var chip=document.getElementById('cfg-auto-limit'); if(chip) chip.textContent=sugar+'gr/d\u00eda'
  }

  // Wire real-time updates on weight/height/age/sex change
  ;['cfg-weight','cfg-height','cfg-age'].forEach(function(id) {
    document.getElementById(id)?.addEventListener('input', window.updateAutoLimit)
  })
  document.getElementById('cfg-sex')?.addEventListener('change', window.updateAutoLimit)
  document.getElementById('btn-save-font')?.addEventListener('click', saveCfgFont)
  document.getElementById('btn-save-gemini-key')?.addEventListener('click', saveCfgGeminiKey)
  document.getElementById('notif-toggle')?.addEventListener('click', toggleNotif)
  document.getElementById('btn-save-notif-times')?.addEventListener('click', saveCfgNotifTimes)
  document.getElementById('auto-update-toggle')?.addEventListener('click', toggleAutoUpdate)
  document.getElementById('notif-update-toggle')?.addEventListener('click', toggleNotifUpdate)

  const gamifToggle = document.getElementById('gamification-toggle')
  if (gamifToggle) {
    getConfig().then(cfg => { if (cfg.gamification !== false) gamifToggle.classList.add('on') })
    gamifToggle.addEventListener('click', async () => {
      await toggleGamification(); const cfg = await getConfig()
      gamifToggle.classList.toggle('on', cfg.gamification !== false)
    })
  }
  const achNotifToggle = document.getElementById('achievements-notif-toggle')
  if (achNotifToggle) {
    getConfig().then(cfg => { achNotifToggle.classList.toggle('on', cfg.achievementsNotif !== false) })
    achNotifToggle.addEventListener('click', async () => {
      const cfg = await getConfig(); cfg.achievementsNotif = cfg.achievementsNotif === false ? true : false
      await saveConfig(cfg); achNotifToggle.classList.toggle('on', cfg.achievementsNotif !== false)
      showToast(cfg.achievementsNotif !== false ? (window.t ? window.t('settings.notifications_on', 'Notificaciones activadas.') : 'Notificaciones activadas.') : (window.t ? window.t('settings.notifications_off', 'Notificaciones desactivadas.') : 'Notificaciones desactivadas.'), false, 'info')
    })
  }
  const badStreaksToggle = document.getElementById('bad-streaks-toggle')
  if (badStreaksToggle) {
    getConfig().then(cfg => { badStreaksToggle.classList.toggle('on', cfg.showBadStreaks !== false) })
    badStreaksToggle.addEventListener('click', async () => {
      const cfg = await getConfig(); cfg.showBadStreaks = cfg.showBadStreaks === false ? true : false
      await saveConfig(cfg); badStreaksToggle.classList.toggle('on', cfg.showBadStreaks !== false)
      showToast(cfg.showBadStreaks !== false ? (window.t ? window.t('settings.bad_streaks_on', 'Rachas difíciles visibles.') : 'Rachas difíciles visibles.') : (window.t ? window.t('settings.bad_streaks_off', 'Rachas difíciles ocultas.') : 'Rachas difíciles ocultas.'), false, 'info')
    })
  }
  document.getElementById('btn-reset-logros')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-reset-logros')
    if (btn.dataset.confirm !== 'true') {
      btn.dataset.confirm = 'true'; btn.textContent = (window.t ? window.t('settings.confirm_reset', '¿Seguro?') : '¿Seguro?')
      setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = (window.t ? window.t('settings.reset', 'Resetear') : 'Resetear') }, 3000); return
    }
    btn.dataset.confirm = ''; const cfg = await getConfig()
    cfg.streak = 0; cfg.bestStreak = 0; cfg.badStreak = 0; cfg.worstStreak = 0
    cfg.lastStreakDate = null; cfg.achievements = []; cfg.achievementsShown = []
    await saveConfig(cfg); btn.textContent = (window.t ? window.t('settings.reset', 'Resetear') : 'Resetear')
    showToast(window.t ? window.t('settings.achievements_reset', 'Logros y rachas reseteados.') : 'Logros y rachas reseteados.', false, 'warning')
  })
  ;['auto','es','en','ca','gl','eu'].forEach(function(lang) {
    var el = document.getElementById('lang-opt-' + lang); if (!el) return
    el.addEventListener('click', async function(e) {
      e.stopPropagation()
      const cfg = await getConfig(); cfg.lang = lang; await saveConfig(cfg)
      ;['auto','es','en','ca','gl','eu'].forEach(function(l) {
        var opt = document.getElementById('lang-opt-' + l);
        if (opt) {
          opt.classList.toggle('active', l===lang)
          if (l===lang) {
            const label = document.getElementById('lang-dropdown-label')
            if (label) label.innerHTML = opt.querySelector('.fdi-name').innerHTML
          }
        }
      })
      document.getElementById('lang-dropdown')?.classList.remove('open')
      if (typeof initI18n === 'function') { await initI18n(); if (typeof applyTranslationsToDOM === 'function') applyTranslationsToDOM() }
      await renderHome()
      showToast(window.t ? window.t('settings.language_updated', 'Idioma actualizado ✓') : 'Idioma actualizado ✓', false, 'success')
    })
  })

  const langTrigger = document.getElementById('lang-dropdown-trigger')
  const langDropdown = document.getElementById('lang-dropdown')
  if (langTrigger && langDropdown) {
    langTrigger.addEventListener('click', (e) => {
      e.stopPropagation()
      const fontDd = document.getElementById('font-dropdown')
      if (fontDd && fontDd.classList.contains('open')) fontDd.classList.remove('open')
      langDropdown.classList.toggle('open')
    })
    document.addEventListener('click', (e) => {
      if (!langDropdown.contains(e.target)) langDropdown.classList.remove('open')
    })
  }

  const fontTrigger = document.getElementById('font-dropdown-trigger')
  const fontDropdown = document.getElementById('font-dropdown')
  if (fontTrigger && fontDropdown) {
    fontTrigger.addEventListener('click', (e) => {
      e.stopPropagation()
      const langDd = document.getElementById('lang-dropdown')
      if (langDd && langDd.classList.contains('open')) langDd.classList.remove('open')
      fontDropdown.classList.toggle('open')
    })
    document.addEventListener('click', (e) => {
      if (!fontDropdown.contains(e.target)) fontDropdown.classList.remove('open')
    })
  }
  document.getElementById('settings-open-logros')?.addEventListener('click', openLogros)
  window.openEditSheet = openEditSheet

  const meriendaToggle = document.getElementById('cfg-notif-merienda-toggle')
  meriendaToggle?.addEventListener('change', (e) => {
    const startInput = document.getElementById('cfg-notif-merienda-start')
    const endInput = document.getElementById('cfg-notif-merienda-end')
    if (e.target.checked) {
      startInput.style.opacity = '1'
      startInput.style.pointerEvents = 'all'
      endInput.style.opacity = '1'
      endInput.style.pointerEvents = 'all'
    } else {
      startInput.style.opacity = '0.5'
      startInput.style.pointerEvents = 'none'
      endInput.style.opacity = '0.5'
      endInput.style.pointerEvents = 'none'
    }
  })

  document.getElementById('seg-dark')?.addEventListener('click', () => setTheme('dark'))
  document.getElementById('seg-light')?.addEventListener('click', () => setTheme('light'))
  document.getElementById('seg-system')?.addEventListener('click', () => setTheme('system'))

  // Data export & clear
  document.getElementById('btn-export-data')?.addEventListener('click', exportDataAsZip)
  document.getElementById('btn-clear-all')?.addEventListener('click', () => handleClearAll(async () => {
    closeSettings()
    goTo('home')
    await renderHome()
  }))

  // Update button in settings
  document.getElementById('btn-check-update')?.addEventListener('click', async () => {
    showToast(window.t ? window.t('settings.checking_updates', 'Buscando actualizaciones...') : 'Buscando actualizaciones...')
    const updateFound = await checkForAppUpdate(true)
    if (!updateFound) {
      showToast(window.t ? window.t('settings.up_to_date', 'Ya tienes la última versión.') : 'Ya tienes la última versión.')
    }
  })

  // Capacitor Back Button (Hardware/Gesture navigation on Android)
  App.addListener('backButton', () => {
    if (closeExpandedCard()) return

    if (document.getElementById('sheet-camera-menu')?.classList.contains('open')) return closeCameraMenu()
    if (document.getElementById('sheet-add')?.classList.contains('open')) return closeAddSheet()
    if (document.getElementById('overlay-day-detail')?.classList.contains('open')) return closeDayDetail()
    if (document.getElementById('overlay-settings')?.classList.contains('open')) {
      if (settingsBack()) return
      return goTo('home')
    }
    if (document.getElementById('overlay-stats')?.classList.contains('open')) return closeStats()
    if (document.getElementById('overlay-logros')?.classList.contains('open')) return closeLogros()
    if (!document.getElementById('view-home')?.classList.contains('active')) return goTo('home')

    App.exitApp()
  })

  // Hardware/Animation Pause on Background
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      // App went to background (minimize)
      forceCleanupScanner()
    }
  })

  // Sort buttons
  document.getElementById('btn-sort-desc')?.addEventListener('click', () => setSortOrder('desc'))
  document.getElementById('btn-sort-asc')?.addEventListener('click', () => setSortOrder('asc'))

  // PDF/CSV reports
  document.getElementById('btn-report-pdf')?.addEventListener('click', () => generatePDF('30'))
  document.getElementById('btn-report-csv')?.addEventListener('click', generateCSV)

  // System theme change
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', async () => {
    const cfg = await getConfig()
    if (cfg.theme === 'system') applyTheme('system')
  })

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // 1) Try to handle settings (detail -> lista -> cerrar)
      if (settingsBack()) return
      // 2) Then overlays/sheets
      closeCameraMenu()
      closeAddSheet()
      closeStats()
      closeSettings()
    }
  })
}

/* ── Bootstrap ── */
async function bootstrap() {
  initEvents()
  await seed()
  if (typeof initI18n === 'function') await initI18n()
  const cfg = await getConfig()
  applyTheme(cfg.theme)
  if (cfg.font) applyFont(cfg.font)
  await updateStreak()
  await renderHome()
  checkForAppUpdate()
  const activeLang = cfg.lang || 'auto'
  ;['auto','es','en','ca','gl','eu'].forEach(function(l) {
    var opt = document.getElementById('lang-opt-' + l);
    if (opt) {
      opt.classList.toggle('active', l===activeLang)
      if (l===activeLang) {
        const label = document.getElementById('lang-dropdown-label')
        if (label) label.innerHTML = opt.querySelector('.fdi-name').innerHTML
      }
    }
  })
}

bootstrap()
