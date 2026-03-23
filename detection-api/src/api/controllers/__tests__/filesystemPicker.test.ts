import { describe, expect, it, vi } from 'vitest'
import { parseWindowsFolderPickerOutput } from '../filesystemPicker'

describe('parseWindowsFolderPickerOutput', () => {
  it('parses JSON payload from PowerShell folder picker', () => {
    const output = '{"cancelled":false,"path":"D:\\\\My Programs"}'

    const result = parseWindowsFolderPickerOutput(output, vi.fn(() => true))

    expect(result).toEqual({
      cancelled: false,
      path: 'D:\\My Programs'
    })
  })

  it('parses legacy marker output with quoted path and extra logs', () => {
    const output = [
      'Some informational line',
      '__FOLDER_PICKER_SELECTED__"D:\\My Programs"',
      ''
    ].join('\r\n')

    const result = parseWindowsFolderPickerOutput(output, vi.fn(path => path === 'D:\\My Programs'))

    expect(result).toEqual({
      cancelled: false,
      path: 'D:\\My Programs'
    })
  })

  it('returns cancelled when the picker reports a cancellation', () => {
    const output = '{"cancelled":true,"path":null}'

    const result = parseWindowsFolderPickerOutput(output)

    expect(result).toEqual({ cancelled: true })
  })

  it('prefers the existing candidate when output contains multiple path-like lines', () => {
    const output = [
      'Directory: C:\\Windows\\System32',
      '__FOLDER_PICKER_SELECTED__D:\\My Programs',
      'C:\\Temp'
    ].join('\r\n')

    const result = parseWindowsFolderPickerOutput(output, vi.fn(path => path === 'D:\\My Programs'))

    expect(result).toEqual({
      cancelled: false,
      path: 'D:\\My Programs'
    })
  })
})
