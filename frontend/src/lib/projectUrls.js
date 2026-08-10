function isLocalBrowser() {
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function maybeProxyUrl(kind, sessionId, rawUrl) {
  if (!rawUrl || !sessionId || isLocalBrowser()) return rawUrl || null

  try {
    const parsed = new URL(rawUrl)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return `${window.location.origin}/${kind}/${sessionId}`
    }
  } catch {
    return rawUrl
  }

  return rawUrl
}

export function getProjectPreviewUrl(project, session) {
  const sessionId = session?.id || project?.session_id
  const rawUrl = project?.preview_url || session?.preview_url
  return maybeProxyUrl('project-preview', sessionId, rawUrl)
}

export function getProjectBackendUrl(project, session) {
  const sessionId = session?.id || project?.session_id
  return maybeProxyUrl('project-api', sessionId, project?.backend_url)
}
