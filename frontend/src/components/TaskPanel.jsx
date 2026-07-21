import React, { useEffect, useRef } from 'react'
import { Bot, Hammer, MessageSquare, Send } from 'lucide-react'

export function TaskPanel({ session, draft, onDraftChange, onSubmit, isStreaming }) {
  const steps = session?.steps || []
  const messages = session?.messages || []
  const stepsRef = useRef(null)
  const messagesRef = useRef(null)
  const latestStep = steps[steps.length - 1]

  useEffect(() => {
    if (stepsRef.current) {
      stepsRef.current.scrollTop = stepsRef.current.scrollHeight
    }
  }, [steps])

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, isStreaming, latestStep?.content])

  return (
    <section className="flex h-auto min-h-0 flex-col bg-white/5 lg:h-full">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2 text-sand">
          <Bot size={18} />
          <span className="font-display text-lg">Agent 工作台</span>
        </div>
        <div className="mt-1 text-xs text-fog/80">
          流式 step、工具执行记录、最近消息都在这里
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] overflow-hidden">
        <div className="grid min-h-0 grid-cols-1 gap-4 overflow-hidden p-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex min-h-0 min-w-0 flex-col rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-sand">
              <Hammer size={16} />
              当前执行 Step
            </div>
            <div ref={stepsRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
              {steps.map((step, index) => (
                <div key={`${step.created_at}-${index}`} className="rounded-2xl bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-ember">{step.type}</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm text-fog">{step.content}</div>
                </div>
              ))}
              {steps.length === 0 && <div className="text-sm text-fog/70">等待任务开始</div>}
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-col rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-sand">
              <MessageSquare size={16} />
              对话历史
            </div>
            <div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
              {messages.map((message, index) => (
                <div key={`${message.created_at}-${index}`} className="rounded-2xl bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-moss">{message.role}</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm text-fog">{message.content}</div>
                </div>
              ))}
              {isStreaming ? (
                <div className="rounded-2xl border border-ember/20 bg-ember/10 p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-moss">assistant</div>
                  <div className="mt-1 text-sm text-fog">
                    <span className="inline-flex items-center gap-2">
                      <span>处理中</span>
                      <span className="animate-pulse">...</span>
                    </span>
                  </div>
                  {latestStep?.content ? (
                    <div className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs text-fog/70">
                      当前进度：{latestStep.content}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {messages.length === 0 && <div className="text-sm text-fog/70">还没有消息</div>}
            </div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="border-t border-white/10 p-4">
          <div className="flex gap-3">
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder="继续描述你想让 Agent 在当前 project 里做什么"
              className="min-h-24 flex-1 rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-sand outline-none placeholder:text-fog/50"
            />
            <button
              type="submit"
              disabled={!session}
              className="flex items-center gap-2 rounded-3xl bg-ember px-5 py-3 text-sm font-medium text-white"
            >
              <Send size={16} />
              发送
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
