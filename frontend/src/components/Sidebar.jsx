import React from 'react'
import { ArrowLeft, Plus } from 'lucide-react'

export function Sidebar({ sessions, activeId, onSelect, onCreateSession, onBackToLanding, isLoading }) {
  return (
    <aside className="flex h-auto flex-col border-b border-white/10 bg-black/15 lg:h-full lg:border-b-0 lg:border-r">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-display text-lg text-sand">会话</div>
            <div className="mt-1 text-xs text-fog/80">一个会话对应一个 project</div>
          </div>
          <button
            type="button"
            onClick={onBackToLanding}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-fog hover:bg-white/10"
            title="回到主聊天页"
          >
            <ArrowLeft size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={onCreateSession}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ember px-4 py-3 text-sm font-medium text-white"
        >
          <Plus size={16} />
          新建会话
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : null}
        {!isLoading
          ? sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                className={`mb-2 w-full rounded-2xl border px-3 py-3 text-left transition ${
                  activeId === session.id
                    ? 'border-ember bg-ember/20 text-sand'
                    : 'border-white/10 bg-white/5 text-fog hover:bg-white/10'
                }`}
              >
                <div className="truncate text-sm font-medium">{session.title}</div>
                <div className="mt-1 truncate text-xs opacity-70">{session.project_slug}</div>
              </button>
            ))
          : null}
        {!isLoading && sessions.length === 0 ? <div className="text-sm text-fog/70">还没有会话</div> : null}
      </div>
    </aside>
  )
}
