import { useState } from 'react'
import { saveClientIds } from '../setup'

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GOOGLE_CLIENT_RE = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i

export function SetupWizard() {
  const [msId, setMsId] = useState('')
  const [googleId, setGoogleId] = useState('')
  const [errors, setErrors] = useState<{ ms?: string; google?: string; general?: string }>({})

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const ms = msId.trim()
    const google = googleId.trim()
    const errs: typeof errors = {}

    if (!ms && !google) {
      errs.general = 'Enter at least one client ID to continue.'
    }
    if (ms && !GUID_RE.test(ms)) {
      errs.ms = 'Should be a GUID like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    }
    if (google && !GOOGLE_CLIENT_RE.test(google)) {
      errs.google = 'Should end in .apps.googleusercontent.com'
    }

    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }

    saveClientIds(ms || null, google || null)
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">✉</span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Outlook Purge</h1>
            <p className="text-sm text-gray-500">Connect your email accounts</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Microsoft */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🪟</span>
              <span className="font-semibold text-blue-900">Microsoft / Outlook</span>
              <span className="text-xs text-blue-400 ml-auto">optional</span>
            </div>
            <p className="text-xs text-blue-700">
              Register an app at{' '}
              <a
                href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                portal.azure.com
              </a>{' '}
              → App registrations → New registration. Set account type to{' '}
              <strong>Any Entra ID Tenant + Personal</strong>, redirect URI{' '}
              <strong>Single-page application → {window.location.origin}</strong>. Add{' '}
              <strong>Mail.ReadWrite</strong> permission. Copy the Application (client) ID.
            </p>
            <input
              type="text"
              value={msId}
              onChange={(e) => { setMsId(e.target.value); setErrors((p) => ({ ...p, ms: undefined })) }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              spellCheck={false}
            />
            {errors.ms && <p className="text-xs text-red-600">{errors.ms}</p>}
          </div>

          {/* Google */}
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">G</span>
              <span className="font-semibold text-red-900">Google / Gmail</span>
              <span className="text-xs text-red-400 ml-auto">optional</span>
            </div>
            <p className="text-xs text-red-700">
              In{' '}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Google Cloud Console
              </a>{' '}
              → Credentials → OAuth 2.0 Client ID (Web application). Add{' '}
              <strong>{window.location.origin}</strong> as an authorized JavaScript origin.
              Enable the <strong>Gmail API</strong>. Copy the Client ID.
            </p>
            <input
              type="text"
              value={googleId}
              onChange={(e) => { setGoogleId(e.target.value); setErrors((p) => ({ ...p, google: undefined })) }}
              placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
              spellCheck={false}
            />
            {errors.google && <p className="text-xs text-red-600">{errors.google}</p>}
          </div>

          {errors.general && (
            <p className="text-sm text-red-600 text-center">{errors.general}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-gray-900 px-6 py-3 text-white font-semibold hover:bg-gray-700 transition-colors"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  )
}
