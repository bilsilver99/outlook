# Commercial Migration Guide

When you're ready to turn this into a sellable product, follow these steps.

## What changes

Right now the app asks each user to register their own Azure AD app (the setup wizard). For a commercial product, you register **one** app yourself and every client just clicks "Sign in with Microsoft."

---

## Step 1 — Get your own Azure tenant

Sign up for a free Azure account at https://portal.azure.com using your Microsoft account. This creates an Azure AD / Entra ID tenant under your control.

---

## Step 2 — Register a single multi-tenant app

In the Azure portal → **App registrations** → **New registration**:

- **Name:** Your product name (e.g. "Outlook Purge")
- **Supported account types:** `Accounts in any organizational directory and personal Microsoft accounts`
- **Redirect URI:** Single-page application → your production URL (e.g. `https://yourapp.com`)

After registering, copy the **Application (client) ID**.

### Add API permissions

**API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**:
- `Mail.ReadWrite`
- `User.Read`

---

## Step 3 — Remove the setup wizard

Delete `src/components/SetupWizard.tsx` and `src/setup.ts`.

Update `src/authConfig.ts` — replace `buildMsalConfig(clientId)` with a static config:

```ts
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
  },
  ...
}
```

Update `src/main.tsx` to initialize MSAL directly without the wizard check:

```ts
const msalInstance = new PublicClientApplication(msalConfig)
msalInstance.initialize().then(() => { ... })
```

Your client ID goes in a `.env` file on your build/hosting server — clients never see or configure it.

---

## Step 4 — Publisher verification

Unverified apps show Microsoft's "unverified publisher" warning on the consent screen, which will scare off enterprise clients.

To remove it:
1. Enroll in the **Microsoft Partner Network** (MPN) — free at https://partner.microsoft.com
2. In the Azure portal → your app → **Branding & properties** → **Verify publisher domain**
3. Add and verify your domain (e.g. `silvermoontech.com`)

---

## Step 5 — Privacy policy & terms of service

Microsoft requires these for any app requesting mail permissions. Add the URLs in the Azure portal → your app → **Branding & properties**:
- Privacy policy URL
- Terms of service URL

At minimum your privacy policy must state that you do not store or transmit email content to any server (the app only reads and archives within the user's own mailbox via Microsoft's API).

---

## Step 6 — Admin consent for enterprise clients

Enterprise clients (work/school accounts) may have their IT admin's consent required before employees can use the app. Two options:

**Option A — Per-user consent (default)**
Users see the consent screen on first login. Works automatically unless the org has disabled user consent.

**Option B — Admin pre-consent**
Send the IT admin this URL (replace `YOUR_CLIENT_ID`):

```
https://login.microsoftonline.com/common/adminconsent?client_id=YOUR_CLIENT_ID
```

They sign in as a Global Admin and grant consent org-wide. Employees then see no consent screen at all.

---

## Step 7 — Hosting

Deploy the built app (`npm run build` → `dist/`) to any static host:

| Option | Notes |
|---|---|
| **Azure Static Web Apps** | Free tier, integrates with GitHub Actions, custom domain easy |
| **Vercel** | Free tier, simplest deployment |
| **Netlify** | Free tier, similar to Vercel |

Set `VITE_CLIENT_ID` as an environment variable in your hosting provider's settings (not committed to git).

---

## Summary checklist

- [ ] Azure tenant created
- [ ] Multi-tenant app registered with `Mail.ReadWrite` and `User.Read`
- [ ] Setup wizard removed, client ID baked into build
- [ ] Production URL added as redirect URI in Azure
- [ ] Publisher domain verified (MPN enrollment)
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Hosted and deployed
- [ ] Admin consent URL tested with a work account
