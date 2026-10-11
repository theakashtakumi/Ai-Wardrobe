import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import './Milestone.css'
import { ApiRequestError, extractErrorMessage } from './errors.js'
import { buildRequestHeaders } from './request.js'
import { normalizeApiBase, resolveApiUrl } from './images.js'
import ProfilePanel from './ProfilePanel.jsx'
import WardrobeImage from './WardrobeImage.jsx'
import OutfitBuilder from './OutfitBuilder.jsx'
import SavedOutfits from './SavedOutfits.jsx'

const API = normalizeApiBase(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000')
const categories = ['All pieces', 'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories']
const occasions = ['College', 'Everyday', 'Work', 'Formal events', 'Parties', 'Travel', 'Activewear', 'Family events', 'Date night', 'Weekend', 'Special occasion']
const todayLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
function fitsCategory(category = '', filter) {
  const patterns = { Tops: /top|shirt|blouse|sweater|knit/i, Bottoms: /pant|trouser|jean|skirt|short/i, Dresses: /dress|jumpsuit/i, Outerwear: /jacket|coat|outer/i, Shoes: /shoe|boot|sneaker|sandal/i, Accessories: /accessor|bag|belt|hat|scarf/i }
  return Boolean(patterns[filter]?.test(category))
}

function Icon({ name, size = 18 }) {
  const paths = { home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></>, closet: <><path d="M4 4h16v17H4zM12 4v17m-3-9h.01m5.99 0h.01" /></>, spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></>, saved: <><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></>, settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8z" /></>, plus: <path d="M12 5v14m-7-7h14" />, search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>, heart: <path d="M20.8 8.7c0 5.5-8.8 11-8.8 11S3.2 14.2 3.2 8.7a4.5 4.5 0 0 1 8.8-1.2 4.5 4.5 0 0 1 8.8 1.2z" />, close: <path d="m18 6-12 12M6 6l12 12" />, hanger: <><path d="M9 7a3 3 0 1 1 5.2 2L12 11l8 5a1.7 1.7 0 0 1-.9 3H4.9a1.7 1.7 0 0 1-.9-3l8-5" /></>, arrow: <><path d="M5 12h14m-7-7 7 7-7 7" /></>, logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></> }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

async function api(path, token, options = {}) {
  const headers = buildRequestHeaders(options.body, token, options.headers)
  const response = await fetch(resolveApiUrl(path, API), { credentials: 'include', ...options, headers })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new ApiRequestError(data, response.status)
  return data
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('wardrobe-token') || '')
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('Overview')
  const [wardrobe, setWardrobe] = useState([])
  const [outfits, setOutfits] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [preferences, setPreferences] = useState({ styles: [], colors: [], occasions: [], avoid_colors: [], neutral_colors: [], accent_colors: [], fit: '', layering: false, comfort_formality: 50, seasons: [], warm_weather: false, cold_layering: false, rain_conscious: false, variety: 50, avoid_recent: false, exclude_disliked: false })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All pieces')
  const [notice, setNoticeValue] = useState('')
  const [dialog, setDialog] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState('')
  const [builderDraft, setBuilderDraft] = useState(null)
  const [editingOutfitId, setEditingOutfitId] = useState(null)

  const setNotice = useCallback((value) => {
    setNoticeValue(typeof value === 'string' ? value : extractErrorMessage(value))
  }, [])

  const showError = useCallback((error, context) => {
    if (import.meta.env.DEV) {
      const diagnostic = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected non-error value'
      console.error(`[${context}]`, { status: error?.status, name: error?.name, message: diagnostic })
    }
    setNotice(extractErrorMessage(error))
  }, [setNotice])

  const loadData = useCallback(async (access = token) => {
    if (!access) { setLoading(false); return }
    setLoading(true)
    try {
      const [items, saved, prefs] = await Promise.all([api('/wardrobe', access), api('/outfits', access), api('/preferences', access)])
      setWardrobe(items); setOutfits(saved); setPreferences(prefs); setUser(await api('/auth/me', access))
    } catch (error) {
      const message = extractErrorMessage(error)
      showError(error, 'load wardrobe')
      if (message.includes('Sign in') || message.includes('expired')) signOut()
    } finally { setLoading(false) }
  }, [token, showError])

  // Loading remote state is an external synchronization, not derived state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (!notice) return undefined; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer) }, [notice, setNotice])
  const filtered = useMemo(() => wardrobe.filter(item => {
    const text = `${item.name} ${item.category} ${item.color} ${item.season || ''}`.toLowerCase()
    const match = text.includes(query.toLowerCase())
    if (filter === 'Favorites') return match && item.favorite
    return match && (filter === 'All pieces' || fitsCategory(item.category, filter))
  }), [wardrobe, query, filter])

  function signOut() { localStorage.removeItem('wardrobe-token'); setToken(''); setUser(null); setWardrobe([]); setOutfits([]); setDialog('') }
  async function authenticate(event) {
    event.preventDefault(); setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const result = await api(`/auth/${authMode === 'register' ? 'register' : 'login'}`, '', { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password'), name: data.get('name') }) })
      localStorage.setItem('wardrobe-token', result.token); setToken(result.token); setUser(result.user); setDialog(''); setNotice(`Welcome${result.user.name ? `, ${result.user.name.split(' ')[0]}` : ''}!`); await loadData(result.token)
    } catch (error) { showError(error, 'sign in') } finally { setBusy(false) }
  }
  async function addClothing(event) {
    event.preventDefault(); setBusy(true)
    const data = new FormData(event.currentTarget)
    if (!data.get('file')) {
      setNotice('Choose a clothing photo before adding this piece.')
      setBusy(false)
      return
    }
    try { const item = await api('/wardrobe', token, { method: 'POST', body: data }); setWardrobe(v => [item, ...v]); setDialog(''); setPreview(''); setNotice(item.analysis_warning ? `${item.name} was saved. ${item.analysis_warning}` : `${item.name} is now in your wardrobe.`) }
    catch (error) { showError(error, 'add clothing') } finally { setBusy(false) }
  }
  async function updateItem(event) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true)
    try { const item = await api(`/wardrobe/${selected.id}`, token, { method: 'PATCH', body: JSON.stringify(data) }); setWardrobe(v => v.map(i => i.id === item.id ? item : i)); setDialog(''); setNotice('Changes saved.') }
    catch (error) { showError(error, 'update clothing') } finally { setBusy(false) }
  }
  async function toggleFavorite(item) {
    try { const updated = await api(`/wardrobe/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ favorite: !item.favorite }) }); setWardrobe(v => v.map(i => i.id === item.id ? updated : i)) } catch (error) { showError(error, 'API request') }
  }
  async function deleteItem(item) {
    if (!window.confirm(`Remove ${item.name} from your wardrobe?`)) return
    try { await api(`/wardrobe/${item.id}`, token, { method: 'DELETE' }); setWardrobe(v => v.filter(i => i.id !== item.id)); setDialog(''); setNotice('Piece removed.') } catch (error) { showError(error, 'API request') }
  }
  async function loadRecommendations(occasion = '') {
    setBusy(true)
    try { const data = await api(`/recommendations${occasion ? `?occasion=${encodeURIComponent(occasion)}` : ''}`, token); setRecommendations(data.recommendations); setPage('Outfit ideas'); if (data.message) setNotice(data.message) }
    catch (error) { showError(error, 'API request') } finally { setBusy(false) }
  }
  async function saveOutfit(combo) {
    openBuilder(combo)
  }
async function sendFeedback(rating, combo = null) {
    try { await api('/feedback', token, { method: 'POST', body: JSON.stringify({ rating, item_ids: combo?.items.map(item => item.id) }) }); setNotice('Thanks — your feedback will shape future outfit ideas.') } catch (error) { showError(error, 'API request') }
  }
  async function markWorn(item) {
    try { await api(`/wardrobe/${item.id}/wear`, token, { method: 'POST' }); setWardrobe(v => v.map(i => i.id === item.id ? { ...i, wear_count: (i.wear_count || 0) + 1 } : i)); setDialog(''); setNotice('Wear recorded. Lovely choice.') } catch (error) { showError(error, 'API request') }
  }
  async function savePreferences(event) {
    event.preventDefault(); setBusy(true)
    try { setPreferences(await api('/preferences', token, { method: 'PUT', body: JSON.stringify(preferences) })); setNotice('Your style profile is updated.') } catch (error) { showError(error, 'save style profile') } finally { setBusy(false) }
  }
  async function resetPreferences() {
    if (!window.confirm('Reset your style profile to its defaults?')) return
    setBusy(true)
    try { setPreferences(await api('/preferences', token, { method: 'PUT', body: JSON.stringify({ styles: [], colors: [], occasions: [], avoid_colors: [], neutral_colors: [], accent_colors: [], fit: '', layering: false, comfort_formality: 50, seasons: [], warm_weather: false, cold_layering: false, rain_conscious: false, variety: 50, avoid_recent: false, exclude_disliked: false }) })); setNotice('Style profile reset.') } catch (error) { showError(error, 'reset style profile') } finally { setBusy(false) }
  }
  function openBuilder(combo = null) {
    const items = combo?.items || []
    setBuilderDraft({ name: combo ? items.map(item => item.name).join(' + ') : '', occasion: combo?.occasion || '', description: combo?.reasons?.join('. ') || '', notes: '', style: '', season: '', favorite: false, provenance: combo ? 'recommendation' : 'manual', item_ids: items.map(item => item.id) })
    setEditingOutfitId(null); setPage('Outfit builder')
  }
  function editOutfit(outfit) {
    setBuilderDraft({ name: outfit.name, occasion: outfit.occasion || '', description: outfit.description || '', notes: outfit.notes || '', style: outfit.style || '', season: outfit.season || '', favorite: Boolean(outfit.favorite), provenance: outfit.provenance || 'manual', item_ids: outfit.item_ids || outfit.items.map(item => item.id) })
    setEditingOutfitId(outfit.id); setPage('Outfit builder')
  }
  async function saveBuilder(event) {
    event.preventDefault()
    if (!builderDraft?.item_ids.length) { setNotice('Choose at least one wardrobe piece.'); return }
    setBusy(true)
    try {
      await api(editingOutfitId ? `/outfits/${editingOutfitId}` : '/outfits', token, { method: editingOutfitId ? 'PUT' : 'POST', body: JSON.stringify(builderDraft) })
      setOutfits(await api('/outfits', token))
      setBuilderDraft(null); setEditingOutfitId(null); setPage('Saved outfits'); setNotice(editingOutfitId ? 'Outfit updated.' : 'Outfit saved.')
    } catch (error) { showError(error, 'save outfit') } finally { setBusy(false) }
  }
  async function deleteOutfit(outfit) {
    if (!window.confirm(`Delete “${outfit.name}”?`)) return
    try { await api(`/outfits/${outfit.id}`, token, { method: 'DELETE' }); setOutfits(current => current.filter(item => item.id !== outfit.id)); setNotice('Outfit deleted.') } catch (error) { showError(error, 'delete outfit') }
  }
  function duplicateOutfit(outfit) {
    setBuilderDraft({ name: `${outfit.name} copy`, occasion: outfit.occasion || '', description: outfit.description || '', notes: outfit.notes || '', style: outfit.style || '', season: outfit.season || '', favorite: false, provenance: 'manual', item_ids: outfit.item_ids || outfit.items.map(item => item.id) })
    setEditingOutfitId(null); setPage('Outfit builder')
  }
  async function toggleOutfitFavorite(outfit) {
    if (!outfit.item_ids?.length) { setNotice('Add wardrobe pieces to this outfit before favoriting it.'); return }
    try {
      await api(`/outfits/${outfit.id}`, token, { method: 'PUT', body: JSON.stringify({ name: outfit.name, occasion: outfit.occasion, description: outfit.description, notes: outfit.notes, style: outfit.style, season: outfit.season, favorite: !outfit.favorite, provenance: outfit.provenance, item_ids: outfit.item_ids }) })
      setOutfits(await api('/outfits', token))
    } catch (error) { showError(error, 'favorite outfit') }
  }
async function replaceImage(event) {
    const data = new FormData(); data.append('file', event.target.files[0])
    try { await api(`/wardrobe/${selected.id}/image`, token, { method: 'PUT', body: data }); setDialog(''); await loadData(); setNotice('Photo updated.') } catch (error) { showError(error, 'API request') }
  }

  if (!token || !user) return <div className="auth-shell"><div className="auth-art"><div className="brand brand-light"><span className="brand-mark">a</span> atelier</div><div className="auth-copy"><span className="eyebrow">YOUR WARDROBE, REIMAGINED</span><h1>Get dressed<br />with a little more<br /><em>intention.</em></h1><p>A calmer closet starts with knowing what you own.</p><div className="auth-image" /></div><div className="auth-foot">A personal space for your everyday style.</div></div><div className="auth-panel"><form className="auth-form" onSubmit={authenticate}><span className="eyebrow">WELCOME TO ATELIER</span><h2>{authMode === 'login' ? 'Your style, in one place.' : 'Make room for better outfits.'}</h2><p className="muted">{authMode === 'login' ? 'Sign in to open your personal wardrobe.' : 'Create a private space for the pieces you love.'}</p>{authMode === 'register' && <label>Your name<input name="name" placeholder="Alex Morgan" required maxLength="80" /></label>}<label>Email address<input name="email" type="email" placeholder="you@example.com" required autoComplete="email" /></label><label>Password<input name="password" type="password" minLength="8" placeholder="At least 8 characters" required autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} /></label><button className="primary full" disabled={busy}>{busy ? 'One moment…' : authMode === 'login' ? 'Sign in' : 'Create account'} <Icon name="arrow" /></button><p className="switch-auth">{authMode === 'login' ? 'New here?' : 'Already have an account?'} <button type="button" className="text-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Create an account' : 'Sign in'}</button></p><p className="privacy-note">Your wardrobe is private and belongs to your account.</p></form></div>{notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="close" size={15} /></button></div>}</div>

  const nav = [['Overview', 'home'], ['My wardrobe', 'closet'], ['Outfit ideas', 'spark'], ['Outfit builder', 'plus'], ['Saved outfits', 'saved'], ['Style profile', 'settings']]
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#overview" onClick={() => setPage('Overview')}><span className="brand-mark">a</span> atelier</a><span className="nav-label">YOUR SPACE</span><nav>{nav.map(([label, icon]) => <button key={label} onClick={() => label === 'Outfit ideas' ? loadRecommendations() : label === 'Outfit builder' ? openBuilder() : setPage(label)} className={`nav-item ${page === label ? 'active' : ''}`}><Icon name={icon} /><span>{label}</span>{label === 'My wardrobe' && <small>{wardrobe.length}</small>}</button>)}</nav><div className="sidebar-bottom"><div className="profile-chip"><div className="avatar">{user.name?.slice(0,1).toUpperCase()}</div><div><strong>{user.name}</strong><span>Personal account</span></div><button className="icon-btn logout" onClick={async () => { try { await api('/auth/logout', token, { method: 'POST' }) } finally { signOut() } }} title="Sign out"><Icon name="logout" /></button></div><span className="sidebar-caption">Thoughtful style, every day.</span></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb">My space <span>/</span> <strong>{page}</strong></div><div className="top-actions"><span className="sync-status"><i /> Your space is private</span><button className="avatar mini" title="Account settings" onClick={() => setPage('Style profile')}>{user.name?.slice(0,1).toUpperCase()}</button></div></header>
      {page === 'Overview' && <><section className="welcome-row"><div><span className="eyebrow">{todayLabel}</span><h1>A closet that feels like <em>you.</em></h1><p className="muted">A little inspiration for getting dressed today.</p></div><button className="primary" onClick={() => { setPreview(''); setDialog('add') }}><Icon name="plus" /> Add a piece</button></section><section className="hero-card"><div className="hero-copy"><span className="pill"><Icon name="spark" size={14} /> YOUR DAILY EDIT</span><h2>Good style begins<br />with what you own.</h2><p>Explore new combinations from your own closet, made for the way you like to dress.</p><button className="dark-button" onClick={() => loadRecommendations()}>Find an outfit <Icon name="arrow" size={16} /></button></div><div className="hero-photo"><span className="photo-note">the pieces you love,<br />worn a new way</span></div></section><section className="section-head"><div><span className="eyebrow">A QUICK LOOK</span><h2>Your wardrobe, at a glance</h2></div><button className="link-button" onClick={() => setPage('My wardrobe')}>See everything <Icon name="arrow" size={15} /></button></section><div className="stat-grid"><button className="stat-card" onClick={() => setPage('My wardrobe')}><span className="stat-icon sage"><Icon name="closet" /></span><span className="stat-num">{wardrobe.length}</span><span className="stat-label">pieces in your closet</span><span className="stat-foot">Your personal collection <Icon name="arrow" size={14} /></span></button><button className="stat-card" onClick={() => setPage('Saved outfits')}><span className="stat-icon blush"><Icon name="saved" /></span><span className="stat-num">{outfits.length}</span><span className="stat-label">outfits saved</span><span className="stat-foot">Looks to come back to <Icon name="arrow" size={14} /></span></button><button className="stat-card" onClick={() => loadRecommendations()}><span className="stat-icon lilac"><Icon name="spark" /></span><span className="stat-num">{wardrobe.length > 1 ? 'Ready' : '—'}</span><span className="stat-label">for a fresh combination</span><span className="stat-foot">Made from what you own <Icon name="arrow" size={14} /></span></button></div><div className="section-head recent-head"><div><span className="eyebrow">RECENTLY ADDED</span><h2>New to your closet</h2></div></div>{wardrobe.length ? <div className="item-grid compact">{wardrobe.slice(0, 4).map(item => <ClothingCard key={item.id} item={item} token={token} onOpen={() => { setSelected(item); setDialog('detail') }} onFavorite={() => toggleFavorite(item)} />)}</div> : <EmptyState onAdd={() => setDialog('add')} />}</>}
      {page === 'My wardrobe' && <><section className="page-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h1>My wardrobe</h1><p className="muted">Every good outfit starts with a piece you already love.</p></div><button className="primary" onClick={() => { setPreview(''); setDialog('add') }}><Icon name="plus" /> Add a piece</button></section><div className="wardrobe-toolbar"><div className="searchbox"><Icon name="search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your pieces…" aria-label="Search wardrobe" /></div><div className="filter-pills">{[...categories, 'Favorites'].map(c => <button key={c} className={filter === c ? 'selected' : ''} onClick={() => setFilter(c)}>{c}</button>)}</div><span className="result-count">{filtered.length} {filtered.length === 1 ? 'piece' : 'pieces'}</span></div>{loading ? <div className="loading-state">Gathering your favorite things…</div> : filtered.length ? <div className="item-grid">{filtered.map(item => <ClothingCard key={item.id} item={item} token={token} onOpen={() => { setSelected(item); setDialog('detail') }} onFavorite={() => toggleFavorite(item)} />)}</div> : <EmptyState onAdd={() => setDialog('add')} filtered={wardrobe.length > 0} />}</>}
      {page === 'Outfit ideas' && <><section className="page-heading"><div><span className="eyebrow">A LITTLE INSPIRATION</span><h1>Outfit ideas</h1><p className="muted">Thoughtful combinations from pieces already in your wardrobe.</p></div><button className="primary" onClick={() => loadRecommendations()} disabled={busy}><Icon name="spark" /> {busy ? 'Finding ideas…' : 'Refresh ideas'}</button></section><div className="occasion-row"><span>Set the mood</span>{occasions.map(o => <button key={o} className="occasion-chip" onClick={() => loadRecommendations(o)}>{o}</button>)}</div>{recommendations.length ? <><div className="recommend-grid">{recommendations.map((combo, i) => <article className="recommend-card" key={combo.items.map(x => x.id).join('-')}><div className="recommend-images">{combo.items.map(item => <WardrobeImage key={item.id} path={item.image_url} alt={item.name} token={token} className="outfit-image" />)}<span className="score-badge">{combo.score}% match</span></div><div className="recommend-body"><span className="eyebrow">LOOK {String(i + 1).padStart(2, '0')}{combo.occasion ? ` · ${combo.occasion.toUpperCase()}` : ''}</span><h3>{combo.items.map(x => x.name).join(' + ')}</h3><ul>{combo.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><button className="outline-button" onClick={() => saveOutfit(combo)}><Icon name="saved" size={16} /> Customize this outfit</button><div className="pair-feedback"><span>Was this pairing useful?</span><button type="button" onClick={() => sendFeedback(5, combo)}>Yes</button><button type="button" onClick={() => sendFeedback(1, combo)}>Not for me</button></div></div></article>)}</div><div className="feedback-strip"><span>Are these ideas your style?</span><div>{[1,2,3,4,5].map(n => <button key={n} onClick={() => sendFeedback(n)} aria-label={`${n} out of 5 stars`}>{n <= 3 ? '☆' : '★'}</button>)}</div></div></> : <div className="ideas-empty"><span className="empty-icon"><Icon name="spark" size={26} /></span><h2>Good things pair well.</h2><p>{wardrobe.length < 2 ? 'Add at least two pieces and we’ll find combinations hiding in your closet.' : 'Choose an occasion or refresh ideas to find a combination that feels right.'}</p>{wardrobe.length >= 2 && <button className="primary" onClick={() => loadRecommendations()}>Find my first outfit <Icon name="arrow" /></button>}</div>}</>}
      {page === 'Legacy saved outfits' && <><section className="page-heading"><div><span className="eyebrow">YOUR PERSONAL LOOKBOOK</span><h1>Saved outfits</h1><p className="muted">The combinations you want to remember.</p></div><button className="outline-button" onClick={() => loadRecommendations()}><Icon name="spark" /> Find more looks</button></section>{outfits.length ? <div className="saved-list">{outfits.map(outfit => <article className="saved-card" key={outfit.id}><div className="saved-images">{outfit.items.map(i => <WardrobeImage key={i.id} path={i.image_url} alt={i.name} token={token} className="saved-image" />)}</div><div className="saved-info"><span className="eyebrow">{outfit.occasion || 'YOUR LOOKBOOK'}</span><h3>{outfit.name}</h3><p>{outfit.items.map(i => i.name).join(' · ')}</p></div><button className="icon-btn remove-btn" onClick={async () => { if (!window.confirm('Remove this saved outfit?')) return; try { await api(`/outfits/${outfit.id}`, token, { method: 'DELETE' }); setOutfits(v => v.filter(x => x.id !== outfit.id)) } catch (e) { showError(e, 'API request') } }} aria-label="Delete saved outfit"><Icon name="close" /></button></article>)}</div> : <EmptyState onAdd={() => loadRecommendations()} title="Your lookbook is waiting." text="Save outfit ideas you love and they’ll be right here." action="Find outfit ideas" />}</>}
      {page === 'Legacy style profile' && <><section className="page-heading"><div><span className="eyebrow">A MORE PERSONAL EDIT</span><h1>Your style profile</h1><p className="muted">Tell us what feels like you. Your outfit ideas will take it into account.</p></div></section><form className="preferences-card" onSubmit={savePreferences}><PreferenceGroup title="Styles you gravitate toward" name="styles" options={['Minimal', 'Classic', 'Relaxed', 'Streetwear', 'Romantic', 'Preppy', 'Bohemian']} values={preferences.styles} /><PreferenceGroup title="Colors you love wearing" name="colors" options={['Neutrals', 'Black', 'White', 'Blue', 'Earth tones', 'Pastels', 'Bright colors']} values={preferences.colors} /><PreferenceGroup title="Where you get dressed" name="occasions" options={occasions} values={preferences.occasions} /><button className="primary">Save my preferences <Icon name="arrow" /></button><div className="privacy-inline"><span className="sync-status"><i /> Private to your account</span><button type="button" className="text-button danger" onClick={async () => { if (!window.confirm('Delete your account and all wardrobe data? This cannot be undone.')) return; try { await api('/auth/account', token, { method: 'DELETE' }); signOut() } catch (e) { showError(e, 'API request') } }}>Delete my account</button></div></form><div className="ai-note"><Icon name="spark" /><div><strong>AI clothing analysis</strong><p>Analysis is optional and uses your local Ollama vision model only when configured. Your images stay on this computer.</p></div></div></>}
    {page === 'Style profile' && <ProfilePanel preferences={preferences} setPreferences={setPreferences} onSave={savePreferences} onReset={resetPreferences} busy={busy} onDeleteAccount={async () => { if (!window.confirm('Delete your account and all wardrobe data? This cannot be undone.')) return; try { await api('/auth/account', token, { method: 'DELETE' }); signOut() } catch (error) { showError(error, 'delete account') } }} />}
    {page === 'Outfit builder' && builderDraft && <OutfitBuilder wardrobe={wardrobe} token={token} draft={builderDraft} setDraft={setBuilderDraft} editingId={editingOutfitId} busy={busy} onSave={saveBuilder} onCancel={() => { const returnPage = editingOutfitId ? 'Saved outfits' : 'My wardrobe'; setBuilderDraft(null); setEditingOutfitId(null); setPage(returnPage) }} />}
    {page === 'Saved outfits' && <SavedOutfits outfits={outfits} token={token} onCreate={() => openBuilder()} onEdit={editOutfit} onDuplicate={duplicateOutfit} onDelete={deleteOutfit} onFavorite={toggleOutfitFavorite} onFindIdeas={loadRecommendations} />}
    </main>
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="close" size={15} /></button></div>}
    {dialog === 'add' && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setDialog('')}><form className="modal" onSubmit={addClothing}><div className="modal-head"><div><span className="eyebrow">GIVE A FAVORITE A HOME</span><h2>Add a piece</h2></div><button type="button" className="icon-btn" onClick={() => { setDialog(''); setPreview('') }} aria-label="Close"><Icon name="close" /></button></div><ImageDrop preview={preview} onFile={file => { if (!file) return; if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8*1024*1024) { setNotice('Choose a JPG, PNG, or WebP under 8 MB.'); return } setPreview(URL.createObjectURL(file)) }} /><label>What do you call it?<input name="name" placeholder="e.g. Sunday linen shirt" maxLength="100" /></label><div className="form-row"><label>Category<select name="category"><option>Unknown</option>{['T-shirt','Shirt','Top','Sweater','Jeans','Trousers','Skirt','Dress','Jacket','Coat','Shoes','Accessories'].map(x => <option key={x}>{x}</option>)}</select></label><label>Color<input name="color" placeholder="e.g. Olive" /></label></div><label className="checkbox-line"><input type="checkbox" name="analyze" value="true" defaultChecked /> Suggest details with AI if configured</label><p className="form-hint">Photo required · JPG, PNG or WebP · 8 MB max</p><button className="primary full" disabled={busy}>{busy ? 'Adding to your closet…' : 'Add to my wardrobe'} <Icon name="arrow" /></button></form></div>}
    {dialog === 'detail' && selected && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setDialog('')}><div className="modal detail-modal"><div className="modal-head"><div><span className="eyebrow">YOUR WARDROBE</span><h2>Piece details</h2></div><button className="icon-btn" onClick={() => setDialog('')} aria-label="Close"><Icon name="close" /></button></div><WardrobeImage className="detail-image" path={selected.image_url} alt={selected.name} token={token} fallbackClassName="detail-image image-fallback" /><form onSubmit={updateItem}><label>Name<input name="name" defaultValue={selected.name} required maxLength="100" /></label><div className="form-row"><label>Category<input name="category" defaultValue={selected.category} /></label><label>Color<input name="color" defaultValue={selected.color} /></label></div><div className="form-row"><label>Season<input name="season" defaultValue={selected.season || ''} placeholder="Unknown" /></label><label>Style<input name="style" defaultValue={selected.style || ''} placeholder="Unknown" /></label></div><div className="detail-actions"><label className="outline-button file-button">Replace photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={replaceImage} hidden /></label><button className="primary">Save changes</button></div></form><div className="modal-bottom"><button className="text-button danger" onClick={() => deleteItem(selected)}>Remove from wardrobe</button><button className="text-button" onClick={() => { markWorn(selected) }}>I wore this today ✓</button></div></div></div>}
  </div>
}

function ClothingCard({ item, onOpen, onFavorite, token }) { return <article className="clothing-card"><button className="clothing-photo" onClick={onOpen} aria-label={`View ${item.name}`}><WardrobeImage path={item.image_url} alt={item.name} token={token} className="clothing-card-image" fallbackClassName="no-image" /><span className="category-tag">{item.category || 'Clothing'}</span></button><div className="clothing-info"><button className="clothing-name" onClick={onOpen}>{item.name}</button><button className={`favorite-btn ${item.favorite ? 'liked' : ''}`} onClick={onFavorite} aria-label={item.favorite ? 'Remove favorite' : 'Add favorite'}><Icon name="heart" size={19} /></button><span>{item.color || 'Color unknown'}{item.season ? ` · ${item.season}` : ''}</span></div></article> }
function EmptyState({ onAdd, filtered = false, title, text, action }) { return <div className="empty-state"><span className="empty-icon"><Icon name="hanger" size={27} /></span><h2>{title || (filtered ? 'No pieces found.' : 'A lovely closet starts here.')}</h2><p>{text || (filtered ? 'Try another search or category.' : 'Add a photo of something you love wearing. It’ll feel good to see everything in one place.')}</p><button className="primary" onClick={onAdd}>{action || (filtered ? 'Clear your search' : 'Add your first piece')} <Icon name="arrow" /></button></div> }
function ImageDrop({ preview, onFile }) { return <label className={`image-drop ${preview ? 'has-preview' : ''}`}><input type="file" name="file" accept="image/jpeg,image/png,image/webp" onChange={e => onFile(e.target.files[0])} required={!preview} hidden />{preview ? <><img src={preview} alt="Selected clothing preview" /><span>Choose a different photo</span></> : <><span className="upload-icon"><Icon name="plus" /></span><strong>Drop a photo here, or browse</strong><span>JPG, PNG or WebP · up to 8 MB</span></>}</label> }
function PreferenceGroup({ title, name, options, values = [] }) { return <fieldset className="preference-group"><legend>{title}</legend><div className="preference-options">{options.map(option => <label className={`preference-option ${values.includes(option) ? 'checked' : ''}`} key={option}><input type="checkbox" name={name} value={option} defaultChecked={values.includes(option)} />{option}</label>)}</div></fieldset> }

export default App


