const DEFAULT_PORT = 18792
const DEFAULT_HOST = '127.0.0.1'

function clampPort(value) {
  const n = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(n)) return DEFAULT_PORT
  if (n <= 0 || n > 65535) return DEFAULT_PORT
  return n
}

function sanitizeHost(raw) {
  let h = (raw || '').trim()
  h = h.replace(/^(?:https?|wss?):\/\//, '')
  h = h.replace(/\/.*$/, '')
  if (h.startsWith('[')) {
    h = h.replace(/\]:\d+$/, ']')
  } else if ((h.match(/:/g) || []).length === 1) {
    h = h.replace(/:\d+$/, '')
  }
  return h || DEFAULT_HOST
}

function formatHost(host) {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`
  return host
}

function updateRelayUrl(host, port) {
  const el = document.getElementById('relay-url')
  if (!el) return
  el.textContent = `http://${formatHost(host)}:${port}/`
}

function setStatus(kind, message) {
  const status = document.getElementById('status')
  if (!status) return
  status.dataset.kind = kind || ''
  status.textContent = message || ''
}

async function checkRelayReachable(host, port) {
  const h = formatHost(host)
  const url = `http://${h}:${port}/`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 900)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    setStatus('ok', `Relay reachable at ${url}`)
  } catch {
    setStatus(
      'error',
      `Relay not reachable at ${url}. Make sure the OpenClaw gateway is running on the configured host and port.`,
    )
  } finally {
    clearTimeout(t)
  }
}

async function load() {
  const stored = await chrome.storage.local.get(['relayPort', 'relayHost'])
  const port = clampPort(stored.relayPort)
  const host = sanitizeHost(stored.relayHost)
  document.getElementById('port').value = String(port)
  document.getElementById('host').value = host === DEFAULT_HOST ? '' : host
  updateRelayUrl(host, port)
  await checkRelayReachable(host, port)
}

async function save() {
  const portInput = document.getElementById('port')
  const hostInput = document.getElementById('host')
  const port = clampPort(portInput.value)
  const host = sanitizeHost(hostInput.value)
  await chrome.storage.local.set({ relayPort: port, relayHost: host === DEFAULT_HOST ? '' : host })
  portInput.value = String(port)
  hostInput.value = host === DEFAULT_HOST ? '' : host
  updateRelayUrl(host, port)
  await checkRelayReachable(host, port)
}

document.getElementById('save').addEventListener('click', () => void save())
void load()
