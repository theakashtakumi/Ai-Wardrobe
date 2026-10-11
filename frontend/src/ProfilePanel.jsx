const styleOptions = ['Casual', 'Minimal', 'Streetwear', 'Smart casual', 'Formal', 'Classic', 'Sporty', 'Preppy', 'Vintage', 'Elegant', 'Romantic', 'Experimental', 'Relaxed', 'Bohemian']
const colorOptions = ['Black', 'White', 'Gray', 'Navy', 'Blue', 'Green', 'Olive', 'Red', 'Pink', 'Purple', 'Yellow', 'Orange', 'Brown', 'Tan', 'Cream', 'Beige', 'Earth tones', 'Pastels', 'Bright colors']
const neutralOptions = ['Black', 'White', 'Gray', 'Navy', 'Brown', 'Tan', 'Cream', 'Beige']
const accentOptions = ['Red', 'Pink', 'Purple', 'Yellow', 'Orange', 'Green', 'Blue']
const occasionOptions = ['College', 'Everyday', 'Work', 'Formal events', 'Parties', 'Travel', 'Activewear', 'Family events', 'Date night', 'Weekend', 'Special occasion']
const seasonOptions = ['Spring', 'Summer', 'Autumn', 'Winter']

function ChoiceGroup({ title, name, options, values = [], onToggle, help }) {
  return <fieldset className="preference-group"><legend>{title}</legend>{help && <p className="profile-help">{help}</p>}<div className="preference-options">{options.map(option => <label className={`preference-option ${values.includes(option) ? 'checked' : ''}`} key={option}><input type="checkbox" checked={values.includes(option)} onChange={() => onToggle(name, option)} />{option}</label>)}</div></fieldset>
}

export default function ProfilePanel({ preferences, setPreferences, onSave, onReset, busy, onDeleteAccount }) {
  const toggle = (key, value) => setPreferences(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] }))
  return <section className="profile-page">
    <section className="page-heading"><div><span className="eyebrow">A MORE PERSONAL EDIT</span><h1>Your style profile</h1><p className="muted">These are preferences, not rules. They help rank ideas when your wardrobe has matching details.</p></div></section>
    <form className="preferences-card profile-form" onSubmit={onSave}>
      <ChoiceGroup title="Styles you gravitate toward" name="styles" options={styleOptions} values={preferences.styles} onToggle={toggle} help="Choose a few styles that feel like you." />
      <ChoiceGroup title="Favorite colors" name="colors" options={colorOptions} values={preferences.colors} onToggle={toggle} />
      <ChoiceGroup title="Colors to avoid" name="avoid_colors" options={colorOptions} values={preferences.avoid_colors} onToggle={toggle} help="Matching item colors lower a recommendation score." />
      <ChoiceGroup title="Preferred neutrals" name="neutral_colors" options={neutralOptions} values={preferences.neutral_colors} onToggle={toggle} />
      <ChoiceGroup title="Accent colors" name="accent_colors" options={accentOptions} values={preferences.accent_colors} onToggle={toggle} />
      <ChoiceGroup title="Common occasions" name="occasions" options={occasionOptions} values={preferences.occasions} onToggle={toggle} />
      <ChoiceGroup title="Preferred seasons" name="seasons" options={seasonOptions} values={preferences.seasons} onToggle={toggle} />
      <div className="profile-controls">
        <label>Fit preference<select value={preferences.fit} onChange={event => setPreferences(current => ({ ...current, fit: event.target.value }))}><option value="">No preference</option>{['Relaxed', 'Regular', 'Slim', 'Oversized'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Comfort to formality <span className="range-label">{preferences.comfort_formality < 34 ? 'Comfort first' : preferences.comfort_formality > 66 ? 'More formal' : 'Balanced'}</span><input type="range" min="0" max="100" value={preferences.comfort_formality} onChange={event => setPreferences(current => ({ ...current, comfort_formality: Number(event.target.value) }))} /></label>
        <label>Outfit variety <span className="range-label">{preferences.variety < 34 ? 'Familiar favorites' : preferences.variety > 66 ? 'More variety' : 'Balanced'}</span><input type="range" min="0" max="100" value={preferences.variety} onChange={event => setPreferences(current => ({ ...current, variety: Number(event.target.value) }))} /></label>
      </div>
      <div className="profile-checks">{[['layering', 'I enjoy layering'], ['warm_weather', 'Prioritize warm-weather pieces'], ['cold_layering', 'Suggest cold-weather layers'], ['rain_conscious', 'Consider rain-conscious pieces'], ['avoid_recent', 'Avoid recently worn pieces when possible'], ['exclude_disliked', 'Exclude combinations I rated poorly']].map(([key, label]) => <label key={key} className="profile-check"><input type="checkbox" checked={Boolean(preferences[key])} onChange={event => setPreferences(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div>
      <div className="profile-actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save style profile'}</button><button type="button" className="outline-button" disabled={busy} onClick={onReset}>Reset to defaults</button><span className="sync-status"><i /> Saved privately to your account</span></div>
      <div className="privacy-inline"><button type="button" className="text-button danger" onClick={onDeleteAccount}>Delete my account</button></div>
    </form>
    <div className="ai-note"><strong>AI clothing analysis</strong><p>Analysis is optional and uses your local Ollama vision model only when configured. Your images stay on this computer.</p></div>
  </section>
}
