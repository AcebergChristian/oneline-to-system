const API_BASE = 'http://localhost:8000/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }

  return response.json()
}

export const api = {
  listSessions: () => request('/sessions'),
  getSession: (sessionId) => request(`/sessions/${sessionId}`),
  createSession: (prompt) =>
    request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  sendMessage: (sessionId, prompt) =>
    request(`/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  startProject: (sessionId) =>
    request(`/sessions/${sessionId}/start`, {
      method: 'POST',
    }),
  runTool: (sessionId, payload) =>
    request(`/sessions/${sessionId}/tools`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listProjects: () => request('/projects'),
  getConfig: () => request('/config'),
}

export function openSessionStream(sessionId, onEvent) {
  const source = new EventSource(`${API_BASE}/sessions/${sessionId}/stream`)
  source.onmessage = (event) => {
    onEvent(JSON.parse(event.data))
  }
  return source
}
