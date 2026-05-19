const MS_KEY = 'outlook_purge_ms_client_id'
const GOOGLE_KEY = 'outlook_purge_google_client_id'

export interface ClientIds {
  microsoft: string | null
  google: string | null
}

export function getClientIds(): ClientIds {
  return {
    microsoft: import.meta.env.VITE_MICROSOFT_CLIENT_ID || localStorage.getItem(MS_KEY) || null,
    google: import.meta.env.VITE_GOOGLE_CLIENT_ID || localStorage.getItem(GOOGLE_KEY) || null,
  }
}

export function saveClientIds(microsoft: string | null, google: string | null) {
  if (microsoft) localStorage.setItem(MS_KEY, microsoft.trim())
  else localStorage.removeItem(MS_KEY)
  if (google) localStorage.setItem(GOOGLE_KEY, google.trim())
  else localStorage.removeItem(GOOGLE_KEY)
}

export function clearClientIds() {
  localStorage.removeItem(MS_KEY)
  localStorage.removeItem(GOOGLE_KEY)
}
