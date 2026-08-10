import React from 'react'
import { ExternalLink, FolderTree, MonitorSmartphone, Play } from 'lucide-react'
import { getProjectBackendUrl, getProjectPreviewUrl } from '../lib/projectUrls'

function buildFailureDetail(project, runtimeMode) {
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

  if (runtimeMode === 'external') {
    if (failureReason === 'render_config_missing') {
      return {
        title: 'Render 自动部署未配置',
        detail: '主控已经切到独立 Render service 模式，但服务端还缺少 Render API 配置，无法自动创建项目服务。',
        prompt: '请为主控配置 RENDER_API_KEY、RENDER_OWNER_ID、RENDER_REPO_URL，并确认已开启 RENDER_AUTO_CREATE，然后重新部署主控并再次点击部署项目。',
      }
    }

    if (failureReason === 'render_service_create_failed') {
      return {
        title: 'Render 服务创建失败',
        detail: '主控已尝试调用 Render API 创建当前项目的前后端服务，但创建请求失败。',
        prompt: '请检查 Render API 配置、workspace 权限、仓库地址、分支和项目目录结构，修复后再次点击部署项目。',
      }
    }

    if (failureReason === 'render_repo_sync_failed') {
      return {
        title: 'Git 同步失败',
        detail: 'Render 创建独立 service 时只能从 Git 仓库拉代码。主控已尝试把当前 project 推送到目标分支，但推送失败了。',
        prompt: '请检查 RENDER_GIT_REMOTE_URL、RENDER_REPO_BRANCH 和 Git 推送权限，确认主控能把当前 project 推送到远端仓库，然后再次点击部署项目。',
      }
    }

    if (failureReason === 'deployment_url_missing') {
      return {
        title: '部署地址还没登记完整',
        detail: '当前是 Render 独立服务模式。自动创建未完成时，至少需要有真实的前端和后端公网地址才能继续检查。',
        prompt: '请检查当前 project 的独立部署状态，确认 frontend 和 backend 已分别部署成功；如果主控未自动回填地址，就把真实公网地址保存到部署地址输入框里，然后重新检查部署。',
      }
    }

    if (failureReason === 'backend_unreachable') {
      return {
        title: '后端部署地址不可达',
        detail: `已登记的后端地址 ${backendUrl} 健康检查失败，说明独立后端服务没有真正对外可用。`,
        prompt: `请检查当前 project 的独立 backend 服务部署、启动命令、端口和健康检查路径，确认 ${backendUrl} 可访问后再重新检查部署。`,
      }
    }

    if (failureReason === 'frontend_unreachable') {
      return {
        title: '前端部署地址不可达',
        detail: `已登记的前端地址 ${previewUrl} 无法访问，说明独立 frontend 服务没有真正对外可用。`,
        prompt: `请检查当前 project 的独立 frontend 服务部署、构建产物和根路由，确认 ${previewUrl} 可访问后再重新检查部署。`,
      }
    }

    return {
      title: '部署检查失败',
      detail: '主控代理正常，但登记的独立项目服务还没有对外可用，具体错误见下方日志。',
      prompt: '请检查当前 project 的独立 frontend/backend 服务部署日志和公网地址配置，修复后再重新检查部署。',
    }
  }

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
  runtimeMode,
  isLoading,
  deploymentDraft,
  onDeploymentDraftChange,
  onSaveDeployment,
  savingDeployment,
}) {
  const project = projects.find((item) => item.session_id === session?.id)
  const runtimeStatus = project?.runtime_status || 'idle'
  const previewUrl = getProjectPreviewUrl(project, session)
  const backendUrl = getProjectBackendUrl(project, session)
  const upstreamPreviewUrl = project?.preview_url || session?.preview_url || ''
  const upstreamBackendUrl = project?.backend_url || session?.backend_url || ''
  const hasFailedStart = Boolean(
    showFailureAnalysis && project?.started_at && runtimeStatus === 'failed' && (project?.stdout || project?.stderr),
  )
  const failureDetail = hasFailedStart
    ? buildFailureDetail({ ...project, preview_url: previewUrl, backend_url: backendUrl }, runtimeMode)
    : null

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
        {isLoading ? (
          <div className="mb-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
            <div className="mt-4 space-y-3">
              <div className="h-3 w-5/6 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
            </div>
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
            <div>后端接口：{backendUrl || '未识别'}</div>
            <div>运行状态：{runtimeStatus}</div>
            <div>本地记录：`backend/data/sessions/*.json` 与 `backend/data/logs/*.jsonl`</div>
          </div>
          {runtimeMode === 'external' ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-fog/70">Deployment URLs</div>
              <div className="text-xs text-fog/70">
                外部模式下，点击上面的按钮会优先让主控自动创建 `{project_slug}-frontend` 和 `{project_slug}-api` 两个 Render service。
              </div>
              <div className="text-xs text-fog/70">
                如果这些 project 是 AI 在运行时新写出来的，主控还需要先把 `project/${session?.project_slug || 'projectN'}` 推到 Git 分支，Render 才能拉到源码。下面输入框是手动覆盖入口。
              </div>
              <div className="text-xs text-fog/70">
                对外预览仍然走当前域名下的 `/{session?.project_slug || 'projectN'}` 和 `/{session?.project_slug || 'projectN'}/api`。
              </div>
              <input
                type="url"
                value={deploymentDraft?.preview_url || ''}
                onChange={(event) => onDeploymentDraftChange?.('preview_url', event.target.value)}
                placeholder="真实前端地址，例如 https://project6-frontend.onrender.com"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-sand outline-none placeholder:text-fog/50"
              />
              <input
                type="url"
                value={deploymentDraft?.backend_url || ''}
                onChange={(event) => onDeploymentDraftChange?.('backend_url', event.target.value)}
                placeholder="真实后端地址，例如 https://project6-api.onrender.com"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-sand outline-none placeholder:text-fog/50"
              />
              <div className="text-xs text-fog/70">
                当前上游前端：{upstreamPreviewUrl || '未保存'}
              </div>
              <div className="text-xs text-fog/70">
                当前上游后端：{upstreamBackendUrl || '未保存'}
              </div>
              <button
                type="button"
                onClick={onSaveDeployment}
                disabled={!session || savingDeployment}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-fog disabled:opacity-60"
              >
                {savingDeployment ? '保存中...' : '保存部署地址'}
              </button>
            </div>
          ) : null}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={onStartProject}
              disabled={!session || startingProject || isLoading}
              className="flex items-center gap-2 rounded-2xl bg-ember px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              <Play size={16} />
              {startingProject ? (runtimeMode === 'external' ? '处理中...' : '启动中...') : runtimeMode === 'external' ? '部署/检查项目' : '启动项目'}
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
          {isLoading ? (
            <div className="p-6 text-sm text-fog/70">项目数据加载中...</div>
          ) : previewUrl ? (
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
