import { describe, expect, it } from 'vitest'
import { readDirectoryInput } from './readDropped'

const rel = (path: string) => {
  const f = new File(['x'], path.split('/').pop()!)
  Object.defineProperty(f, 'webkitRelativePath', { value: path })
  return f
}

describe('폴더 올리기 버튼', () => {
  it('상대 경로로 폴더 구조를 알아내고 시스템 파일은 뺀다', () => {
    const plan = readDirectoryInput([rel('여행/표지.txt'), rel('여행/2025/사진.txt'), rel('여행/.DS_Store'), rel('여행/__MACOSX/._a')] as unknown as FileList)
    expect(plan.files.map((f) => [...f.path, f.file.name].join('/'))).toEqual(['여행/표지.txt', '여행/2025/사진.txt'])
  })
})
