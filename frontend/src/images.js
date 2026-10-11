export function normalizeApiBase(base) {
  return String(base || 'http://127.0.0.1:8000').replace(/\/+$/, '')
}

export function resolveApiUrl(path, base) {
  if (typeof path !== 'string' || !path.trim()) return ''
  const normalizedBase = normalizeApiBase(base)
  try {
    if (/^https?:\/\//i.test(path)) return new URL(path).toString()
    const apiRoot = new URL(`${normalizedBase}/`)
    return new URL(path.replace(/^\/+/, ''), apiRoot).toString()
  } catch {
    return ''
  }
}

export function imageRequestOptions(token, imageUrl, base) {
  const headers = {}
  try {
    if (token && new URL(imageUrl).origin === new URL(normalizeApiBase(base)).origin) {
      headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // An invalid image URL is rejected by the caller without sending credentials.
  }
  return { credentials: 'include', headers }
}
