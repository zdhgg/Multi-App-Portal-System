import { describe, expect, it } from 'vitest'
import { applyPickedPathToEditableList } from '@/utils/pathAccessList'

describe('pathAccessList', () => {
  it('优先复用空白行而不是继续追加到底部', () => {
    expect(
      applyPickedPathToEditableList(['', '   ', 'D:\\Existing'], 'D:\\My Programs')
    ).toEqual({
      duplicate: false,
      paths: ['D:\\My Programs', '   ', 'D:\\Existing']
    })
  })

  it('没有空白行时追加到末尾', () => {
    expect(
      applyPickedPathToEditableList(['D:\\Existing'], 'D:\\My Programs')
    ).toEqual({
      duplicate: false,
      paths: ['D:\\Existing', 'D:\\My Programs']
    })
  })

  it('忽略大小写识别重复路径', () => {
    expect(
      applyPickedPathToEditableList(['D:\\My Programs'], 'd:\\my programs')
    ).toEqual({
      duplicate: true,
      paths: ['D:\\My Programs']
    })
  })
})
