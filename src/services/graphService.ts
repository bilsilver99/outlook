import {
  IPublicClientApplication,
  AccountInfo,
  InteractionRequiredAuthError,
} from '@azure/msal-browser'
import { loginScopes } from '../authConfig'
import type { MailMessage } from '../types'

interface RawMessage {
  id: string
  subject: string
  receivedDateTime: string
  bodyPreview: string
  from: {
    emailAddress: {
      name: string
      address: string
    }
  }
}

async function acquireToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  try {
    const result = await instance.acquireTokenSilent({ scopes: loginScopes, account })
    return result.accessToken
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const result = await instance.acquireTokenPopup({ scopes: loginScopes, account })
      return result.accessToken
    }
    throw err
  }
}

async function graphGet(url: string, token: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Graph ${res.status}: ${body}`)
  }
  return res
}

async function graphPost(url: string, token: string, body: unknown): Promise<Response> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Graph ${res.status}: ${text}`)
  }
  return res
}

export async function fetchInboxMessages(
  instance: IPublicClientApplication,
  account: AccountInfo,
  onProgress: (count: number) => void,
  limit = 500,
): Promise<MailMessage[]> {
  const token = await acquireToken(instance, account)
  const messages: MailMessage[] = []

  let url: string | null =
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages' +
    '?$select=id,subject,from,receivedDateTime,bodyPreview' +
    '&$top=100' +
    '&$orderby=receivedDateTime desc'

  while (url && messages.length < limit) {
    const res = await graphGet(url, token)
    const data: { value: RawMessage[]; '@odata.nextLink'?: string } = await res.json()
    for (const raw of data.value) {
      messages.push({
        id: raw.id,
        subject: raw.subject || '(No subject)',
        date: raw.receivedDateTime,
        snippet: raw.bodyPreview ?? '',
        fromName: raw.from?.emailAddress?.name ?? raw.from?.emailAddress?.address ?? 'Unknown',
        fromEmail: (raw.from?.emailAddress?.address ?? 'unknown').toLowerCase(),
      })
    }
    onProgress(messages.length)
    url = data['@odata.nextLink'] ?? null
  }

  return messages
}

export async function archiveMessages(
  instance: IPublicClientApplication,
  account: AccountInfo,
  messageIds: string[],
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const token = await acquireToken(instance, account)

  const folderRes = await graphGet(
    'https://graph.microsoft.com/v1.0/me/mailFolders/archive',
    token,
  )
  const { id: destinationId } = await folderRes.json()

  const BATCH = 20
  let done = 0

  for (let i = 0; i < messageIds.length; i += BATCH) {
    const chunk = messageIds.slice(i, i + BATCH)
    await graphPost('https://graph.microsoft.com/v1.0/$batch', token, {
      requests: chunk.map((id, idx) => ({
        id: String(idx),
        method: 'POST',
        url: `/me/messages/${id}/move`,
        headers: { 'Content-Type': 'application/json' },
        body: { destinationId },
      })),
    })
    done += chunk.length
    onProgress(done, messageIds.length)
  }
}
