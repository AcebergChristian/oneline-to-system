import React from 'react'
import { ExternalLink, FolderTree, MonitorSmartphone, Play } from 'lucide-react'

function buildFailureDetail(project) {
  const stderr = project?.stderr || ''
  const stdout = project?.stdout || ''
  const failureReason = project?.failure_reason || ''
  const combined = `${stderr}\n${stdout}`
  const previewUrl = project?.preview_url || '当前前端地址'
  const backendUrl = project?.backend_url || '当前后端地址'
  const serviceStates = project?.service_states || {}
  const serviceStateSummary = Object.keys(serviceStates).length
    ? Object.entries(serviceStates)
        .map(([name, state]) => `${name}: ${state}`)
        .join(' / ')
    : '未拿到容器状态'

  if (combined.includes('No such image')) {
    return {
      title: '前端镜像不存在',
      detail: '启动 fallback 时找不到已构建的前端镜像，说明前端构建阶段没有成功完成。',
      prompt: '根据当前启动失败日志，先检查 project 里的 frontend Dockerfile、package.json 和 docker-compose.yml，补全或修复前端构建链路，然后重新启动项目。',
    }
  }

  if (combined.includes('cannot connect to the docker daemon') || combined.includes('is the docker daemon running?')) {
    return {
      title: 'Docker 没有启动',
      detail: '当前不是代码错误，是真机上的 Docker daemon 没在运行，所以镜像无法构建、容器也无法启动。',
      prompt: `Docker 恢复后，请检查当前 project 的 docker-compose.yml、frontend Dockerfile 和 backend Dockerfile，确认前端 ${previewUrl} 与后端 ${backendUrl} 的启动链路正确，再重新启动项目。`,
    }
  }

  if (combined.includes('pypi.org') || combined.includes('No matching distribution found')) {
    return {
      title: '后端依赖安装失败',
      detail: 'Docker 构建 backend 镜像时访问 PyPI 失败，导致 FastAPI 依赖没有装上。',
      prompt: '根据当前启动失败日志，检查 backend 的 requirements.txt、Dockerfile 和 docker-compose.yml，修复后端依赖安装或镜像复用方案，然后重新启动项目。',
    }
  }

  if (combined.includes('auth.docker.io') || combined.includes('registry-1.docker.io') || combined.includes('failed to resolve source metadata')) {
    return {
      title: 'Docker 基础镜像拉取失败',
      detail: '启动时需要的 node/nginx 等基础镜像没有拉取成功，所以前端镜像没法构建。',
      prompt: '根据当前启动失败日志，检查 frontend Dockerfile 和 docker-compose.yml，尽量复用现有镜像或调整启动方案，修复前端构建失败后重新启动项目。',
    }
  }

  if (combined.includes('address already in use') || combined.includes('port is already allocated')) {
    return {
      title: '端口冲突',
      detail: '当前项目要占用的端口已经被其他服务占用了。',
      prompt: '根据当前启动失败日志，检查 docker-compose.yml 里的端口映射，修复端口冲突并重新启动项目。',
    }
  }

  if (failureReason === 'python_dependency_network_failure') {
    return {
      title: '后端 Python 依赖网络失败',
      detail: '后端镜像构建过程中，Python 依赖下载失败。',
      prompt: '根据当前启动失败日志，检查 backend 构建方式和依赖安装逻辑，修复 Python 依赖安装失败并重新启动项目。',
    }
  }

  if (failureReason === 'docker_registry_failure') {
    return {
      title: 'Docker 仓库访问失败',
      detail: '构建时访问 Docker Registry 失败，镜像没有拉下来。',
      prompt: '根据当前启动失败日志，检查 frontend/backend 的 Dockerfile 和 docker-compose.yml，修复镜像拉取或复用方案后重新启动项目。',
    }
  }

  if (failureReason === 'docker_daemon_unavailable') {
    return {
      title: 'Docker 没有启动',
      detail: '当前不是生成代码本身崩了，而是本机 Docker 服务没有运行，`docker compose` 无法连接 daemon。',
      prompt: `Docker 恢复后，请检查当前 project 的 docker-compose.yml、frontend Dockerfile 和 backend Dockerfile，确认前端 ${previewUrl} 与后端 ${backendUrl} 的端口和启动命令正确，再重新启动项目。`,
    }
  }

  if (failureReason === 'services_not_running') {
    return {
      title: '容器没有真正跑起来',
      detail: `docker compose 已执行，但容器状态异常。当前状态：${serviceStateSummary}`,
      prompt: `根据当前启动失败日志和容器状态，检查 project 里的 docker-compose.yml、Dockerfile 与启动命令，修复未正常运行的服务后重新启动项目。前端应为 ${previewUrl}，后端应为 ${backendUrl}。`,
    }
  }

  if (failureReason === 'backend_unreachable') {
    return {
      title: '后端接口没有启动成功',
      detail: `容器可能已经创建，但 ${backendUrl}/api/health 无法访问，说明项目自己的后端没有真正起来。`,
      prompt: `根据当前启动失败日志，重点检查 backend 目录、后端启动命令、端口映射和 /api/health，修复后端不可达问题后重新启动项目。后端目标地址应为 ${backendUrl}。`,
    }
  }

  if (failureReason === 'frontend_unreachable') {
    return {
      title: '前端页面没有启动成功',
      detail: `后端可能已经起来，但前端预览地址 ${previewUrl} 无法访问，说明项目自己的前端没有真正起来。`,
      prompt: `根据当前启动失败日志，重点检查 frontend 目录、前端构建与运行命令、Dockerfile 和端口映射，修复前端不可达问题后重新启动项目。前端目标地址应为 ${previewUrl}。`,
    }
  }

  return {
    title: '项目启动失败',
    detail: '启动命令执行失败，具体错误见下方日志。',
    prompt: '根据当前启动失败日志，检查现有 project 文件并修复启动问题，然后重新启动项目。',
  }
}

export function PreviewPanel({
  session,
  projects,
  onStartProject,
  startingProject,
  message,
  onUseRepairPrompt,
  showFailureAnalysis,
}) {
  const project = projects.find((item) => item.session_id === session?.id)
  const runtimeStatus = project?.runtime_status || 'idle'
  const previewUrl = project?.preview_url || session?.preview_url
  const hasFailedStart = Boolean(
    showFailureAnalysis && project?.started_at && runtimeStatus === 'failed' && (project?.stdout || project?.stderr),
  )
  const failureDetail = hasFailedStart ? buildFailureDetail(project) : null

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
              {project?.stderr || project?.stdout}
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
            <div>前端预览：{previewUrl || '未启动'}</div>
            <div>后端接口：{project?.backend_url || '未识别'}</div>
            <div>运行状态：{runtimeStatus}</div>
            <div>本地记录：`backend/data/sessions/*.json` 与 `backend/data/logs/*.jsonl`</div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={onStartProject}
              disabled={!session || startingProject}
              className="flex items-center gap-2 rounded-2xl bg-ember px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              <Play size={16} />
              {startingProject ? '启动中...' : '启动项目'}
            </button>
            {previewUrl ? (
              <a
                href={previewUrl}
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

        <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-stone-950">
          {previewUrl ? (
            <>
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-fog">
                <span>{previewUrl}</span>
                <a href={previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1">
                  <ExternalLink size={14} />
                  打开
                </a>
              </div>
              <iframe title="preview" src={previewUrl} className="h-[520px] w-full bg-white" />
            </>
          ) : (
            <div className="p-6 text-sm text-fog/70">项目启动后会在这里预览</div>
          )}
        </div>

        
      </div>
    </section>
  )
}
