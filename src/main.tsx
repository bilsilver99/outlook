import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { buildMsalConfig } from './authConfig'
import { getClientIds } from './setup'
import { SetupWizard } from './components/SetupWizard'
import App from './App'
import './index.css'

const root = createRoot(document.getElementById('root')!)
const { microsoft: msClientId, google: googleClientId } = getClientIds()

if (!msClientId && !googleClientId) {
  root.render(
    <StrictMode>
      <SetupWizard />
    </StrictMode>,
  )
} else {
  const renderApp = (msalInstance?: PublicClientApplication) => {
    const app = (
      <App hasMicrosoft={!!msClientId} hasGoogle={!!googleClientId} />
    )

    const withMsal = msalInstance ? (
      <MsalProvider instance={msalInstance}>{app}</MsalProvider>
    ) : app

    const withGoogle = googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>{withMsal}</GoogleOAuthProvider>
    ) : withMsal

    root.render(<StrictMode>{withGoogle}</StrictMode>)
  }

  if (msClientId) {
    const msalInstance = new PublicClientApplication(buildMsalConfig(msClientId))
    msalInstance.initialize().then(() => renderApp(msalInstance))
  } else {
    renderApp()
  }
}
