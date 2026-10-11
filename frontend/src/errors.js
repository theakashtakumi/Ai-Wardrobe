const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'
const NETWORK_MESSAGE = 'Can’t reach Ai-Wardrobe right now. Check that the backend is running, then try again.'

function fieldLabel(location = []) {
  const field = location.filter((part) => part !== 'body' && part !== 'query' && part !== 'path').at(-1)
  if (!field) return ''
  if (field === 'file') return 'image'
  return String(field).replaceAll('_', ' ')
}

function validationMessage(errors) {
  if (!Array.isArray(errors)) return ''
  const messages = errors.map((issue) => {
    if (!issue || typeof issue !== 'object') return ''
    const field = fieldLabel(issue.loc)
    if (issue.msg === 'Field required' && field === 'image') return 'Please choose an image file.'
    if (issue.msg === 'Field required' && field) return `Please provide ${field}.`
    if (typeof issue.msg === 'string' && issue.msg.trim()) {
      return field ? `Please check ${field}: ${issue.msg.replace(/^Value error,\s*/i, '')}` : issue.msg
    }
    return ''
  }).filter(Boolean)
  return [...new Set(messages)].slice(0, 2).join(' ')
}

function fromStructured(value, depth = 0) {
  if (depth > 3 || value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return validationMessage(value)
  if (typeof value !== 'object') return ''
  for (const key of ['detail', 'message', 'error', 'title', 'errors']) {
    if (value[key] !== undefined) {
      const message = fromStructured(value[key], depth + 1)
      if (message) return message
    }
  }
  return ''
}

export function extractErrorMessage(error) {
  if (typeof error === 'string') return error.trim() || FALLBACK_MESSAGE
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return NETWORK_MESSAGE
  if (error instanceof ApiRequestError) return fromStructured(error.payload) || FALLBACK_MESSAGE
  const structured = fromStructured(error)
  if (structured && structured !== '[object Object]') return structured
  return FALLBACK_MESSAGE
}

export class ApiRequestError extends Error {
  constructor(payload, status) {
    super(extractErrorMessage(payload))
    this.name = 'ApiRequestError'
    this.payload = payload
    this.status = status
  }
}

