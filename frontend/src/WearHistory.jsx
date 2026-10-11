import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildWearEventPayload } from './wearEvents.js'

const today = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }

export default function WearHistory({ wardrobe, outfits, api, onError, onChanged, initialOutfit, onInitialOutfitHandled }) {
  const [events, setEvents] = useState([])
  const [insights, setInsights] = useState(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [form, setForm] = useState(() => initialOutfit ? { id: null, worn_on: today(), outfit_id: initialOutfit.id, occasion: initialOutfit.occasion || '', notes: '' } : null)
  const [selectedIds, setSelectedIds] = useState(() => initialOutfit ? [...initialOutfit.item_ids] : [])
  const [saving, setSaving] = useState(false)
  const requestId = useRef(initialOutfit ? crypto.randomUUID() : null)

  const dateQuery = useMemo(() => {
    const query = new URLSearchParams()
    if (fromDate) query.set('from_date', fromDate)
    if (toDate) query.set('to_date', toDate)
    return query.size ? `?${query}` : ''
  }, [fromDate, toDate])

  const refresh = useCallback(async () => {
    try {
      const [history, summary] = await Promise.all([api(`/wear-events${dateQuery}`), api(`/insights${dateQuery}`)])
      setEvents(history)
      setInsights(summary)
    } catch (error) { onError(error, 'load wear history') }
  }, [api, dateQuery, onError])

  useEffect(() => {
    if (!initialOutfit) return
    onInitialOutfitHandled()
  }, [initialOutfit, onInitialOutfitHandled])

  useEffect(() => {
    const timer = setTimeout(refresh, 0)
    return () => clearTimeout(timer)
  }, [refresh])

  function startNew(outfit = null) {
    setForm({ id: null, worn_on: today(), outfit_id: outfit?.id || '', occasion: outfit?.occasion || '', notes: '' })
    setSelectedIds(outfit ? [...outfit.item_ids] : [])
    requestId.current = crypto.randomUUID()
  }

  function startEdit(event) {
    setForm({ id: event.id, worn_on: event.worn_on, outfit_id: event.outfit_id || '', occasion: event.occasion || '', notes: event.notes || '' })
    setSelectedIds((event.item_ids || []).filter(id => wardrobe.some(item => item.id === id)))
    requestId.current = null
  }

  function toggleItem(id) {
    setSelectedIds(current => current.includes(id) ? current.filter(itemId => itemId !== id) : [...current, id])
    if (form?.outfit_id) setForm(current => ({ ...current, outfit_id: '' }))
  }

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    if (!selectedIds.length) { onError(new Error('Choose at least one clothing item.'), 'record wear'); return }
    setSaving(true)
    const payload = buildWearEventPayload({ wornOn: form.worn_on, itemIds: selectedIds, outfitId: form.outfit_id, occasion: form.occasion, notes: form.notes }, requestId.current)
    try {
      await api(form.id ? `/wear-events/${form.id}` : '/wear-events', { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      setForm(null)
      requestId.current = null
      await refresh()
      await onChanged()
    } catch (error) { onError(error, 'save wear event') } finally { setSaving(false) }
  }

  async function remove(event) {
    if (!window.confirm('Delete this wear-history entry?')) return
    try {
      await api(`/wear-events/${event.id}`, { method: 'DELETE' })
      await refresh()
      await onChanged()
    } catch (error) { onError(error, 'delete wear event') }
  }

  return <section className="history-page">
    <header className="page-heading"><div><span className="eyebrow">YOUR REAL WEAR DATA</span><h1>History &amp; insights</h1><p className="muted">A record of outfits you logged wearing. No activity is estimated.</p></div><button className="primary" onClick={() => startNew()}>＋ Record an outfit</button></header>
    <section className="history-filters" aria-label="Filter history dates"><label>From<input type="date" value={fromDate} max={toDate || today()} onChange={event => setFromDate(event.target.value)} /></label><label>Through<input type="date" value={toDate} min={fromDate} max={today()} onChange={event => setToDate(event.target.value)} /></label><button className="text-button" onClick={() => { setFromDate(''); setToDate('') }}>Clear dates</button><span>Showing {insights?.total_events ?? '…'} recorded events</span></section>

    {form && <form className="history-form" onSubmit={submit}>
      <div className="section-head"><div><span className="eyebrow">{form.id ? 'UPDATE A RECORD' : 'ADD TO YOUR HISTORY'}</span><h2>{form.id ? 'Edit wear event' : 'What did you wear?'}</h2></div><button type="button" className="text-button" onClick={() => setForm(null)}>Cancel</button></div>
      <div className="history-form-fields"><label>Date worn<input type="date" required max={today()} value={form.worn_on} onChange={event => setForm({ ...form, worn_on: event.target.value })} /></label><label>Saved outfit (optional)<select value={form.outfit_id} onChange={event => { const outfit = outfits.find(value => value.id === event.target.value); setForm({ ...form, outfit_id: event.target.value, occasion: form.occasion || outfit?.occasion || '' }); if (outfit) setSelectedIds([...outfit.item_ids]) }}><option value="">Assemble from clothing</option>{outfits.filter(outfit => outfit.item_ids?.length).map(outfit => <option key={outfit.id} value={outfit.id}>{outfit.name}</option>)}</select></label><label>Occasion (optional)<input maxLength="80" value={form.occasion} onChange={event => setForm({ ...form, occasion: event.target.value })} placeholder="Work, weekend…" /></label></div>
      <fieldset className="history-item-picker"><legend>Clothing worn <span>({selectedIds.length} selected)</span></legend>{wardrobe.length ? <div className="history-item-grid">{wardrobe.map(item => <label key={item.id} className={selectedIds.includes(item.id) ? 'selected' : ''}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleItem(item.id)} /><span>{item.name}</span><small>{item.category}</small></label>)}</div> : <p>Add wardrobe pieces before recording an outfit.</p>}</fieldset>
      <label className="history-notes">Notes (optional)<textarea maxLength="1000" rows="2" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="How did the outfit work for you?" /></label>
      <button className="primary" disabled={saving || !selectedIds.length}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Record wear'}</button>
    </form>}

    {insights?.total_events > 0 ? <>
      <div className="history-stat-grid"><article><span>RECORDED WEARS</span><strong>{insights.total_events}</strong><small>{insights.first_worn_on} – {insights.last_worn_on}</small></article><article><span>TOP CATEGORY</span><strong>{insights.categories[0]?.category || '—'}</strong><small>{insights.categories[0]?.wears || 0} clothing-item wears</small></article><article><span>MOST WORN PIECE</span><strong>{insights.top_items[0]?.name || '—'}</strong><small>{insights.top_items[0]?.wears || 0} recorded wears</small></article></div>
      <div className="insights-grid"><section className="insight-card"><h2>Wear activity</h2><p>Events recorded by date</p><div className="activity-bars">{insights.activity.slice(-30).map(row => <div key={row.worn_on} title={`${row.worn_on}: ${row.events} event${row.events === 1 ? '' : 's'}`}><i style={{ height: `${Math.max(8, Math.min(100, row.events * 22))}%` }} /><small>{row.worn_on.slice(5)}</small></div>)}</div></section><section className="insight-card"><h2>Most worn pieces</h2>{insights.top_items.length ? insights.top_items.slice(0, 6).map(item => <div className="insight-row" key={`${item.id}-${item.name}`}><span>{item.name}<small>{item.category || 'Clothing'}</small></span><b>{item.wears}×</b></div>) : <p>No item details recorded.</p>}</section><section className="insight-card"><h2>Least recently logged</h2><p>Based on this date filter; “Never logged” means no matching event.</p>{insights.least_recent_items.map(item => <div className="insight-row" key={item.id}><span>{item.name}<small>{item.category}</small></span><b>{item.last_worn || 'Never logged'}</b></div>)}</section><section className="insight-card"><h2>Saved outfits worn</h2>{insights.top_outfits.length ? insights.top_outfits.map(outfit => <div className="insight-row" key={`${outfit.id}-${outfit.name}`}><span>{outfit.name}<small>Last worn {outfit.last_worn}</small></span><b>{outfit.wears}×</b></div>) : <p>No saved outfit has been logged yet.</p>}</section></div>
    </> : !form && <div className="history-empty"><span className="eyebrow">START YOUR HISTORY</span><h2>Keep track of what you actually wear.</h2><p>Log a saved look or choose pieces from your wardrobe. Insights and recommendation variety will build from your records.</p><button className="primary" onClick={() => startNew()}>Record your first outfit</button>{outfits.some(outfit => outfit.item_ids?.length) && <div className="history-saved-shortcuts"><span>Or log a saved outfit:</span>{outfits.filter(outfit => outfit.item_ids?.length).slice(0, 3).map(outfit => <button key={outfit.id} onClick={() => startNew(outfit)}>{outfit.name}</button>)}</div>}</div>}

    <section className="history-list"><div className="section-head"><div><span className="eyebrow">YOUR LOG</span><h2>Recent wear history</h2></div></div>{events.length ? events.map(event => <article className="history-event" key={event.id}><div className="history-event-date"><strong>{event.worn_on}</strong><span>{event.outfit_snapshot || event.occasion || 'Assembled outfit'}</span></div><div className="history-event-items">{event.items.map((item, index) => <span key={`${event.id}-${index}`} className={item.deleted ? 'deleted' : ''}>{item.name}{item.deleted ? ' · removed' : ''}</span>)}{event.occasion && <small>{event.occasion}</small>}{event.notes && <p>{event.notes}</p>}</div><div className="history-event-actions"><button className="text-button" onClick={() => startEdit(event)}>Edit</button><button className="text-button danger" onClick={() => remove(event)}>Delete</button></div></article>) : <p className="muted">No wear records in this date range.</p>}</section>
  </section>
}
