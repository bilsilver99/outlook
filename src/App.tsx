import { useState } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { useGoogleLogin } from '@react-oauth/google'
import { loginScopes } from './authConfig'
import { clearClientIds } from './setup'
import { MailboxPanel } from './components/MailboxPanel'
import { GmailPanel, type GoogleAccount } from './components/GmailPanel'

interface Props {
  hasMicrosoft: boolean
  hasGoogle: boolean
}

function AppContent({ hasMicrosoft, hasGoogle }: Props) {
  const { accounts: msAccounts, instance } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([])

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        }).then((r) => r.json()) as { email: string; name: string; picture?: string }

        setGoogleAccounts((prev) => {
          const exists = prev.some((a) => a.email === info.email)
          if (exists) {
            // Refresh token for existing account
            return prev.map((a) =>
              a.email === info.email ? { ...a, accessToken: tokenResponse.access_token } : a,
            )
          }
          return [...prev, { ...info, accessToken: tokenResponse.access_token }]
        })
      } catch {
        console.error('Failed to fetch Google user info')
      }
    },
    scope: 'https://www.googleapis.com/auth/gmail.modify email profile',
  })

  const handleMicrosoftLogin = () => {
    instance.loginPopup({ scopes: loginScopes, prompt: 'select_account' })
  }

  const handleMicrosoftSignOut = (homeAccountId: string) => {
    const account = msAccounts.find((a) => a.homeAccountId === homeAccountId)
    if (account) instance.logoutPopup({ account, mainWindowRedirectUri: window.location.origin })
  }

  const handleGoogleSignOut = (email: string) => {
    setGoogleAccounts((prev) => prev.filter((a) => a.email !== email))
  }

  const hasAnyAccount = isAuthenticated || googleAccounts.length > 0

  if (!hasAnyAccount) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center">
          <span className="text-4xl block mb-4">✉</span>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Outlook Purge</h1>
          <p className="text-gray-500 text-sm mb-8">
            Sign in to browse and archive emails by sender.
          </p>
          <div className="space-y-3">
            {hasGoogle && (
              <button
                onClick={() => googleLogin()}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-3 text-gray-700 font-semibold hover:bg-gray-50 transition-colors shadow-sm"
              >
                <span className="text-lg font-bold text-red-500">G</span>
                Sign in with Google
              </button>
            )}
            {hasMicrosoft && (
              <button
                onClick={handleMicrosoftLogin}
                className="w-full flex items-center justify-center gap-3 rounded-xl bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
              >
                Sign in with Microsoft
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">✉</span>
            <h1 className="text-lg font-bold text-gray-900">Outlook Purge</h1>
          </div>
          <div className="flex items-center gap-2">
            {hasGoogle && (
              <button
                onClick={() => googleLogin()}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                + Gmail
              </button>
            )}
            {hasMicrosoft && (
              <button
                onClick={handleMicrosoftLogin}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              >
                + Microsoft
              </button>
            )}
            <button
              onClick={() => { clearClientIds(); window.location.reload() }}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Reset app registration"
            >
              Disconnect
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {googleAccounts.map((account) => (
          <GmailPanel
            key={account.email}
            account={account}
            onSignOut={() => handleGoogleSignOut(account.email)}
          />
        ))}
        {msAccounts.map((account) => (
          <MailboxPanel
            key={account.homeAccountId}
            account={account}
            onSignOut={() => handleMicrosoftSignOut(account.homeAccountId)}
          />
        ))}
      </main>
    </div>
  )
}

export default function App({ hasMicrosoft, hasGoogle }: Props) {
  return <AppContent hasMicrosoft={hasMicrosoft} hasGoogle={hasGoogle} />
}
