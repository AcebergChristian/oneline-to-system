import React, { useEffect, useRef } from 'react'
import { ExternalLink, FolderTree, MonitorSmartphone, Play, Square } from 'lucide-react'
import { getProjectBackendUrl, getProjectPreviewUrl } from '../lib/projectUrls'

function buildFailureDetail(project) {
  const stderr = project?.stderr || ''
  const stdout = project?.stdout || ''
  const composePs = project?.compose_ps || ''
  const composeLogs = project?.compose_logs || ''
  const failureReason = project?.failure_reason || ''
  const combined = `${stderr}\n${stdout}\n${composePs}\n${composeLogs}`
  const backendUrl = project?.backend_url || '当前项目地址'
  const serviceStates = project?.service_states || {}
  const serviceStateSummary = Object.keys(serviceStates).length
    ? Object.entries(serviceStates)
        .map(([name, state]) => `${name}: ${state}`)
        .join(' / ')
    : '未拿到容器状态'

  const platformDeployNote =
    'Dockerfile 与 docker-compose.yml 由平台自动生成和管理(单容器部署,前端 build 产物由后端同端口托管),不要让 Agent 修改部署文件,只需修复 frontend/ 与 backend/ 源码。'

  // 注意:不能用 'npm run build' 作判断条件——每个成功构建的 compose 日志里
  // 都包含 "RUN npm run build" 这一行,会导致所有失败都被误报成前端构建失败。
  // 这里只匹配真正的构建失败信号。
  if (
    combined.includes('npm error') ||
    combined.includes('npm ERR') ||
    combined.includes('ELIFECYCLE') ||
    combined.includes('Failed to compile') ||
    combined.includes('error during build') ||
    combined.includes('No such image')
  ) {
    return {
      title: '前端构建失败',
      detail: '前端 build 阶段没有成功完成,常见原因是 package.json 依赖或构建脚本报错。',
      prompt: `根据当前启动失败日志,检查 project 里的 frontend/package.json、frontend 源码与构建脚本,修复前端构建报错后重新启动项目。${platformDeployNote}`,
    }
  }

  if (combined.includes('cannot connect to the docker daemon') || combined.includes('is the docker daemon running?')) {
    return {
      title: 'Docker 没有启动',
      detail: '当前不是代码错误,是真机上的 Docker daemon 没在运行,所以镜像无法构建、容器也无法启动。',
      prompt: `Docker 恢复后,请直接重新点击启动项目即可,平台会自动重新构建并启动。项目地址应为 ${backendUrl}。`,
    }
  }

  if (combined.includes('pypi.org') || combined.includes('No matching distribution found')) {
    return {
      title: '后端依赖安装失败',
      detail: 'Docker 构建 backend 镜像时 Python 依赖下载失败,导致 FastAPI 依赖没有装上。',
      prompt: `根据当前启动失败日志,检查 backend/requirements.txt 里的依赖版本是否存在可安装的版本(不要写死过老的版本号),修复后重新启动项目。${platformDeployNote}`,
    }
  }

  if (combined.includes('auth.docker.io') || combined.includes('registry-1.docker.io') || combined.includes('failed to resolve source metadata')) {
    return {
      title: 'Docker 基础镜像拉取失败',
      detail: '启动时需要的 node/python 等基础镜像没有拉取成功。',
      prompt: '基础镜像拉取失败通常是网络问题,请检查 Docker 的网络与镜像加速器配置,恢复后直接重新点击启动项目即可。',
    }
  }

  if (combined.includes('address already in use') || combined.includes('port is already allocated')) {
    return {
      title: '端口冲突',
      detail: '平台已经自动尝试换端口重试,但分配到的端口仍被其他程序占用。',
      prompt: '请检查本机是否有其他程序占用了 8000-8999 区间的端口(可用 lsof -i :端口 查看),清理后重新点击启动项目,平台会自动选择空闲端口。',
    }
  }

  if (failureReason === 'python_dependency_network_failure') {
    return {
      title: '后端 Python 依赖网络失败',
      detail: '后端镜像构建过程中,Python 依赖下载失败。',
      prompt: `根据当前启动失败日志,检查 backend/requirements.txt 的依赖清单,去掉不存在或过老的固定版本号后重新启动项目。${platformDeployNote}`,
    }
  }

  if (failureReason === 'docker_registry_failure') {
    return {
      title: 'Docker 仓库访问失败',
      detail: '构建时访问 Docker Registry 失败,镜像没有拉下来。',
      prompt: '请检查 Docker 的网络与镜像加速器配置,恢复后直接重新点击启动项目即可。',
    }
  }

  if (failureReason === 'docker_daemon_unavailable') {
    return {
      title: 'Docker 没有启动',
      detail: '当前不是生成代码本身崩了,而是本机 Docker 服务没有运行,`docker compose` 无法连接 daemon。',
      prompt: `Docker 恢复后,请直接重新点击启动项目即可。项目地址应为 ${backendUrl}。`,
    }
  }

  if (failureReason === 'services_not_running') {
    return {
      title: '容器没有真正跑起来',
      detail: `docker compose 已执行,但容器状态异常。当前状态:${serviceStateSummary}`,
      prompt: `根据当前启动失败日志,重点检查 backend/main.py 是否定义了名为 app 的 FastAPI 实例、requirements.txt 是否完整,以及 frontend 是否能正常 build。修复源码后重新启动项目。项目地址应为 ${backendUrl}。${platformDeployNote}`,
    }
  }

  if (failureReason === 'backend_unreachable') {
    return {
      title: '项目服务没有启动成功',
      detail: `容器可能已经创建,但 ${backendUrl} 无法访问,说明项目自己的后端没有真正起来(前端由后端同端口托管)。`,
      prompt: `根据当前启动失败日志,重点检查 backend/main.py 是否定义了名为 app 的 FastAPI 实例、依赖是否齐全、frontend 构建产物是否正常,修复后重新启动项目。项目地址应为 ${backendUrl}。${platformDeployNote}`,
    }
  }

  if (failureReason === 'frontend_unreachable') {
    return {
      title: '前端页面没有启动成功',
      detail: `后端可能已经起来,但预览地址 ${backendUrl} 无法访问。当前架构下前端由后端同端口托管,请检查前端构建产物。`,
      prompt: `根据当前启动失败日志,重点检查 frontend 目录的 package.json 与构建脚本,确保 npm run build 能产出 dist/。${platformDeployNote}`,
    }
  }

  return {
    title: '项目启动失败',
    detail: '启动命令执行失败,具体错误见下方日志。',
    prompt: `根据当前启动失败日志,检查现有 project 的 frontend/ 与 backend/ 源码并修复启动问题,然后重新启动项目。${platformDeployNote}`,
  }
}

