import { useState } from 'react'
import type { SenderGroup, MailMessage } from '../types'

interface Props {
  group: SenderGroup
  selected: boolean
  onToggle: () => void
}

export function SenderGroupRow({ group, selected, onToggle }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
          selected ? 'bg-blue-50' : ''
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer shrink-0"
        />
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="font-medium text-gray-800 truncate block">{group.name}</span>
          <span className="text-xs text-gray-400 truncate block">{group.address}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {group.messages.length}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 transition-colors w-5 text-center"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="bg-gray-50 border-t border-gray-100">
          {group.messages.map((msg) => (
            <MessageRow key={msg.id} message={msg} />
          ))}
        </div>
      )}
    </div>
  )
}

function MessageRow({ message }: { message: MailMessage }) {
  const date = message.date ? new Date(message.date) : null
  return (
    <div className="flex items-start gap-3 px-10 py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{message.subject}</p>
        <p className="text-xs text-gray-400 truncate">
          {message.fromName !== message.fromEmail ? `${message.fromName} · ` : ''}{message.fromEmail}
        </p>
      </div>
      {date && !isNaN(date.getTime()) && (
        <time className="text-xs text-gray-400 shrink-0 mt-0.5">
          {date.toLocaleDateString()}
        </time>
      )}
    </div>
  )
}
