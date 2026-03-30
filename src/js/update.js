/**
 * update.js — Version check with native notification + in-app banner fallback
 *
 * Lógica:
 * - Si la app está en PRIMER PLANO → banner animado dentro de la app
 * - Si la app está en SEGUNDO PLANO o se detecta update al volver → notificación nativa del sistema
 */

import { showToast } from './ui.js'
import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'

const GITHUB_OWNER = 'femby08'
const GITHUB_REPO  = 'sugar-count'
const GITHUB_LATEST_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

// eslint-disable-next-line no-undef
const LOCAL_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.2.1'

/* ── App state tracker ── */
let appIsActive = true
App.addListener('appStateChange', ({ isActive }) => {
  appIsActive = isActive
})

/* ── Version helpers ── */
export function getAppVersion() {
  return LOCAL_VERSION
}

function parseVersion(v) {
  return (v || '0.0.0').split('.').map((n) => Number.parseInt(n, 10) || 0)
}

function isRemoteNewer(remote, local) {
  const r = parseVersion(remote)
  const l = parseVersion(local)
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true
    if ((r[i] || 0) < (l[i] || 0)) return false
  }
  return false
}

/* ── Native notification ── */
async function sendNativeUpdateNotification(remoteVersion, downloadUrl) {
  try {
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      perm = await LocalNotifications.requestPermissions()
    }
    if (perm.display !== 'granted') return false

    // Canal específico para actualizaciones
    try {
      await LocalNotifications.createChannel({
        id:          'app_updates',
        name:        'Actualizaciones',
        description: 'Notificaciones de nuevas versiones de Sugar Counter',
        importance:  4,
        visibility:  1,
        vibration:   true,
        sound:       'default'
      })
    } catch { /* canal ya existe */ }

    await LocalNotifications.schedule({
      notifications: [{
        id:          200,
        channelId:   'app_updates',
        title:       '🔄 Sugar Counter ' + remoteVersion + ' disponible',
        body:        'Hay una nueva versión disponible. Toca para descargar.',
        smallIcon:   'ic_stat_icon_config_sample',
        iconColor:   '#8b8df2',
        extra:       { downloadUrl },
        actionTypeId: 'UPDATE_ACTION',
        schedule:    { at: new Date(Date.now() + 500) } // pequeño delay para que se muestre
      }]
    })

    return true
  } catch (err) {
    console.warn('Native notification failed:', err)
    return false
  }
}

/* ── In-app banner ── */
function showUpdateBanner(remoteVersion, downloadUrl) {
  if (document.getElementById('update-banner')) return

  const banner = document.createElement('div')
  banner.id = 'update-banner'
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%) translateY(-110%);
    z-index: 999;
    width: 100%;
    max-width: 390px;
    padding: 12px 16px 0;
    transition: transform .55s cubic-bezier(0.71, 0.40, 0.16, 0.99);
  `

  banner.innerHTML = `
    <div style="
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    ">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="
          width: 40px; height: 40px; border-radius: 12px;
          background: rgba(139,141,242,0.12);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        ">
          <svg width="20" height="20" fill="none" stroke="var(--accent-l)" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <p style="margin:0;font-size:14px;font-weight:700;color:var(--text);">Nueva versión disponible</p>
          <p style="margin:2px 0 0;font-size:11px;color:var(--text-dim);">
            Tienes la <strong style="color:var(--text)">${LOCAL_VERSION}</strong> →
            <strong style="color:var(--accent-l)">${remoteVersion}</strong>
          </p>
        </div>
        <button id="btn-update-dismiss" style="
          color:var(--text-dim);padding:4px;border-radius:50%;
          background:var(--bg);border:1px solid var(--border);
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
        ">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="btn-update-now" style="
          flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:600;
          background:var(--accent);color:#fff;border:none;cursor:pointer;
        ">
          Descargar ahora
        </button>
        <button id="btn-update-later" style="
          flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:600;
          border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;
        ">
          Más tarde
        </button>
      </div>
    </div>
  `

  document.body.appendChild(banner)

  // Animar entrada desde arriba
  requestAnimationFrame(() => requestAnimationFrame(() => {
    banner.style.transform = 'translateX(-50%) translateY(0)'
  }))

  // Auto-cerrar tras 8 segundos
  const autoClose = setTimeout(() => closeBanner(), 8000)

  function closeBanner() {
    clearTimeout(autoClose)
    banner.style.transform = 'translateX(-50%) translateY(-110%)'
    setTimeout(() => banner.remove(), 600)
  }

  document.getElementById('btn-update-dismiss')?.addEventListener('click', closeBanner)
  document.getElementById('btn-update-later')?.addEventListener('click', closeBanner)
  document.getElementById('btn-update-now')?.addEventListener('click', () => {
    if (downloadUrl) window.open(downloadUrl, '_blank')
    else showToast('🔄 Consulta la página del proyecto para descargar la actualización.', false, 'update')
    closeBanner()
  })
}

/* ── GitHub helpers ── */
export async function fetchLatestReleaseInfo() {
  const res = await fetch(GITHUB_LATEST_URL, { cache: 'no-store' })
  if (!res.ok) return null
  return await res.json()
}

export async function fetchReleasesList() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return []
  return await res.json()
}

/* ── Main check ── */
export async function checkForAppUpdate(manual = false) {
  try {
    const release = await fetchLatestReleaseInfo()
    if (!release) return false

    const remoteVersion = release.tag_name || release.name
    if (!remoteVersion) return false

    const isNewer = isRemoteNewer(remoteVersion, LOCAL_VERSION)
    if (!isNewer) return false

    if (!manual) {
      const { getConfig } = await import('./db.js')
      const cfg = await getConfig()
      if (!cfg.notifUpdate && !cfg.autoUpdate) return false
    }

    const asset = Array.isArray(release.assets) && release.assets.length > 0
      ? release.assets[0] : null
    const downloadUrl = asset?.browser_download_url || release.html_url || null

    if (appIsActive) {
      // App en primer plano → banner animado
      showUpdateBanner(remoteVersion, downloadUrl)
    } else {
      // App en segundo plano → notificación nativa del sistema
      const sent = await sendNativeUpdateNotification(remoteVersion, downloadUrl)
      // Si falla la notificación nativa, fallback al banner cuando vuelva al primer plano
      if (!sent) showUpdateBanner(remoteVersion, downloadUrl)
    }

    return true
  } catch (err) {
    console.warn('Update check failed', err)
    return false
  }
}
