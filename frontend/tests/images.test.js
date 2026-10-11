import test from 'node:test'
import assert from 'node:assert/strict'
import { imageRequestOptions, normalizeApiBase, resolveApiUrl } from '../src/images.js'
import { buildWearEventPayload } from '../src/wearEvents.js'
import { buildRecommendationUrl } from '../src/recommendations.js'

test('API base normalization and image URL resolution handle trailing slashes and absolute references', () => {
  assert.equal(normalizeApiBase('http://localhost:8000///'), 'http://localhost:8000')
  assert.equal(resolveApiUrl('/uploads/piece.png', 'http://localhost:8000/'), 'http://localhost:8000/uploads/piece.png')
  assert.equal(resolveApiUrl('/uploads/piece.png', 'http://localhost:8000/api/'), 'http://localhost:8000/api/uploads/piece.png')
  assert.equal(resolveApiUrl('/wardrobe', 'http://localhost:8000/api/'), 'http://localhost:8000/api/wardrobe')
  assert.equal(resolveApiUrl('wardrobe', 'http://localhost:8000/api/'), 'http://localhost:8000/api/wardrobe')
  assert.equal(resolveApiUrl('http://api.example.test/uploads/piece.png', 'http://localhost:8000'), 'http://api.example.test/uploads/piece.png')
})

test('image fetch attaches bearer credentials only to the configured API origin', () => {
  assert.deepEqual(imageRequestOptions('session-token', 'http://localhost:8000/uploads/a.png', 'http://localhost:8000/'), {
    credentials: 'include', headers: { Authorization: 'Bearer session-token' },
  })
  assert.deepEqual(imageRequestOptions('session-token', 'https://images.example.test/a.png', 'http://localhost:8000'), {
    credentials: 'include', headers: {},
  })
  assert.deepEqual(imageRequestOptions('', 'http://localhost:8000/uploads/a.png', 'http://localhost:8000'), {
    credentials: 'include', headers: {},
  })
})

test('wear event payload deduplicates selected clothing and preserves retry idempotency keys', () => {
  const fields = { wornOn: '2026-10-11', itemIds: ['shirt-1', 'pants-2', 'shirt-1'], outfitId: '', occasion: '', notes: '' }
  const firstAttempt = buildWearEventPayload(fields, 'stable-request-key')
  const retry = buildWearEventPayload(fields, 'stable-request-key')
  const nextEvent = buildWearEventPayload(fields, 'next-request-key')
  assert.deepEqual(firstAttempt, { worn_on: '2026-10-11', item_ids: ['shirt-1', 'pants-2'], outfit_id: null, occasion: null, notes: null, request_id: 'stable-request-key' })
  assert.deepEqual(retry, firstAttempt)
  assert.notEqual(nextEvent.request_id, firstAttempt.request_id)
})

test('recommendation requests identify provider weather separately from manual weather', () => {
  assert.equal(buildRecommendationUrl('Work', null), '/recommendations?occasion=Work')
  assert.equal(buildRecommendationUrl('', { temperature_c: 7, precipitation_mm: 0, weather_code: 3, source: 'open-meteo', location: 'Pune, Maharashtra, India', retrieved_at: '2026-10-11T12:00:00Z' }), '/recommendations?temperature_c=7&precipitation_mm=0&weather_code=3&weather_source=open-meteo&weather_location=Pune%2C+Maharashtra%2C+India&weather_retrieved_at=2026-10-11T12%3A00%3A00Z')
  assert.equal(buildRecommendationUrl('Travel', { temperature_c: 31, precipitation_mm: 2, weather_code: 61, source: 'manual' }), '/recommendations?occasion=Travel&temperature_c=31&precipitation_mm=2&weather_code=61&weather_source=manual')
  assert.equal(buildRecommendationUrl('', { source: 'manual', temperature_c: null, precipitation_mm: null, weather_code: null }), '/recommendations')
})
