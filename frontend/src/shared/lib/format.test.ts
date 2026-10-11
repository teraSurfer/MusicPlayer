import { describe, expect, it } from 'vitest'
import { formatDurationMs, formatTime } from './format'

describe('formatTime', () => {
  it('F-SH-03 formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(187)).toBe('3:07')
    expect(formatTime(59.9)).toBe('0:59')
  })
  it('F-SH-03 formats hours', () => {
    expect(formatTime(3723)).toBe('1:02:03')
  })
  it('treats invalid input as zero', () => {
    expect(formatTime(Number.NaN)).toBe('0:00')
    expect(formatTime(-4)).toBe('0:00')
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
  it('converts milliseconds', () => {
    expect(formatDurationMs(187_000)).toBe('3:07')
  })
})
