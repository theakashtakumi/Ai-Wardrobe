import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiRequestError, extractErrorMessage } from '../src/errors.js'
import { buildRequestHeaders } from '../src/request.js'

test('extracts string errors and FastAPI detail messages', () => {
  assert.equal(extractErrorMessage('Image rejected'), 'Image rejected')
  assert.equal(extractErrorMessage({ detail: 'Unsupported image format' }), 'Unsupported image format')
  assert.equal(extractErrorMessage({ error: 'Upload failed' }), 'Upload failed')
})

test('turns FastAPI validation arrays into concise field-specific messages', () => {
  assert.equal(extractErrorMessage({ detail: [{ type: 'missing', loc: ['body', 'file'], msg: 'Field required' }] }), 'Please choose an image file.')
  assert.equal(extractErrorMessage(new ApiRequestError({ detail: [
    { type: 'missing', loc: ['body', 'file'], msg: 'Field required' },
    { type: 'missing', loc: ['body', 'name'], msg: 'Field required' },
  ] }, 422)), 'Please choose an image file. Please provide name.')
})

test('handles structured errors, network failures, and unexpected objects safely', () => {
  assert.equal(extractErrorMessage({ error: { message: 'Database is unavailable' } }), 'Database is unavailable')
  assert.match(extractErrorMessage(new TypeError('Failed to fetch')), /backend is running/)
  assert.equal(extractErrorMessage({ code: 'UNKNOWN' }), 'Something went wrong. Please try again.')
  assert.equal(extractErrorMessage(new Error('[object Object]')), 'Something went wrong. Please try again.')
})

test('leaves multipart Content-Type to the browser and preserves auth headers', () => {
  const form = new FormData()
  form.append('name', 'Blue shirt')
  const headers = buildRequestHeaders(form, 'session-token', { 'Content-Type': 'application/json', 'X-Trace': 'upload' })
  assert.equal(headers.has('Content-Type'), false)
  assert.equal(headers.get('Authorization'), 'Bearer session-token')
  assert.equal(headers.get('X-Trace'), 'upload')
  assert.equal(buildRequestHeaders(JSON.stringify({ name: 'shirt' }), '', {}).get('Content-Type'), 'application/json')
})

