import { useMemo, useState } from 'react'
import WardrobeImage from './WardrobeImage.jsx'

const categoryOptions = ['All pieces', 'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories']
const occasions = ['College', 'Everyday', 'Work', 'Formal events', 'Parties', 'Travel', 'Activewear', 'Family events', 'Date night', 'Weekend', 'Special occasion']
const matchesCategory = (value, filter) => ({
  Tops: /top|shirt|blouse|sweater|knit/i,
  Bottoms: /pant|trouser|jean|skirt|short/i,
  Dresses: /dress|jumpsuit/i,
  Outerwear: /jacket|coat|outer/i,
  Shoes: /shoe|boot|sneaker|sandal/i,
  Accessories: /accessor|bag|belt|hat|scarf/i,
}[filter]?.test(value || '') ?? true)

export default function OutfitBuilder({ wardrobe, token, draft, setDraft, editingId, busy, onSave, onCancel }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All pieces')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const selectedItems = useMemo(() => draft.item_ids.map(id => wardrobe.find(item => item.id === id)).filter(Boolean), [draft.item_ids, wardrobe])
  const filteredItems = useMemo(() => wardrobe.filter(item => (!favoritesOnly || item.favorite) && matchesCategory(item.category, category) && `${item.name} ${item.category} ${item.color}`.toLowerCase().includes(query.toLowerCase())), [wardrobe, favoritesOnly, category, query])
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  const toggleItem = id => update('item_ids', draft.item_ids.includes(id) ? draft.item_ids.filter(itemId => itemId !== id) : [...draft.item_ids, id])
  return <section className="builder-page">
    <section className="page-heading"><div><span className="eyebrow">{editingId ? 'EDIT YOUR LOOK' : draft.provenance === 'recommendation' ? 'MAKE IT YOURS' : 'BUILD A LOOK'}</span><h1>{editingId ? 'Edit outfit' : 'Outfit builder'}</h1><p className="muted">{draft.provenance === 'recommendation' ? 'A recommendation is your starting point. Swap any piece before saving.' : 'Choose the pieces you want to wear together.'}</p></div><div className="builder-heading-actions"><button type="button" className="outline-button" onClick={() => { onCancel(); }}>Cancel</button><button type="button" className="text-button" onClick={onCancel}>Return to wardrobe</button></div></section>
    <form className="builder-layout" onSubmit={onSave}>
      <section className="builder-canvas"><div className="section-head"><div><span className="eyebrow">OUTFIT PREVIEW</span><h2>{draft.name || 'Your look'}</h2></div><button type="button" className="text-button" onClick={() => update('item_ids', [])}>Clear selection</button></div>
        {selectedItems.length ? <div className="builder-selected">{selectedItems.map(item => <article className="builder-piece" key={item.id}><WardrobeImage path={item.image_url} alt={item.name} token={token} className="builder-piece-image" /><div><strong>{item.name}</strong><span>{item.category} · {item.color}</span></div><button type="button" className="icon-btn" aria-label={`Remove ${item.name}`} onClick={() => toggleItem(item.id)}>×</button></article>)}</div> : <div className="builder-empty">Choose one or more pieces. A dress or other one-piece outfit works on its own.</div>}
        {draft.item_ids.length !== selectedItems.length && <p className="form-hint">Some saved pieces were removed from your wardrobe. Remove them from this outfit before saving.</p>}
        <div className="builder-details"><label>Outfit name<input required maxLength="100" value={draft.name} onChange={event => update('name', event.target.value)} placeholder="A name for this look" /></label><div className="form-row"><label>Occasion<select value={draft.occasion || ''} onChange={event => update('occasion', event.target.value)}><option value="">Any occasion</option>{occasions.map(value => <option key={value}>{value}</option>)}</select></label><label>Season<input maxLength="40" value={draft.season || ''} onChange={event => update('season', event.target.value)} placeholder="Optional" /></label></div><label>Style<input maxLength="80" value={draft.style || ''} onChange={event => update('style', event.target.value)} placeholder="Optional style note" /></label><label>Description<textarea maxLength="500" value={draft.description || ''} onChange={event => update('description', event.target.value)} rows="2" placeholder="What makes this combination work?" /></label><label>Notes<textarea maxLength="1000" value={draft.notes || ''} onChange={event => update('notes', event.target.value)} rows="2" placeholder="Optional reminders" /></label><label className="checkbox-line"><input type="checkbox" checked={Boolean(draft.favorite)} onChange={event => update('favorite', event.target.checked)} /> Favorite this outfit</label><button className="primary full" disabled={busy || !draft.item_ids.length || draft.item_ids.length !== selectedItems.length}>{busy ? 'Saving…' : editingId ? 'Update outfit' : 'Save outfit'}</button></div>
      </section>
      <section className="builder-wardrobe"><div className="section-head"><div><span className="eyebrow">YOUR WARDROBE</span><h2>Choose pieces</h2></div><button type="button" className={`filter-toggle ${favoritesOnly ? 'selected' : ''}`} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(value => !value)}>Favorites</button></div><div className="searchbox"><input aria-label="Search builder wardrobe" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your pieces" /></div><div className="filter-pills builder-filters">{categoryOptions.map(value => <button type="button" key={value} className={category === value ? 'selected' : ''} onClick={() => setCategory(value)}>{value}</button>)}</div><div className="builder-item-grid">{filteredItems.map(item => { const selected = draft.item_ids.includes(item.id); return <button type="button" key={item.id} className={`builder-item ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => toggleItem(item.id)}><WardrobeImage path={item.image_url} alt={item.name} token={token} className="builder-thumb" /><span>{item.name}</span><small>{item.category}</small><b aria-hidden="true">{selected ? '✓' : '+'}</b></button> })}</div>{wardrobe.length === 0 && <p className="muted">Add clothing to your wardrobe before building an outfit.</p>}{wardrobe.length > 0 && filteredItems.length === 0 && <p className="muted">No pieces match those filters.</p>}</section>
    </form>
  </section>
}
