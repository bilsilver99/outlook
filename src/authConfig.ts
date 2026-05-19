import { Configuration, LogLevel } from '@azure/msal-browser'

export function buildMsalConfig(clientId: string): Configuration {
  return {
    auth: {
      clientId,
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (_level, message, containsPii) => {
          if (!containsPii && _level === LogLevel.Error) console.error(message)
        },
        logLevel: LogLevel.Error,
      },
    },
  }
}

export const loginScopes = ['Mail.ReadWrite', 'User.Read']
