/**
 * secureStorage.js — Secure storage for sensitive keys via Capacitor Preferences
 * Uses Android SharedPreferences (private mode) instead of IndexedDB
 */
import { Preferences } from '@capacitor/preferences'

const KEYS = {
  GEMINI: 'sc_gemini_api_key'
}

/* ── Gemini API Key ── */
export async function saveGeminiKey(key) {
  await Preferences.set({ key: KEYS.GEMINI, value: key })
}

export async function getGeminiKey() {
  try {
    const { value } = await Preferences.get({ key: KEYS.GEMINI })
    return value || ''
  } catch {
    return ''
  }
}

export async function removeGeminiKey() {
  await Preferences.remove({ key: KEYS.GEMINI })
}
