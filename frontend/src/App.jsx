import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  BookText,
  Bot,
  Check,
  ChevronRight,
  Coins,
  LayoutPanelTop,
  Rocket,
  Sparkles,
} from 'lucide-react'

import { PreviewPanel } from './components/PreviewPanel'
import { Sidebar } from './components/Sidebar'
import { TaskPanel } from './components/TaskPanel'
import { api, openSessionStream } from './lib/api'

const ROUTES = {
  landing: '/',
  workspace: '/workspace',
  pricing: '/pricing',
  docs: '/docs',
}

const DOC_SECTIONS = [
  {
    id: 'overview',
    title: '项目概览',
    content: [
      '这个系统是一个 AI Agent 控制台。用户先在主界面输入需求，再进入工作台，让 Agent 在 `project/projectN/` 下真实创建前后端项目。',
      '主控项目本身使用 React、Tailwind、lucide-react 和 FastAPI。数据不走数据库，统一落本地 JSON/JSONL，便于排查会话、步骤、日志和项目状态。',
      '一个会话对应一个 project，左侧看会话，中间看 Agent 流程与对话，右侧看预览与启动状态。',
    ],
  },
  {
    id: 'workspace',
    title: '工作台说明',
    content: [
      '工作台会持续展示 step、tool 调用、结果回填和最终产物状态。这里不是静态文案，后端会把 Agent 的过程流式推给前端。',
      '右侧预览区负责展示生成项目的目录、前端预览地址、后端接口地址、启动状态，以及启动失败分析。',
      '如果当前没有新需求，也可以直接进入工作台，先切换已有会话或创建新会话。',
    ],
  },
  {
    id: 'storage',
    title: '本地存储',
    content: [
      '`backend/data/sessions/*.json` 存每个会话的聚合数据。',
      '`backend/data/logs/*.jsonl` 存消息、step、tool、llm、project 等流水日志，按会话分开。',
      '`backend/data/projects.json` 存项目目录、端口、运行状态与预览地址等元信息。',
    ],
  },
  {
    id: 'agent',
    title: 'Agent 执行模型',
    content: [
      '大模型会读取最近 N 条历史和当前需求，先产出执行计划，再按受限工具协议调用 `list`、`read`、`mkdir`、`write`。',
      '工具执行范围被限制在当前仓库与当前 project 目录，不允许写 `.env` 这类敏感配置，也不允许路径逃逸。',
      '模型每一步的 thinking、step、tool 和 result 都会被记录，并可以继续基于同一会话做修复和迭代。',
    ],
  },
  {
    id: 'deploy',
    title: '项目启动与预览',
    content: [
      '生成出来的项目默认按 `project/projectN/frontend`、`backend`、`docker-compose.yml`、`Dockerfile` 的结构组织。',
      '启动时主控后端会尝试做 compose 启动、容器状态探测、前端 URL 检查和后端健康检查，再把结果返回给前端。',
      '如果 Docker 本机服务异常，前端会看到明确的失败分析，并提供一键回填修复提示词。',
    ],
  },
]

const PRICING_PLANS = [
  {
    name: '免费版',
    price: '¥0',
    desc: '适合快速验证主流程和本地单人试用。',
    features: ['基础会话管理', '本地 JSON/JSONL 存储', '单项目工作台预览'],
  },
  {
    name: 'Plus',
    price: '¥99 / 月',
    desc: '适合日常原型生成和多轮修复。',
    features: ['更多会话历史窗口', '更长流式步骤追踪', '一键修复提示词与更完整日志'],
  },
  {
    name: 'Pro',
    price: '¥299 / 月',
    desc: '适合持续生成项目并做工程化迭代。',
    features: ['更高模型配额', '更多并行项目', '更强日志与启动巡检能力'],
  },
]

function getCurrentRoute() {
  const path = window.location.pathname || ROUTES.landing
  return Object.values(ROUTES).includes(path) ? path : ROUTES.landing
}

