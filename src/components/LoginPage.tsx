import { useMsal } from '@azure/msal-react'
import { loginScopes } from '../authConfig'

export function LoginPage() {
  const { instance } = useMsal()

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white text-3xl mb-5">
          ✉
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Outlook Purge</h1>
        <p className="text-gray-500 text-sm mb-8">
          Sign in to browse and archive emails by sender across your accounts.
        </p>
        <button
          onClick={() => instance.loginPopup({ scopes: loginScopes })}
          className="w-full flex items-center justify-center gap-3 rounded-xl bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  )
}
