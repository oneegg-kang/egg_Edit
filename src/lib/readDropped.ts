// 브라우저에서 끌어다 놓은 것 / 고른 것을 UploadPlan 으로 바꾼다.

import { isIgnoredName, type UploadPlan } from '../data/uploadTree'

/**
 * 끌어다 놓은 파일과 폴더를 읽는다.
 * 주의: dataTransfer 는 drop 이벤트가 끝나면 비워지므로, 이 함수는 drop 핸들러 안에서 await 전에 바로 불러야 한다.
 */
export function readDataTransfer(dt: DataTransfer): Promise<UploadPlan> {
  // 이벤트가 끝나기 전에 항목을 먼저 붙잡아 둔다
  const entries = [...dt.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.() ?? null)
  const looseFiles = entries.every((e) => e === null) ? [...dt.files] : []

  return (async () => {
    const plan: UploadPlan = { dirs: [], files: looseFiles.filter((f) => !isIgnoredName(f.name)).map((file) => ({ path: [], file })) }
    for (const entry of entries) if (entry) await walk(entry, [], plan)
    return plan
  })()
}

async function walk(entry: FileSystemEntry, path: string[], plan: UploadPlan): Promise<void> {
  if (isIgnoredName(entry.name)) return
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    plan.files.push({ path, file })
    return
  }
  if (entry.isDirectory) {
    const dirPath = [...path, entry.name]
    plan.dirs.push(dirPath)
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries 는 한 번에 일부(보통 100개)만 주므로 빈 배열이 나올 때까지 반복한다
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      if (batch.length === 0) break
      for (const child of batch) await walk(child, dirPath, plan)
    }
  }
}

/** <input type="file" webkitdirectory> 로 고른 폴더. 각 파일의 webkitRelativePath 로 구조를 알아낸다. */
export function readDirectoryInput(files: FileList): UploadPlan {
  const plan: UploadPlan = { dirs: [], files: [] }
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/')
    const name = parts.pop()!
    if (isIgnoredName(name) || parts.some(isIgnoredName)) continue
    plan.files.push({ path: parts, file })
  }
  return plan
}
