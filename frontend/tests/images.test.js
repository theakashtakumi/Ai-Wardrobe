import test from 'node:test'
import assert from 'node:assert/strict'
import { imageRequestOptions, normalizeApiBase, resolveApiUrl } from '../src/images.js'
import { buildWearEventPayload } from '../src/wearEvents.js'

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