export function PreviewPanel({
  session,
  projects,
  onStartProject,
  onStopProject,
  startingProject,
  stoppingProject,
  message,
  onUseRepairPrompt,
  showFailureAnalysis,
}) {
  const project = projects.find((item) => item.session_id === session?.id)
  const runtimeStatus = project?.runtime_status || 'idle'
  // 只有项目确实在运行时才挂 iframe:未启动/已停止时不展示死链接的错误页
  const isLive = runtimeStatus === 'running'
  const livePreviewUrl = isLive ? getProjectPreviewUrl(project, session) : ''
  // 启动后真实分配过的地址(不用未启动时的占位地址)
  const recordedUrl = getProjectPreviewUrl(project, null)
  const displayUrl = livePreviewUrl || recordedUrl
  const backendUrl = getProjectBackendUrl(project, session)
  // started_at 每次启动都会更新:作为 key 强制 iframe 重新加载,
  // 否则 src 不变时浏览器会一直停留在旧的错误页上
  const previewKey = `${livePreviewUrl}#${project?.started_at || ''}`
  const previewBoxRef = useRef(null)

  useEffect(() => {
    if (livePreviewUrl && previewBoxRef.current) {
      previewBoxRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [previewKey, livePreviewUrl])

  const hasFailedStart = Boolean(
    showFailureAnalysis &&
      project?.started_at &&
      runtimeStatus === 'failed' &&
      (project?.stdout || project?.stderr || project?.compose_ps || project?.compose_logs),
  )
  const failureDetail = hasFailedStart ? buildFailureDetail({ ...project, preview_url: displayUrl, backend_url: backendUrl }) : null

  return (
    <section className="flex h-auto flex-col border-t border-white/10 bg-black/20 lg:h-full lg:border-l lg:border-t-0">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2 text-sand">
          <MonitorSmartphone size={18} />
          <span className="font-display text-lg">预览</span>
        </div>
        <div className="mt-1 text-xs text-fog/80">右侧展示 project 预览地址与目录信息</div>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {message ? (
          <div className="mb-4 rounded-2xl border border-ember/30 bg-ember/10 px-4 py-3 text-sm text-sand">
            {message}
          </div>
        ) : null}
        {hasFailedStart ? (
          <div className="mb-4 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="text-sm text-sand">启动失败分析</div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-sm text-sand">{failureDetail?.title}</div>
              <div className="mt-1 text-xs text-fog/80">{failureDetail?.detail}</div>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => onUseRepairPrompt?.(failureDetail?.prompt || '')}
                className="rounded-2xl bg-ember px-4 py-2 text-sm font-medium text-white"
              >
                一键填入修复指令
              </button>
            </div>
            <div className="mt-3 text-xs text-fog/80">
              点击上面的按钮，会把建议修复指令直接填到当前会话输入框里，你再发送即可。
            </div>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-fog">
              {[project?.compose_ps, project?.compose_logs, project?.stderr, project?.stdout].filter(Boolean).join('\n\n')}
            </pre>
          </div>
        ) : null}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm text-sand">
            <FolderTree size={16} />
            项目结构
          </div>
          <div className="mt-3 text-sm text-fog">
            <div>会话：{session?.title || '-'}</div>
            <div>目录：{project?.path || `project/${session?.project_slug || ''}`}</div>
            <div>访问地址：{displayUrl || '未启动'}(前端由后端同端口托管)</div>
            <div>运行状态：{runtimeStatus}</div>
            <div>本地记录：`backend/data/sessions/*.json` 与 `backend/data/logs/*.jsonl`</div>
          </div>
          <div className="mt-4 flex gap-3">
            {isLive && !startingProject ? (
              <button
                type="button"
                onClick={onStopProject}
                disabled={!session || stoppingProject}
                className="flex items-center gap-2 rounded-2xl bg-rose-500/80 px-4 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
              >
                <Square size={16} />
                {stoppingProject ? '停止中...' : '停止项目'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartProject}
                disabled={!session || startingProject}
                className="flex items-center gap-2 rounded-2xl bg-ember px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                <Play size={16} />
                {startingProject ? '启动中...' : '启动项目'}
              </button>
            )}
            {livePreviewUrl ? (
              <a
                href={livePreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-fog"
              >
                <ExternalLink size={16} />
                打开预览
              </a>
            ) : null}
          </div>
        </div>

        <div ref={previewBoxRef} className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-stone-950">
          {livePreviewUrl ? (
            <>
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-fog">
                <span>{livePreviewUrl}</span>
                <a href={livePreviewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1">
                  <ExternalLink size={14} />
                  打开
                </a>
              </div>
              <iframe key={previewKey} title="preview" src={livePreviewUrl} className="h-[520px] w-full bg-white" />
            </>
          ) : (
            <div className="p-6 text-sm text-fog/70">
              {startingProject
                ? '项目正在启动，启动成功后这里会自动显示预览。'
                : project
                  ? `项目当前未运行（状态：${runtimeStatus}），点击「启动项目」后这里会显示预览。`
                  : '项目启动后会在这里预览'}
            </div>
          )}
        </div>

        
      </div>
    </section>
  )
}
