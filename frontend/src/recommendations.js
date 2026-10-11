export function buildRecommendationUrl(occasion, weather) {
  const params = new URLSearchParams()
  if (occasion) params.set('occasion', occasion)
  const hasWeather = weather && ['temperature_c', 'precipitation_mm', 'weather_code'].some(key => weather[key] !== null && weather[key] !== undefined && weather[key] !== '')
  if (hasWeather) {
    for (const key of ['temperature_c', 'precipitation_mm', 'weather_code']) {
      if (weather[key] !== null && weather[key] !== undefined && weather[key] !== '') params.set(key, String(weather[key]))
    }
    params.set('weather_source', weather.source || 'manual')
    if (weather.location) params.set('weather_location', weather.location)
    if (weather.retrieved_at) params.set('weather_retrieved_at', weather.retrieved_at)
  }
  const query = params.toString()
  return `/recommendations${query ? `?${query}` : ''}`
}
