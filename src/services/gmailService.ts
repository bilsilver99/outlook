import type { MailMessage } from '../types'

interface RawGmailMessage {
  id: string
  snippet: string
  payload?: {
    headers: Array<{ name: string; value: string }>
  }
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^(?:"?([^"<>]*?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?$/)
  if (match) {
    const email = match[2].toLowerCase().trim()
    const name = (match[1] ?? '').trim() || email
    return { name, email }
  }
  return { name: raw, email: raw.toLowerCase() }
}

async function gmailGet(url: string, token: string, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if ((res.status === 429 || res.status === 403) && attempt < retries) {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      continue
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Gmail ${res.status}: ${text}`)
    }
    return res
  }
  throw new Error('Gmail rate limit: too many retries')
}

const BATCH_MIN_MS = 150 // keeps us well under 15,000 req/min

export async function fetchGmailInbox(
  accessToken: string,
  onProgress: (count: number) => void,
  limit = 100_000,
): Promise<MailMessage[]> {
  const messages: MailMessage[] = []
  let pageToken: string | undefined

  while (messages.length < limit) {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    url.searchParams.set('labelIds', 'INBOX')
    url.searchParams.set('maxResults', String(Math.min(100, limit - messages.length)))
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const listRes = await gmailGet(url.toString(), accessToken)
    const listData: { messages?: { id: string }[]; nextPageToken?: string } =
      await listRes.json()

    if (!listData.messages?.length) break

    const CONCURRENT = 10
    for (let i = 0; i < listData.messages.length; i += CONCURRENT) {
      const batchStart = Date.now()
      const batch = listData.messages.slice(i, i + CONCURRENT)
      const details = await Promise.all(
        batch.map(({ id }) =>
          gmailGet(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            accessToken,
          ).then((r) => r.json() as Promise<RawGmailMessage>),
        ),
      )
      const elapsed = Date.now() - batchStart
      if (elapsed < BATCH_MIN_MS) {
        await new Promise((r) => setTimeout(r, BATCH_MIN_MS - elapsed))
      }

      for (const raw of details) {
        const headers = raw.payload?.headers ?? []
        const { name, email } = parseFrom(getHeader(headers, 'From'))
        messages.push({
          id: raw.id,
          subject: getHeader(headers, 'Subject') || '(No subject)',
          date: getHeader(headers, 'Date'),
          snippet: raw.snippet ?? '',
          fromName: name,
          fromEmail: email,
        })
      }
      onProgress(messages.length)
    }

    pageToken = listData.nextPageToken
    if (!pageToken) break
  }

  return messages
}

export async function getHistoryId(accessToken: string): Promise<string> {
  const res = await gmailGet(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    accessToken,
  )
  const data: { historyId: string } = await res.json()
  return data.historyId
}

interface HistoryRecord {
  messagesAdded?: Array<{ message: { id: string; labelIds?: string[] } }>
  labelsRemoved?: Array<{ message: { id: string }; labelIds?: string[] }>
  labelsAdded?: Array<{ message: { id: string }; labelIds?: string[] }>
}

export async function syncInboxChanges(
  accessToken: string,
  startHistoryId: string,
  existing: MailMessage[],
  onProgress: (added: number) => void,
): Promise<{ messages: MailMessage[]; historyId: string }> {
  const res = await gmailGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/history` +
      `?startHistoryId=${startHistoryId}&labelId=INBOX` +
      `&historyTypes=messageAdded&historyTypes=labelsRemoved&historyTypes=labelsAdded`,
    accessToken,
  )
  const data: { history?: HistoryRecord[]; historyId: string } = await res.json()

  const addedIds = new Set<string>()
  const removedFromInbox = new Set<string>()

  for (const record of data.history ?? []) {
    for (const { message } of record.messagesAdded ?? []) {
      if (message.labelIds?.includes('INBOX')) addedIds.add(message.id)
    }
    for (const { message, labelIds } of record.labelsRemoved ?? []) {
      if (labelIds?.includes('INBOX')) removedFromInbox.add(message.id)
    }
    for (const { message, labelIds } of record.labelsAdded ?? []) {
      if (labelIds?.includes('INBOX')) addedIds.add(message.id)
    }
  }

  // Fetch details for genuinely new messages
  const existingIds = new Set(existing.map((m) => m.id))
  const toFetch = [...addedIds].filter((id) => !existingIds.has(id))
  const newMessages: MailMessage[] = []

  const CONCURRENT = 10
  for (let i = 0; i < toFetch.length; i += CONCURRENT) {
    const batch = toFetch.slice(i, i + CONCURRENT)
    const details = await Promise.all(
      batch.map((id) =>
        gmailGet(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata` +
            `&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          accessToken,
        ).then((r) => r.json() as Promise<RawGmailMessage>),
      ),
    )
    for (const raw of details) {
      const headers = raw.payload?.headers ?? []
      const { name, email } = parseFrom(getHeader(headers, 'From'))
      newMessages.push({
        id: raw.id,
        subject: getHeader(headers, 'Subject') || '(No subject)',
        date: getHeader(headers, 'Date'),
        snippet: raw.snippet ?? '',
        fromName: name,
        fromEmail: email,
      })
    }
    onProgress(newMessages.length)
  }

  const updated = [
    ...newMessages,
    ...existing.filter((m) => !removedFromInbox.has(m.id)),
  ]

  return { messages: updated, historyId: data.historyId }
}

export async function getLabelMessageCount(
  accessToken: string,
  labelId: string,
): Promise<number> {
  const res = await gmailGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`,
    accessToken,
  )
  const data: { messagesTotal?: number } = await res.json()
  return data.messagesTotal ?? 0
}

export async function purgeLabel(
  accessToken: string,
  labelId: string,
  mode: 'archive' | 'delete',
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  let total = await getLabelMessageCount(accessToken, labelId)
  let done = 0

  while (true) {
    const listRes = await gmailGet(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${labelId}&maxResults=500`,
      accessToken,
    )
    const listData: { messages?: { id: string }[] } = await listRes.json()
    if (!listData.messages?.length) break

    const ids = listData.messages.map((m) => m.id)

    if (mode === 'delete') {
      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchDelete',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        },
      )
      if (!res.ok && res.status !== 204) throw new Error(`batchDelete ${res.status}`)
    } else {
      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, removeLabelIds: [labelId] }),
        },
      )
      if (!res.ok && res.status !== 204) throw new Error(`batchModify ${res.status}`)
    }

    done += ids.length
    total = Math.max(total, done)
    onProgress(done, total)

    await new Promise((r) => setTimeout(r, BATCH_MIN_MS))
  }

  return done
}

export async function archiveGmailMessages(
  accessToken: string,
  messageIds: string[],
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const BATCH = 1000
  let done = 0

  for (let i = 0; i < messageIds.length; i += BATCH) {
    const chunk = messageIds.slice(i, i + BATCH)
    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: chunk, removeLabelIds: ['INBOX'] }),
      },
    )
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => '')
      throw new Error(`Gmail batchModify ${res.status}: ${text}`)
    }
    done += chunk.length
    onProgress(done, messageIds.length)
  }
}
