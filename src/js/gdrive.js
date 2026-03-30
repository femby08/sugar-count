/**
 * gdrive.js — Google Drive backup integration
 *
 * Uses Google Identity Services (GIS) for OAuth2 and the Drive REST API v3.
 * Stores backups in a "SugarCounter" folder on the user's Drive.
 *
 * For now, this works in the browser via GIS. For native Android,
 * a Capacitor plugin would be needed for seamless Google Sign-In.
 */
import { getLogs, getConfig, saveConfig } from './db.js'
import { showToast } from './ui.js'
import JSZip from 'jszip'

// Google OAuth client ID — REPLACE with your own from Google Cloud Console
const CLIENT_ID = '' // Will be configured by the user
const SCOPES = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME = 'SugarCounter'

let tokenClient = null
let accessToken = null

/**
 * Initialize the Google Identity Services token client
 */
export function initGoogleAuth() {
  if (!CLIENT_ID) {
    console.warn('Google Drive: CLIENT_ID not configured.')
    return false
  }

  if (typeof google === 'undefined' || !google.accounts) {
    console.warn('Google Identity Services not loaded.')
    return false
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      accessToken = tokenResponse.access_token
    },
  })
  return true
}

/**
 * Sign in with Google
 */
export async function signInGoogle() {
  if (!CLIENT_ID) {
    showToast('⚠ Configura tu Google Client ID primero.', true)
    return false
  }

  return new Promise((resolve) => {
    if (!tokenClient) {
      if (!initGoogleAuth()) {
        showToast('No se pudo inicializar Google Auth.', true)
        resolve(false)
        return
      }
    }

    tokenClient.callback = (tokenResponse) => {
      if (tokenResponse.error) {
        showToast('Error al autenticar con Google.', true)
        resolve(false)
        return
      }
      accessToken = tokenResponse.access_token
      showToast('✓ Conectado a Google Drive.')
      resolve(true)
    }

    tokenClient.requestAccessToken()
  })
}

/**
 * Sign out
 */
export function signOutGoogle() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken)
    accessToken = null
    showToast('Desconectado de Google Drive.')
  }
}

/**
 * Check if signed in
 */
export function isGoogleSignedIn() {
  return !!accessToken
}

/**
 * Find or create the SugarCounter folder on Drive
 */
async function getOrCreateFolder() {
  // Search for existing folder
  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const searchData = await searchResp.json()

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id
  }

  // Create folder
  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  const folder = await createResp.json()
  return folder.id
}

/**
 * Upload a backup to Google Drive
 * @param {boolean} overwrite - If true, replaces existing backup with same date
 */
export async function uploadBackup(overwrite = false) {
  if (!accessToken) {
    const ok = await signInGoogle()
    if (!ok) return
  }

  try {
    showToast('Subiendo backup a Google Drive...')

    const logs = await getLogs()
    const config = await getConfig()

    const zip = new JSZip()
    zip.file('logs.json', JSON.stringify(logs, null, 2))
    zip.file('config.json', JSON.stringify(config, null, 2))
    const blob = await zip.generateAsync({ type: 'blob' })

    const folderId = await getOrCreateFolder()
    const fileName = `backup-${new Date().toISOString().slice(0, 10)}.zip`

    // Check for existing file with same name if overwriting
    if (overwrite) {
      const existingResp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const existingData = await existingResp.json()

      if (existingData.files && existingData.files.length > 0) {
        // Delete existing file
        await fetch(`https://www.googleapis.com/drive/v3/files/${existingData.files[0].id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      }
    }

    // Upload using multipart
    const metadata = JSON.stringify({
      name: overwrite ? fileName : `backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`,
      parents: [folderId],
    })

    const form = new FormData()
    form.append('metadata', new Blob([metadata], { type: 'application/json' }))
    form.append('file', blob)

    const uploadResp = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    )

    if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`)

    // Save last backup timestamp
    const cfg = await getConfig()
    cfg.gdriveLastBackup = new Date().toISOString()
    await saveConfig(cfg)

    showToast('✓ Backup subido a Google Drive.')
  } catch (err) {
    console.error('Google Drive upload failed:', err)
    showToast('Error al subir backup.', true)
  }
}

/**
 * List backups on Google Drive
 */
export async function listBackups() {
  if (!accessToken) {
    const ok = await signInGoogle()
    if (!ok) return []
  }

  try {
    const folderId = await getOrCreateFolder()
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&orderBy=createdTime desc&fields=files(id,name,createdTime,size)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await resp.json()
    return data.files || []
  } catch (err) {
    console.error('Failed to list backups:', err)
    return []
  }
}

/**
 * Download and restore a backup from Google Drive
 */
export async function downloadBackup(fileId) {
  if (!accessToken) return

  try {
    showToast('Descargando backup...')

    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const blob = await resp.blob()
    const zip = await JSZip.loadAsync(blob)

    const logsJson = await zip.file('logs.json')?.async('text')
    const configJson = await zip.file('config.json')?.async('text')

    if (logsJson && configJson) {
      return {
        logs: JSON.parse(logsJson),
        config: JSON.parse(configJson),
      }
    }

    showToast('Backup restaurado. Reinicia la app.', false)
  } catch (err) {
    console.error('Download failed:', err)
    showToast('Error al descargar backup.', true)
  }
  return null
}

/**
 * Placeholder for real Google Drive backup - used when CLIENT_ID is not set
 */
export async function handleGoogleDriveAction() {
  if (!CLIENT_ID) {
    showToast('Para activar Google Drive, necesitas configurar un Client ID de Google Cloud. Próximamente se habilitará con un solo clic.')
    return
  }
  await uploadBackup(false)
}
