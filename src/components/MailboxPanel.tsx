import { useState, useCallback, useMemo, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { fetchInboxMessages, archiveMessages } from '../services/graphService'
import { applyGroupMode, type MailMessage, type GroupMode } from '../types'
import { SenderGroupRow } from './SenderGroupRow'

type Status = 'idle' | 'loading' | 'loaded' | 'archiving' | 'error'

interface Props {
  account: AccountInfo
  onSignOut: () => void
}

export function MailboxPanel({ account, onSignOut }: Props) {
  const { instance } = useMsal()
  const [status, setStatus] = useState<Status>('idle')
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [groupMode, setGroupMode] = useState<GroupMode>('sender')
  const [fetchCount, setFetchCount] = useState(0)

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

  useEffect(() => { setSelected(new Set()) }, [groupMode, searchTerm])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [archiveProgress, setArchiveProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setFetchCount(0)
    try {
      const fetched = await fetchInboxMessages(instance, account, setFetchCount)
      setMessages(fetched)
      setSelected(new Set())
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [instance, account])

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
      await archiveMessages(instance, account, selectedMessageIds, (done, total) =>
        setArchiveProgress({ done, total }),
      )
      const archived = new Set(selectedMessageIds)
      setMessages((prev) => prev.filter((m) => !archived.has(m.id)))
      setSelected(new Set())
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const initials = (account.name ?? account.username)?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-200">
        <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">{account.name ?? 'Unknown'}</p>
            <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 shrink-0">Microsoft</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{account.username}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(status === 'idle' || status === 'error') && (
            <button
              onClick={load}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Load inbox
            </button>
          )}
          {status === 'loading' && (
            <span className="text-sm text-gray-500 animate-pulse">Fetching {fetchCount}...</span>
          )}
          {status === 'loaded' && (
            <span className="text-xs text-gray-400">{groups.length} senders</span>
          )}
          {status === 'archiving' && (
            <span className="text-sm text-amber-600 animate-pulse">
              Archiving {archiveProgress.done}/{archiveProgress.total}
            </span>
          )}
          <button
            onClick={onSignOut}
            className="text-xs text-gray-400 hover:text-red-400 transition-colors px-1"
          >
            Sign out
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-gray-600 transition-colors w-5 text-center"
          >
            {collapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {error && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">
              {error}
              <button onClick={load} className="ml-3 underline text-red-600 hover:text-red-800">
                Retry
              </button>
            </div>
          )}

          {status === 'archiving' && (
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
              <div className="w-full rounded-full bg-amber-200 h-1.5">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${(archiveProgress.done / archiveProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {status === 'loaded' && groups.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-200 bg-white">
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">⌕</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search senders or domains..."
                  className="w-full rounded-lg border border-gray-200 pl-7 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
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

          {status === 'loaded' && filteredGroups.length > 0 && (
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
                  Archive {selectedMessageIds.length} email
                  {selectedMessageIds.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {status === 'loaded' && filteredGroups.length === 0 && (
            <p className="px-5 py-10 text-center text-gray-400 text-sm">
              {searchTerm ? `No senders match "${searchTerm}"` : 'No messages in inbox.'}
            </p>
          )}

          {status === 'loaded' && (
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
