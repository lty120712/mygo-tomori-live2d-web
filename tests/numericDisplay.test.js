import test from 'node:test'
import assert from 'node:assert/strict'
import { numericDisplay } from '../src/numericDisplay.js'

test('pixel and angle displays round to integers', () => {
  const d = numericDisplay('@x', { min: -1920, max: 1920, step: 1 })
  assert.equal(d.toDisplay(-205.328), -205)
  assert.equal(d.toNative('123.9'), 124)
  assert.equal(d.unit, '')
})
test('fractional controls round-trip integer percentages in native units', () => {
  for (const key of ['@scale', '@opacity', 'PARAM_EYE_BALL_X']) {
    const d = numericDisplay(key, { min: -1, max: 1, step: .01 })
    assert.equal(d.toDisplay(.85), 85)
    assert.equal(d.toNative(85), .85)
    assert.equal(d.min, -100)
    assert.equal(d.max, 100)
    assert.equal(d.unit, '%')
  }
  assert.equal(numericDisplay('PARAM_ANGLE_X', { step: 1, min: -30, max: 30 }).toDisplay(12.6), 13)
})
