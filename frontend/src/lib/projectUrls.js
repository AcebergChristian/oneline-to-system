function rewriteLocalhostUrl(rawUrl) {
  if (!rawUrl) return rawUrl

  try {
    const parsed = new URL(rawUrl)
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return rawUrl
    }

    parsed.protocol = window.location.protocol
    parsed.hostname = window.location.hostname
    return parsed.toString()
  } catch {
    return rawUrl
  }
}

export function getProjectPreviewUrl(project, session) {
  return rewriteLocalhostUrl(project?.preview_url || session?.preview_url || '')
}

export function getProjectBackendUrl(project, session) {
  return rewriteLocalhostUrl(project?.backend_url || session?.backend_url || '')
}
