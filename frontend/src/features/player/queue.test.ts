import { describe, expect, it } from 'vitest'
import { buildOrder, cycleRepeat, nextPosition, previousAction } from './queue'

describe('cycleRepeat', () => {
  it('F-PL-09 cycles off → all → one → off', () => {
    expect(cycleRepeat('off')).toBe('all')
    expect(cycleRepeat('all')).toBe('one')
    expect(cycleRepeat('one')).toBe('off')
  })
})

describe('nextPosition', () => {
  it('F-PL-03 advances in the middle of the queue', () => {
    expect(nextPosition(1, 4, 'off', 'manual')).toBe(2)
  })
  it('F-PL-04 stops at the end when repeat is off', () => {
    expect(nextPosition(3, 4, 'off', 'manual')).toBeNull()
    expect(nextPosition(3, 4, 'off', 'auto')).toBeNull()
  })
  it('F-PL-05 wraps to the start when repeat is all', () => {
    expect(nextPosition(3, 4, 'all', 'auto')).toBe(0)
    expect(nextPosition(3, 4, 'all', 'manual')).toBe(0)
  })
  it('F-PL-06 repeats the same track on auto-advance with repeat one', () => {
    expect(nextPosition(2, 4, 'one', 'auto')).toBe(2)
  })
  it('manual next with repeat one still moves on', () => {
    expect(nextPosition(2, 4, 'one', 'manual')).toBe(3)
  })
  it('handles an empty queue', () => {
    expect(nextPosition(-1, 0, 'all', 'auto')).toBeNull()
  })
  it('from "before the first" position plays the first track', () => {
    expect(nextPosition(-1, 3, 'off', 'manual')).toBe(0)
  })
})

describe('previousAction', () => {
  it('F-PL-07 restarts when more than 3 seconds elapsed', () => {
    expect(previousAction(2, 3.1)).toEqual({ type: 'restart' })
  })
  it('F-PL-08 goes back when 3 seconds or less elapsed', () => {
    expect(previousAction(2, 3)).toEqual({ type: 'goto', position: 1 })
    expect(previousAction(2, 0)).toEqual({ type: 'goto', position: 1 })
  })
  it('F-PL-08 restarts at the first track', () => {
    expect(previousAction(0, 1)).toEqual({ type: 'restart' })
  })
})

describe('buildOrder', () => {
  const seeded = (values: number[]) => {
    let i = 0
    return () => values[i++ % values.length] as number
  }

  it('is the identity without shuffle', () => {
    expect(buildOrder(4, 2, false)).toEqual([0, 1, 2, 3])
  })

  it('F-PL-10 is a permutation that starts with the current track', () => {
    const order = buildOrder(6, 3, true, seeded([0.9, 0.1, 0.5, 0.3]))
    expect(order[0]).toBe(3)
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('actually reorders the rest', () => {
    const order = buildOrder(8, 0, true, seeded([0.0]))
    expect(order).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('handles empty and single-track queues', () => {
    expect(buildOrder(0, -1, true)).toEqual([])
    expect(buildOrder(1, 0, true)).toEqual([0])
  })
})
