import { describe, expect, test } from 'vitest'
import { parseNettopLine } from '../../electron/services/nettopParser'

describe('parseNettopLine', () => {
  test('returns null for empty line', () => {
    expect(parseNettopLine('')).toBeNull()
    expect(parseNettopLine('   ')).toBeNull()
  })

  test('returns null for header line', () => {
    expect(parseNettopLine('time,,bytes_in,bytes_out,')).toBeNull()
    expect(parseNettopLine(',,bytes_in,bytes_out')).toBeNull()
  })

  test('parses standard data row', () => {
    expect(parseNettopLine(',Chrome.12345,1234567,890123,')).toEqual({
      name: 'Chrome',
      pid: 12345,
      rxBytes: 1234567,
      txBytes: 890123,
    })
  })

  test('handles process name with spaces', () => {
    expect(parseNettopLine(',Google Chrome Helper.5678,100,200,')).toEqual({
      name: 'Google Chrome Helper',
      pid: 5678,
      rxBytes: 100,
      txBytes: 200,
    })
  })

  test('handles multi-segment names with sub-suffix (.GPU, .Renderer)', () => {
    expect(parseNettopLine(',Google Chrome Helper.GPU.9999,50,75,')).toEqual({
      name: 'Google Chrome Helper.GPU',
      pid: 9999,
      rxBytes: 50,
      txBytes: 75,
    })
  })

  test('handles PID 0 (kernel)', () => {
    expect(parseNettopLine(',kernel_task.0,1000,500,')).toEqual({
      name: 'kernel_task',
      pid: 0,
      rxBytes: 1000,
      txBytes: 500,
    })
  })

  test('returns null for malformed line missing fields', () => {
    expect(parseNettopLine(',Chrome.123,1234')).toBeNull()
    expect(parseNettopLine('garbage data here')).toBeNull()
  })

  test('parses numbers with thousands separator', () => {
    expect(parseNettopLine(',Chrome.123,"1,234,567","890,123",')).toEqual({
      name: 'Chrome',
      pid: 123,
      rxBytes: 1234567,
      txBytes: 890123,
    })
  })
})
