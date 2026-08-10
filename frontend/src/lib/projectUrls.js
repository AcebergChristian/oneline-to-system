function isLocalBrowser() {
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function canUseControllerProxy() {
  if (!isLocalBrowser()) return true
  return window.location.port === '8000'
}

function maybeProxyUrl(kind, projectSlug, rawUrl) {
  if (!rawUrl) return null
  if (!projectSlug || !canUseControllerProxy()) return rawUrl

  try {
    const parsed = new URL(rawUrl)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return kind === 'preview'
        ? `${window.location.origin}/${projectSlug}`
        : `${window.location.origin}/${projectSlug}/api`
    }
  } catch {
    return rawUrl
  }

  return rawUrl
}

export function getProjectPreviewUrl(project, session) {
  const projectSlug = project?.project_slug || session?.project_slug
  const rawUrl = project?.preview_url || session?.preview_url
  return maybeProxyUrl('preview', projectSlug, rawUrl)
}

export function getProjectBackendUrl(project, session) {
  const projectSlug = project?.project_slug || session?.project_slug
  return maybeProxyUrl('api', projectSlug, project?.backend_url)
}
