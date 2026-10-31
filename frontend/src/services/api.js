import axios from 'axios'

// Vacío = misma origen (nginx proxea /api → backend).
// Solo en DEV sin variable usamos localhost del backend.
const envUrl = import.meta.env.VITE_API_URL
const baseURL =
  envUrl !== undefined
    ? envUrl
    : import.meta.env.DEV
      ? 'http://localhost:8080'
      : ''

const api = axios.create({
  baseURL,
})

api.interceptors.request.use((config) => {
  if (config.skipAuth) {
    return config
  }

  const token = localStorage.getItem('token')
  const headers = config.headers || {}
  const existing =
    headers.Authorization ||
    headers.authorization ||
    (typeof headers.get === 'function' ? headers.get('Authorization') : null)

  // No pisar un Authorization ya enviado (ej. login → /me con token nuevo)
  if (token && !existing) {
    headers.Authorization = `Bearer ${token}`
    config.headers = headers
  }

  return config
})

// El backend en Render (plan free) se duerme tras ~15 min sin uso y tarda
// ~1 min en arrancar; mientras tanto el proxy devuelve 502/503/504.
export const BACKEND_WAKE_EVENT = 'energyai:backend-wake'
const WAKE_STATUSES = new Set([502, 503, 504])
const WAKE_MAX_MS = 150000
const WAKE_POLL_MS = 3000
const WAKE_NOTICE_DELAY_MS = 2500

let wakePromise = null

function notifyWake(waking) {
  window.dispatchEvent(new CustomEvent(BACKEND_WAKE_EVENT, { detail: { waking } }))
}

function isWakeError(error) {
  if (error?.config?.skipWake || error?.code === 'ERR_CANCELED') return false
  const status = error?.response?.status
  return status ? WAKE_STATUSES.has(status) : true
}

async function pingHealth() {
  try {
    const res = await api.get('/actuator/health', {
      skipAuth: true,
      skipWake: true,
      timeout: 20000,
    })
    return res.status === 200
  } catch {
    return false
  }
}

/**
 * Espera a que el backend responda /actuator/health (comparte una sola espera
 * entre todas las llamadas). Muestra el aviso si tarda más de unos segundos.
 * @returns {Promise<boolean>} true si el backend quedó disponible
 */
export function waitForBackend() {
  if (wakePromise) return wakePromise

  wakePromise = (async () => {
    const noticeTimer = setTimeout(() => notifyWake(true), WAKE_NOTICE_DELAY_MS)
    const deadline = Date.now() + WAKE_MAX_MS
    let ok = await pingHealth()
    while (!ok && Date.now() < deadline) {
      notifyWake(true)
      await new Promise((resolve) => setTimeout(resolve, WAKE_POLL_MS))
      ok = await pingHealth()
    }
    clearTimeout(noticeTimer)
    notifyWake(false)
    wakePromise = null
    return ok
  })()

  return wakePromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config
    if (!config || config._wakeRetried || !isWakeError(error)) {
      return Promise.reject(error)
    }
    const ready = await waitForBackend()
    if (!ready) return Promise.reject(error)
    config._wakeRetried = true
    return api(config)
  },
)

const AUTH_PUBLIC_PATHS =['/api/v1/auth/login', '/api/v1/auth/register']

/**
 * Registra un handler global para 401 (sesión vencida).
 * @returns {number} id del interceptor (para eject)
 */
export function setupUnauthorizedInterceptor(onUnauthorized) {
  return api.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status
      const url = String(error?.config?.url || '')
      const skipAuth = Boolean(error?.config?.skipAuth)
      const isPublicAuth = AUTH_PUBLIC_PATHS.some((path) => url.includes(path))
      const hadToken = Boolean(localStorage.getItem('token'))

      if (status === 401 && hadToken && !skipAuth && !isPublicAuth) {
        onUnauthorized?.(error)
      }

      return Promise.reject(error)
    },
  )
}

export default api
