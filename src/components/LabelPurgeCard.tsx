import { useState, useEffect } from 'react'
import { getLabelMessageCount, purgeLabel } from '../services/gmailService'

interface Props {
  accessToken: string
  labelId: string
  label: string
}

type Status = 'idle' | 'loading-count' | 'ready' | 'confirming' | 'running' | 'done' | 'error'

export function LabelPurgeCard({ accessToken, labelId, label }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [count, setCount] = useState<number | null>(null)
  const [mode, setMode] = useState<'archive' | 'delete'>('archive')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStatus('loading-count')
    getLabelMessageCount(accessToken, labelId)
      .then((n) => { setCount(n); setStatus(n > 0 ? 'ready' : 'done') })
      .catch(() => setStatus('idle'))
  }, [accessToken, labelId])

  const handlePurge = async () => {
    setStatus('running')
    setProgress({ done: 0, total: count ?? 0 })
    try {
      const deleted = await purgeLabel(accessToken, labelId, mode, (done, total) =>
        setProgress({ done, total }),
      )
      setCount(0)
      setProgress({ done: deleted, total: deleted })
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  if (status === 'idle' || status === 'loading-count') return null
  if (status === 'done' && count === 0) return (
    <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 text-sm text-green-700">
      {label} cleared — {progress.done > 0 ? `${progress.done.toLocaleString()} messages ${mode === 'delete' ? 'deleted' : 'archived'}` : 'nothing to clear'}.
    </div>
  )

  return (
    <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-purple-900">{label}</span>
          {count !== null && count > 0 && (
            <span className="text-xs bg-purple-200 text-purple-800 rounded-full px-2 py-0.5">
              {count.toLocaleString()}
            </span>
          )}
          {error && <span className="text-xs text-red-600 truncate">{error}</span>}
        </div>

        {status === 'ready' && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex rounded-lg border border-purple-200 text-xs overflow-hidden">
              <button
                onClick={() => setMode('archive')}
                className={`px-2.5 py-1 transition-colors ${mode === 'archive' ? 'bg-purple-700 text-white' : 'text-purple-600 hover:bg-purple-100'}`}
              >
                Archive
              </button>
              <button
                onClick={() => setMode('delete')}
                className={`px-2.5 py-1 transition-colors border-l border-purple-200 ${mode === 'delete' ? 'bg-purple-700 text-white' : 'text-purple-600 hover:bg-purple-100'}`}
              >
                Delete
              </button>
            </div>
            <button
              onClick={() => setStatus('confirming')}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors"
            >
              Purge all
            </button>
          </div>
        )}

        {status === 'confirming' && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-purple-800">
              {mode === 'delete' ? 'Permanently delete' : 'Archive'} {count?.toLocaleString()} emails?
            </span>
            <button
              onClick={handlePurge}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
            >
              Yes, {mode === 'delete' ? 'delete' : 'archive'} all
            </button>
            <button
              onClick={() => setStatus('ready')}
              className="text-xs text-purple-600 hover:text-purple-800"
            >
              Cancel
            </button>
          </div>
        )}

        {status === 'running' && (
          <span className="text-xs text-purple-700 animate-pulse shrink-0">
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
          </span>
        )}
      </div>

      {status === 'running' && progress.total > 0 && (
        <div className="mt-2 w-full rounded-full bg-purple-200 h-1.5">
          <div
            className="bg-purple-600 h-1.5 rounded-full transition-all"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