function useLocalRoute() {
  const [route, setRoute] = useState(getCurrentRoute())

  useEffect(() => {
    const onPopState = () => setRoute(getCurrentRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(nextRoute) {
    if (nextRoute === route) return
    window.history.pushState({}, '', nextRoute)
    setRoute(nextRoute)
  }

  return { route, navigate }
}

function TopNav({ onNavigate }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onNavigate(ROUTES.pricing)}
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-fog transition hover:bg-white/10"
      >
        <Coins size={14} className="mr-2 inline-block" />
        价格
      </button>
      <button
        type="button"
        onClick={() => onNavigate(ROUTES.docs)}
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-fog transition hover:bg-white/10"
      >
        <BookText size={14} className="mr-2 inline-block" />
        文档
      </button>
    </div>
  )
}

function Landing({ prompt, onPromptChange, onSend, onEnterWorkspace, onNavigate }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-black/20 shadow-2xl backdrop-blur">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-7 lg:p-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-ember">
                  <Sparkles size={14} />
                  DeepWisdom
                </div>
                <h1 className="mt-5 max-w-3xl font-display text-5xl leading-tight text-sand">
                  让 Agent 根据一句需求，在 `project/` 下生成真实可启动的项目。
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-fog/85">
                  前端主控、后端主控、流式步骤、项目预览、Docker 启动、JSON/JSONL 持久化都在同一套控制台里。
                </p>
              </div>
              <TopNav onNavigate={onNavigate} />
            </div>

            <div className="mt-10 rounded-[28px] border border-white/10 bg-stone-950/60 p-5">
              <textarea
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder="输入你的产品需求，例如：做一个支持登录、仪表盘和工单管理的系统"
                className="min-h-56 w-full resize-none bg-transparent text-lg text-sand outline-none placeholder:text-fog/50"
              />
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={onEnterWorkspace}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-fog transition hover:bg-white/10"
                >
                  <LayoutPanelTop size={16} className="mr-2 inline-block" />
                  进入工作台
                </button>
                <button
                  type="button"
                  onClick={onSend}
                  className="rounded-full bg-ember px-6 py-3 text-sm font-medium text-white"
                >
                  <ArrowRight size={16} className="mr-2 inline-block" />
                  发送
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/5 p-7 lg:border-l lg:border-t-0 lg:p-10">
            <div className="rounded-[28px] border border-white/10 bg-black/25 p-5">
              <div className="flex items-center gap-2 text-sand">
                <Bot size={18} />
                <span className="font-display text-xl">控制台能力</span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  '按会话生成 `project/projectN/` 项目目录',
                  'Agent 流式输出 step、tool、result',
                  '工作台右侧直接预览生成项目',
                  '失败时展示具体启动问题和修复指令',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <Check size={16} className="mt-0.5 text-ember" />
                    <span className="text-sm text-fog">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PageShell({ title, subtitle, onNavigate, children }) {
  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl rounded-[32px] border border-white/10 bg-black/20 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-6 lg:p-8">
          <div>
            <button
              type="button"
              onClick={() => onNavigate(ROUTES.landing)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-fog"
            >
              <Sparkles size={13} />
              DeepWisdom
            </button>
            <h1 className="mt-4 font-display text-4xl text-sand">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-fog/85">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate(ROUTES.workspace)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-fog transition hover:bg-white/10"
            >
              工作台
            </button>
            <button
              type="button"
              onClick={() => onNavigate(ROUTES.pricing)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-fog transition hover:bg-white/10"
            >
              价格
            </button>
            <button
              type="button"
              onClick={() => onNavigate(ROUTES.docs)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-fog transition hover:bg-white/10"
            >
              文档
            </button>
          </div>
        </div>
        <div className="p-6 lg:p-8">{children}</div>
      </div>
    </div>
  )
}

function PricingPage({ onNavigate }) {
  return (
    <PageShell
      title="价格"
      subtitle="给当前 AI Agent 控制台预留的三档产品页示意。你后续可以直接替换成真实商业策略。"
      onNavigate={onNavigate}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {PRICING_PLANS.map((plan, index) => (
          <div
            key={plan.name}
            className={`rounded-[28px] border p-6 ${
              index === 1 ? 'border-ember/40 bg-ember/10' : 'border-white/10 bg-white/5'
            }`}
          >
            <div className="text-sm uppercase tracking-[0.2em] text-fog/70">{plan.name}</div>
            <div className="mt-4 font-display text-4xl text-sand">{plan.price}</div>
            <div className="mt-3 text-sm leading-7 text-fog/85">{plan.desc}</div>
            <div className="mt-6 space-y-3">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <Check size={16} className="mt-0.5 text-ember" />
                  <span className="text-sm text-fog">{feature}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onNavigate(ROUTES.workspace)}
              className="mt-6 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-sand transition hover:bg-white/15"
            >
              进入工作台
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

function DocsPage({ onNavigate }) {
  const [activeDocId, setActiveDocId] = useState(DOC_SECTIONS[0].id)
  const activeDoc = useMemo(
    () => DOC_SECTIONS.find((section) => section.id === activeDocId) || DOC_SECTIONS[0],
    [activeDocId],
  )

  return (
    <PageShell
      title="文档"
      subtitle="这里直接放这个项目自己的使用文档，结构是左侧菜单，右侧正文，后续可以继续扩成更多章节。"
      onNavigate={onNavigate}
    >
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-sand">
            <BookOpen size={16} />
            文档目录
          </div>
          <div className="space-y-2">
            {DOC_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveDocId(section.id)}
                className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                  section.id === activeDocId
                    ? 'bg-ember/15 text-sand'
                    : 'bg-black/20 text-fog hover:bg-white/10'
                }`}
              >
                <span>{section.title}</span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-[28px] border border-white/10 bg-black/20 p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-ember">Documentation</div>
          <h2 className="mt-3 font-display text-3xl text-sand">{activeDoc.title}</h2>
          <div className="mt-6 space-y-4">
            {activeDoc.content.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-8 text-fog/90">
                {paragraph}
              </p>
            ))}
          </div>
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-fog/85">
            关键路径：`frontend/` 是主控前端，`backend/` 是主控后端，`project/projectN/` 是 Agent 生成的真实项目目录。
          </div>
        </section>
      </div>
    </PageShell>
  )
}

function Workspace({
  sessions,
  projects,
  activeSessionId,
  activeSession,
  workspacePrompt,
  setWorkspacePrompt,
  isStreaming,
  startingProject,
  showCreateModal,
  newSessionPrompt,
  uiMessage,
  showFailureAnalysis,
  onSelect,
  onOpenCreateModal,
  onBackToLanding,
  onSubmit,
  onStartProject,
  onUseRepairPrompt,
  onCloseCreateModal,
  onNewSessionPromptChange,
  onCreateSession,
}) {
  return (
    <>
      <div className="grid min-h-screen grid-cols-1 overflow-hidden lg:h-screen lg:grid-cols-[260px_minmax(480px,1fr)_420px] lg:[&>*]:min-h-0">
        <Sidebar
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={onSelect}
          onCreateSession={onOpenCreateModal}
          onBackToLanding={onBackToLanding}
        />
        <TaskPanel
          session={activeSession}
          draft={workspacePrompt}
          onDraftChange={setWorkspacePrompt}
          onSubmit={onSubmit}
          isStreaming={isStreaming}
        />
        <PreviewPanel
          session={activeSession}
          projects={projects}
          onStartProject={onStartProject}
          startingProject={startingProject}
          message={uiMessage}
          onUseRepairPrompt={onUseRepairPrompt}
          showFailureAnalysis={showFailureAnalysis}
        />
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-stone-950 p-6 shadow-2xl">
            <div className="font-display text-2xl text-sand">新建会话</div>
            <div className="mt-2 text-sm text-fog/80">输入需求后创建新会话，并在 `project/` 下生成新的项目目录。</div>
            <textarea
              value={newSessionPrompt}
              onChange={(event) => onNewSessionPromptChange(event.target.value)}
              placeholder="例如：做一个支持登录、仪表盘和工单管理的系统"
              className="mt-5 min-h-40 w-full rounded-3xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-sand outline-none placeholder:text-fog/50"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCloseCreateModal}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-fog"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onCreateSession}
                className="rounded-2xl bg-ember px-4 py-3 text-sm font-medium text-white"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function App() {
  const { route, navigate } = useLocalRoute()
  const [sessions, setSessions] = useState([])
  const [projects, setProjects] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [activeSession, setActiveSession] = useState(null)
  const [landingPrompt, setLandingPrompt] = useState('')
  const [workspacePrompt, setWorkspacePrompt] = useState('')
  const [newSessionPrompt, setNewSessionPrompt] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [startingProject, setStartingProject] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [showFailureAnalysis, setShowFailureAnalysis] = useState(false)
  const [uiMessage, setUiMessage] = useState('')
  const eventSourceRef = useRef(null)
  const messageTimerRef = useRef(null)

  function pushMessage(message) {
    setUiMessage(message)
    window.clearTimeout(messageTimerRef.current)
    messageTimerRef.current = window.setTimeout(() => {
      setUiMessage('')
    }, 5000)
  }

  async function refreshSessions(nextActiveId) {
    const [sessionList, projectList] = await Promise.all([api.listSessions(), api.listProjects()])
    setSessions(sessionList)
    setProjects(projectList)
    const targetId = nextActiveId || activeSessionId || sessionList[0]?.id
    if (targetId) {
      const detail = await api.getSession(targetId)
      setActiveSessionId(targetId)
      setActiveSession(detail)
    } else {
      setActiveSessionId('')
      setActiveSession(null)
    }
  }

  useEffect(() => {
    refreshSessions().catch(console.error)
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      window.clearTimeout(messageTimerRef.current)
    }
  }, [])

  async function attachStream(sessionId) {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    setIsStreaming(true)
    eventSourceRef.current = openSessionStream(sessionId, (event) => {
      setActiveSession((current) => {
        if (!current || current.id !== sessionId) {
          return current
        }
        return {
          ...current,
          steps: [...(current.steps || []), event],
        }
      })
      if (event.type === 'done' || event.type === 'error') {
        setIsStreaming(false)
        refreshSessions(sessionId).catch(console.error)
        eventSourceRef.current?.close()
      }
    })
  }

  async function handleSendFromLanding() {
    if (!landingPrompt.trim()) return
    const session = await api.createSession(landingPrompt.trim())
    setActiveSessionId(session.id)
    setActiveSession(session)
    setSessions((current) => [session, ...current])
    navigate(ROUTES.workspace)
    await refreshSessions(session.id)
    await attachStream(session.id)
    setLandingPrompt('')
  }

  function handleEnterWorkspace() {
    navigate(ROUTES.workspace)
  }

  async function handleCreateSessionFromWorkspace() {
    if (!newSessionPrompt.trim()) return
    const session = await api.createSession(newSessionPrompt.trim())
    setActiveSessionId(session.id)
    setActiveSession(session)
    navigate(ROUTES.workspace)
    await refreshSessions(session.id)
    await attachStream(session.id)
    setNewSessionPrompt('')
    setShowCreateModal(false)
  }

  async function handleSelect(sessionId) {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    setIsStreaming(false)
    setShowFailureAnalysis(false)
    const detail = await api.getSession(sessionId)
    setActiveSessionId(sessionId)
    setActiveSession(detail)
    navigate(ROUTES.workspace)
  }

  function handleBackToLanding() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    setIsStreaming(false)
    setWorkspacePrompt('')
    setShowFailureAnalysis(false)
    navigate(ROUTES.landing)
  }

  async function handleWorkspaceSubmit(event) {
    event.preventDefault()
    if (!workspacePrompt.trim() || !activeSessionId) return
    await api.sendMessage(activeSessionId, workspacePrompt.trim())
    const detail = await api.getSession(activeSessionId)
    setActiveSession(detail)
    setWorkspacePrompt('')
    await attachStream(activeSessionId)
  }

  async function handleStartProject() {
    if (!activeSessionId) return
    setStartingProject(true)
    setShowFailureAnalysis(false)
    try {
      const result = await api.startProject(activeSessionId)
      await refreshSessions(activeSessionId)
      pushMessage(`项目启动请求已发送，状态：${result.runtime_status || 'unknown'}。`)
      setShowFailureAnalysis(result.runtime_status === 'failed')
      if (result.preview_url) {
        window.open(result.preview_url, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setShowFailureAnalysis(true)
      if (String(error.message).includes('Not Found')) {
        pushMessage('启动接口不存在。先重启后端 `python3 backend/main.py`，再点一次启动项目。')
      } else {
        pushMessage(error.message || '启动项目失败')
      }
    } finally {
      setStartingProject(false)
    }
  }

  function handleUseRepairPrompt(prompt) {
    if (!prompt) return
    setWorkspacePrompt(prompt)
  }

  if (route === ROUTES.pricing) {
    return <PricingPage onNavigate={navigate} />
  }

  if (route === ROUTES.docs) {
    return <DocsPage onNavigate={navigate} />
  }

  if (route === ROUTES.workspace) {
    return (
      <Workspace
        sessions={sessions}
        projects={projects}
        activeSessionId={activeSessionId}
        activeSession={activeSession}
        workspacePrompt={workspacePrompt}
        setWorkspacePrompt={setWorkspacePrompt}
        isStreaming={isStreaming}
        startingProject={startingProject}
        showCreateModal={showCreateModal}
        newSessionPrompt={newSessionPrompt}
        uiMessage={uiMessage}
        showFailureAnalysis={showFailureAnalysis}
        onSelect={handleSelect}
        onOpenCreateModal={() => setShowCreateModal(true)}
        onBackToLanding={handleBackToLanding}
        onSubmit={handleWorkspaceSubmit}
        onStartProject={handleStartProject}
        onUseRepairPrompt={handleUseRepairPrompt}
        onCloseCreateModal={() => {
          setShowCreateModal(false)
          setNewSessionPrompt('')
        }}
        onNewSessionPromptChange={setNewSessionPrompt}
        onCreateSession={handleCreateSessionFromWorkspace}
      />
    )
  }

  return (
    <Landing
      prompt={landingPrompt}
      onPromptChange={setLandingPrompt}
      onSend={handleSendFromLanding}
      onEnterWorkspace={handleEnterWorkspace}
      onNavigate={navigate}
    />
  )
}
