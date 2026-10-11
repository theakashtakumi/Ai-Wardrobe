export function buildRequestHeaders(body, token, providedHeaders = {}) {
  const headers = new Headers(providedHeaders)
  if (body instanceof FormData) {
    // Never set multipart Content-Type manually; fetch must add its boundary.
    headers.delete('Content-Type')
  } else if (body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}
