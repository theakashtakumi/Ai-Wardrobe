import test from 'node:test'
import assert from 'node:assert/strict'
import { imageRequestOptions, normalizeApiBase, resolveApiUrl } from '../src/images.js'

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
