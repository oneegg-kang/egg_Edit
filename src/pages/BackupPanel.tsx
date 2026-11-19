import { useRef, useState } from 'react'
import { backupFileName, createBackup, restoreBackup } from '../backup/backup'
import type { VaultBackend } from '../data/types'
import { saveFile } from '../lib/platform'

export function BackupPanel({
  backend,
  userId,
  onRestored,
}: {
  backend: VaultBackend
  userId: string
  onRestored?: () => void
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function run(task: () => Promise<string>) {
    setBusy(true)
    try {
      setStatus(await task())
    } catch (e) {
      setStatus(`실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const download = () =>
    run(async () => {
      const blob = await createBackup(backend, setStatus)
      const r = await saveFile(blob, backupFileName())
      if (r === 'cancelled') return '백업 저장을 취소했습니다.'
      return `${r ?? '백업 파일을 내려받았습니다.'} 안전한 곳(PC, 외장 디스크, 다른 클라우드)에 보관하세요.`
    })

  const restore = (file: File) =>
    run(async () => {
      if (!confirm(`'${file.name}' 을(를) 복원합니다. 같은 항목은 백업 내용으로 덮어씁니다. 계속할까요?`)) {
        return '복원을 취소했습니다.'
      }
      const m = await restoreBackup(backend, file, userId, setStatus)
      onRestored?.()
      return `복원 완료: 폴더 ${m.counts.folders}개, 항목 ${m.counts.items}개, 파일 ${m.counts.files}개 (${new Date(m.exported_at).toLocaleString()} 백업)`
    })

  return (
    <section className="card">
      <h2>백업</h2>
      <p className="muted">
        모든 폴더, 글, 그림, 파일, 음악을 ZIP 파일 하나로 내려받습니다. 서버가 사라져도 이 파일만 있으면 내용을 직접
        열어 보거나 새 서버로 복원할 수 있습니다.
      </p>
      <div className="row">
        <button onClick={download} disabled={busy}>
          백업 내려받기
        </button>
        <button className="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
          백업 복원
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) restore(f)
          }}
        />
      </div>
      {status && <p className="message">{status}</p>}
    </section>
  )
}
