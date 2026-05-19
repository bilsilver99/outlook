export interface MailMessage {
  id: string
  subject: string
  date: string
  snippet: string
  fromName: string
  fromEmail: string
}

export interface SenderGroup {
  address: string
  name: string
  messages: MailMessage[]
}

export type GroupMode = 'sender' | 'domain'

export function groupBySender(messages: MailMessage[]): SenderGroup[] {
  const map = new Map<string, SenderGroup>()
  for (const msg of messages) {
    if (!map.has(msg.fromEmail)) {
      map.set(msg.fromEmail, { address: msg.fromEmail, name: msg.fromName, messages: [] })
    }
    map.get(msg.fromEmail)!.messages.push(msg)
  }
  return [...map.values()].sort((a, b) => b.messages.length - a.messages.length)
}

export function groupByDomain(messages: MailMessage[]): SenderGroup[] {
  const map = new Map<string, SenderGroup>()
  for (const msg of messages) {
    const domain = '@' + (msg.fromEmail.split('@')[1] ?? 'unknown')
    if (!map.has(domain)) {
      map.set(domain, { address: domain, name: domain, messages: [] })
    }
    map.get(domain)!.messages.push(msg)
  }
  return [...map.values()].sort((a, b) => b.messages.length - a.messages.length)
}

export function applyGroupMode(messages: MailMessage[], mode: GroupMode): SenderGroup[] {
  return mode === 'domain' ? groupByDomain(messages) : groupBySender(messages)
}
