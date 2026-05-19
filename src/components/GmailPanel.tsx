import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { fetchGmailInbox, archiveGmailMessages, getHistoryId, syncInboxChanges } from '../services/gmailService'
import { getCache, setCache, clearCache } from '../services/gmailCache'
import { applyGroupMode, type MailMessage, type GroupMode } from '../types'
import { SenderGroupRow } from './SenderGroupRow'
import { LabelPurgeCard } from './LabelPurgeCard'

export interface GoogleAccount {
  email: string
  name: string
  picture?: string
  accessToken: string
}

type Status = 'idle' | 'loading' | 'syncing' | 'loaded' | 'archiving' | 'error'

interface Props {
  account: GoogleAccount
  onSignOut: () => void
}

function timeAgo(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function GmailPanel({ account, onSignOut }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [groupMode, setGroupMode] = useState<GroupMode>('sender')
  const [fetchCount, setFetchCount] = useState(0)
  const [fetchRate, setFetchRate] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [archiveProgress, setArchiveProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [syncCount, setSyncCount] = useState(0)
  const fetchStartRef = useRef<number>(0)

  const [searchTerm, setSearchTerm] = useState('')

  const groups = useMemo(() => applyGroupMode(messages, groupMode), [messages, groupMode])

  const filteredGroups = useMemo(() => {
    const t = searchTerm.trim().toLowerCase()
    if (!t) return groups
    return groups.filter(
      (g) =>
        g.address.includes(t) ||
        g.name.toLowerCase().includes(t) ||
        g.messages.some((m) => m.subject.toLowerCase().includes(t)),
    )
  }, [groups, searchTerm])

  // Clear selection when grouping or search changes
  useEffect(() => { setSelected(new Set()) }, [groupMode, searchTerm])

  // Auto-load from cache on mount
  useEffect(() => {
    getCache(account.email).then((entry) => {
      if (entry) {
        setMessages(entry.messages)
        setCachedAt(entry.cachedAt)
        setHistoryId(entry.historyId ?? null)
        setStatus('loaded')
      }
    }).catch(() => {})
  }, [account.email])

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setFetchCount(0)
    setFetchRate(0)
    fetchStartRef.current = Date.now()
    try {
      const fetched = await fetchGmailInbox(account.accessToken, (count) => {
        setFetchCount(count)
        const elapsed = (Date.now() - fetchStartRef.current) / 1000
        if (elapsed > 2) setFetchRate(Math.round(count / elapsed))
      })
      const hid = await getHistoryId(account.accessToken).catch(() => null)
      setMessages(fetched)
      setSelected(new Set())
      setHistoryId(hid)
      const now = Date.now()
      setCachedAt(now)
      setStatus('loaded')
      setCache({ email: account.email, messages: fetched, cachedAt: now, historyId: hid ?? undefined }).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg.includes('401') ? 'Session expired. Sign out and sign back in — cache will load instantly.' : msg)
      setStatus(messages.length > 0 ? 'loaded' : 'error')
    }
  }, [account.accessToken, account.email, messages.length])

  const toggleGroup = (address: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(address)) next.delete(address)
      else next.add(address)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filteredGroups.length) setSelected(new Set())
    else setSelected(new Set(filteredGroups.map((g) => g.address)))
  }

  const selectedMessageIds = filteredGroups
    .filter((g) => selected.has(g.address))
    .flatMap((g) => g.messages.map((m) => m.id))

  const handleArchive = async () => {
    if (selectedMessageIds.length === 0) return
    setStatus('archiving')
    setArchiveProgress({ done: 0, total: selectedMessageIds.length })
    try {
      await archiveGmailMessages(account.accessToken, selectedMessageIds, (done, total) =>
        setArchiveProgress({ done, total }),
      )
      const archived = new Set(selectedMessageIds)
      const remaining = messages.filter((m) => !archived.has(m.id))
      setMessages(remaining)
      setSelected(new Set())
      setStatus('loaded')
      if (cachedAt) {
        setCache({ email: account.email, messages: remaining, cachedAt, historyId: historyId ?? undefined }).catch(() => {})
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        msg.includes('401')
          ? 'Session expired. Sign out below and sign back in — your emails are still cached.'
          : msg,
      )
      setStatus('loaded')
    }
  }

  const handleSync = useCallback(async () => {
    if (!historyId) {
      await clearCache(account.email).catch(() => {})
      setCachedAt(null)
      setHistoryId(null)
      load()
      return
    }
    setStatus('syncing')
    setSyncCount(0)
    setError(null)
    try {
      const { messages: updated, historyId: newHid } = await syncInboxChanges(
        account.accessToken,
        historyId,
        messages,
        (added) => setSyncCount(added),
      )
      setMessages(updated)
      setHistoryId(newHid)
      const now = Date.now()
      setCachedAt(now)
      setStatus('loaded')
      setCache({ email: account.email, messages: updated, cachedAt: now, historyId: newHid }).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // historyId too old (410) — fall back to full reload
      if (msg.includes('410') || msg.includes('historyId')) {
        await clearCache(account.email).catch(() => {})
        setCachedAt(null)
        setHistoryId(null)
        load()
      } else {
        setError(msg.includes('401') ? 'Session expired. Sign out and sign back in.' : msg)
        setStatus('loaded')
      }
    }
  }, [account.accessToken, account.email, historyId, messages, load])

  const initials = account.name?.[0]?.toUpperCase() ?? account.email[0].toUpperCase()

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-200">
        <div className="h-9 w-9 rounded-full bg-red-500 text-white flex items-center justify-center font-semibold text-sm shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">{account.name}</p>
            <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 shrink-0">Gmail</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{account.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === 'idle' && (
            <button onClick={load} className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors">
              Load inbox
            </button>
          )}
          {status === 'loading' && (
            <span className="text-sm text-gray-500 animate-pulse">
              {fetchCount.toLocaleString()} fetched{fetchRate > 0 && ` · ${fetchRate}/s`}
            </span>
          )}
          {status === 'syncing' && (
            <span className="text-sm text-blue-500 animate-pulse">
              Syncing{syncCount > 0 ? ` · +${syncCount} new` : '…'}
            </span>
          )}
          {(status === 'loaded' || status === 'archiving') && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {messages.length.toLocaleString()} · {groups.length} groups
              </span>
              {cachedAt && (
                <button
                  onClick={handleSync}
                  className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
                  title={historyId ? 'Click to sync new emails' : 'Click to reload from Gmail'}
                >
                  ↻ {timeAgo(cachedAt)}
                </button>
              )}
            </div>
          )}
          {status === 'error' && (
            <button onClick={load} className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors">
              Retry
            </button>
          )}
          {status === 'archiving' && (
            <span className="text-sm text-amber-600 animate-pulse">
              Archiving {archiveProgress.done}/{archiveProgress.total}
            </span>
          )}
          <button onClick={onSignOut} className="text-xs text-gray-400 hover:text-red-400 transition-colors px-1">Sign out</button>
          <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-gray-600 transition-colors w-5 text-center">
            {collapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <LabelPurgeCard accessToken={account.accessToken} labelId="CATEGORY_PROMOTIONS" label="Promotions" />
          <LabelPurgeCard accessToken={account.accessToken} labelId="CATEGORY_SOCIAL" label="Social" />
          <LabelPurgeCard accessToken={account.accessToken} labelId="CATEGORY_UPDATES" label="Updates" />

          {error && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">{error}</div>
          )}

          {status === 'archiving' && (
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
              <div className="w-full rounded-full bg-amber-200 h-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${(archiveProgress.done / archiveProgress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {(status === 'loaded' || status === 'archiving') && groups.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-200 bg-white">
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">⌕</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search senders or domains..."
                  className="w-full rounded-lg border border-gray-200 pl-7 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {(status === 'loaded' || status === 'archiving') && filteredGroups.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selected.size === filteredGroups.length && filteredGroups.length > 0}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  {searchTerm ? `${filteredGroups.length} of ${groups.length}` : 'Select all'}
                </label>
                <div className="flex rounded-lg border border-gray-200 text-xs overflow-hidden">
                  <button
                    onClick={() => setGroupMode('sender')}
                    className={`px-2.5 py-1 transition-colors ${groupMode === 'sender' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    By sender
                  </button>
                  <button
                    onClick={() => setGroupMode('domain')}
                    className={`px-2.5 py-1 transition-colors border-l border-gray-200 ${groupMode === 'domain' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    By domain
                  </button>
                </div>
              </div>
              {selectedMessageIds.length > 0 && (
                <button
                  onClick={handleArchive}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
                >
                  Archive {selectedMessageIds.length.toLocaleString()} email{selectedMessageIds.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {(status === 'loaded' || status === 'archiving') && filteredGroups.length === 0 && (
            <p className="px-5 py-10 text-center text-gray-400 text-sm">
              {searchTerm ? `No senders match "${searchTerm}"` : 'No messages in inbox.'}
            </p>
          )}

          {(status === 'loaded' || status === 'archiving') && (
            <div className="divide-y divide-gray-100">
              {filteredGroups.map((group) => (
                <SenderGroupRow
                  key={group.address}
                  group={group}
                  selected={selected.has(group.address)}
                  onToggle={() => toggleGroup(group.address)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
