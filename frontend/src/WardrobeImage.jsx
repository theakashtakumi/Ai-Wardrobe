import { useEffect, useState } from 'react'
import { imageRequestOptions, normalizeApiBase, resolveApiUrl } from './images.js'

const API = normalizeApiBase(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000')

export default function WardrobeImage({ path, alt, token, className = '', fallbackClassName = 'image-fallback' }) {
  const [image, setImage] = useState({ path, source: '', status: path ? 'loading' : 'missing' })
  const current = image.path === path ? image : { path, source: '', status: path ? 'loading' : 'missing' }
  useEffect(() => {
    if (!path) return undefined
    const controller = new AbortController()
    let objectUrl = ''
    const url = resolveApiUrl(path, API)
    fetch(url, { ...imageRequestOptions(token, url, API), signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`Image request failed (${response.status})`); return response.blob() })
      .then(blob => { objectUrl = URL.createObjectURL(blob); setImage({ path, source: objectUrl, status: 'ready' }) })
      .catch(error => { if (error.name !== 'AbortError') setImage({ path, source: '', status: 'error' }) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [path, token])
  if (current.status !== 'ready') return <div className={`${fallbackClassName} ${current.status === 'loading' ? 'image-loading' : 'image-unavailable'}`} role="img" aria-label={current.status === 'loading' ? `Loading ${alt}` : `${alt} unavailable`}><span>{current.status === 'loading' ? 'Loading photo…' : current.status === 'missing' ? 'No photo' : 'Photo unavailable'}</span></div>
  return <img className={className} src={current.source} alt={alt} onError={() => { URL.revokeObjectURL(current.source); setImage({ path, source: '', status: 'error' }) }} />
}
