import { useState, type MouseEvent, type ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { BULLET_STYLES, HIGHLIGHT_COLORS, NUMBER_STYLES, TEXT_COLORS } from './extensions'

type MenuName = 'bullet' | 'ordered' | 'color' | 'table'

/** 문서 편집기 위쪽 도구 막대 */
export function Toolbar({ editor, onPickImages }: { editor: Editor; onPickImages: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      bulletStyle: (e.getAttributes('bulletList').listStyle as string | null) ?? 'disc',
      ordered: e.isActive('orderedList'),
      orderedStyle: (e.getAttributes('orderedList').listStyle as string | null) ?? 'decimal',
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      highlight: (e.getAttributes('highlight').color as string | undefined) ?? (e.isActive('highlight') ? '#fde68a' : null),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      canMerge: e.can().mergeCells(),
      canSplit: e.can().splitCell(),
    }),
  })
  const [menu, setMenu] = useState<{ name: MenuName; x: number; y: number } | null>(null)
  const c = () => editor.chain().focus()
  const close = () => setMenu(null)

  const openMenu = (name: MenuName) => (e: MouseEvent<HTMLButtonElement>) => {
    if (menu?.name === name) return close()
    const r = e.currentTarget.getBoundingClientRect()
    // 도구 막대는 옆으로 스크롤되므로 메뉴는 화면 기준(fixed)으로 띄운다
    setMenu({ name, x: Math.min(r.left, window.innerWidth - 230), y: r.bottom + 4 })
  }

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = prompt('링크 주소 (비우면 링크 해제)', prev ?? 'https://')
    if (url === null) return
    if (url.trim() === '' || url.trim() === 'https://') c().extendMarkRange('link').unsetLink().run()
    else c().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  const setListStyle = (type: 'bulletList' | 'orderedList', style: string) => {
    if (!editor.isActive(type)) {
      if (type === 'bulletList') c().toggleBulletList().run()
      else c().toggleOrderedList().run()
    }
    c().updateAttributes(type, { listStyle: style }).run()
    close()
  }

  const bulletSymbol = BULLET_STYLES.find((b) => b.id === s.bulletStyle)?.label.split(' ')[0] ?? '●'

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="서식">
        <T label="↶" title="되돌리기" run={() => c().undo().run()} disabled={!s.canUndo} />
        <T label="↷" title="다시 하기" run={() => c().redo().run()} disabled={!s.canRedo} />
        <Sep />
        <T label="H1" title="큰 제목" on={s.h1} run={() => c().toggleHeading({ level: 1 }).run()} />
        <T label="H2" title="중간 제목" on={s.h2} run={() => c().toggleHeading({ level: 2 }).run()} />
        <T label="H3" title="작은 제목" on={s.h3} run={() => c().toggleHeading({ level: 3 }).run()} />
        <Sep />
        <T label="B" title="굵게" on={s.bold} run={() => c().toggleBold().run()} />
        <T label="I" title="기울임" on={s.italic} run={() => c().toggleItalic().run()} />
        <T label="U" title="밑줄" on={s.underline} run={() => c().toggleUnderline().run()} />
        <T label="S" title="취소선" on={s.strike} run={() => c().toggleStrike().run()} />
        <button
          type="button"
          className={`tool pen ${menu?.name === 'color' ? 'on' : ''}`}
          title="펜 색 (글자 색, 형광펜)"
          aria-label="펜 색"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openMenu('color')}
        >
          <span className="pen-a" style={{ background: s.highlight ?? undefined }}>
            A
          </span>
          <span className="pen-bar" style={{ background: s.color ?? 'var(--text)' }} />
        </button>
        <T label="🔗" title="링크" on={s.link} run={setLink} />
        <Sep />
        <button
          type="button"
          className={`tool list ${s.bullet ? 'on' : ''}`}
          title="글머리 기호 목록"
          aria-label="글머리 기호 목록"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => c().toggleBulletList().run()}
        >
          {bulletSymbol}≡
        </button>
        <button type="button" className="tool caret" title="글머리 기호 모양" aria-label="글머리 기호 모양" onMouseDown={(e) => e.preventDefault()} onClick={openMenu('bullet')}>
          ▾
        </button>
        <button
          type="button"
          className={`tool list ${s.ordered ? 'on' : ''}`}
          title="번호 목록"
          aria-label="번호 목록"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => c().toggleOrderedList().run()}
        >
          1≡
        </button>
        <button type="button" className="tool caret" title="번호 모양" aria-label="번호 모양" onMouseDown={(e) => e.preventDefault()} onClick={openMenu('ordered')}>
          ▾
        </button>
        <T label="☑" title="체크리스트" on={s.task} run={() => c().toggleTaskList().run()} />
        <Sep />
        <T label="🖼" title="이미지 넣기" run={onPickImages} />
        <button
          type="button"
          className={`tool ${s.table || menu?.name === 'table' ? 'on' : ''}`}
          title="표"
          aria-label="표"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openMenu('table')}
        >
          ⊞
        </button>
        <T label="❝" title="인용" on={s.quote} run={() => c().toggleBlockquote().run()} />
        <T label="</>" title="코드" on={s.code} run={() => c().toggleCodeBlock().run()} />
        <T label="―" title="구분선" run={() => c().setHorizontalRule().run()} />
      </div>

      {s.table && (
        <div className="toolbar table-bar" role="toolbar" aria-label="표 편집">
          <span className="table-bar-label">⊞ 표</span>
          <T label="↑ 행" title="위에 행 넣기" run={() => c().addRowBefore().run()} />
          <T label="↓ 행" title="아래에 행 넣기" run={() => c().addRowAfter().run()} />
          <T label="← 열" title="왼쪽에 열 넣기" run={() => c().addColumnBefore().run()} />
          <T label="→ 열" title="오른쪽에 열 넣기" run={() => c().addColumnAfter().run()} />
          <Sep />
          <T label="행 삭제" title="이 행 지우기" run={() => c().deleteRow().run()} />
          <T label="열 삭제" title="이 열 지우기" run={() => c().deleteColumn().run()} />
          <Sep />
          <T label="합치기" title="고른 칸 합치기" run={() => c().mergeCells().run()} disabled={!s.canMerge} />
          <T label="나누기" title="합친 칸 나누기" run={() => c().splitCell().run()} disabled={!s.canSplit} />
          <T label="머리글" title="첫 행을 머리글로" run={() => c().toggleHeaderRow().run()} />
          <Sep />
          <T label="표 삭제" title="표 전체 지우기" run={() => c().deleteTable().run()} />
        </div>
      )}

      {menu && (
        <>
          <div className="menu-backdrop" onClick={close} />
          <div className="menu pop" style={{ left: menu.x, top: menu.y }} role="menu">
            {menu.name === 'bullet' &&
              BULLET_STYLES.map((b) => (
                <MenuItem key={b.id} on={s.bullet && s.bulletStyle === b.id} run={() => setListStyle('bulletList', b.id)}>
                  {b.label}
                </MenuItem>
              ))}
            {menu.name === 'ordered' &&
              NUMBER_STYLES.map((n) => (
                <MenuItem key={n.id} on={s.ordered && s.orderedStyle === n.id} run={() => setListStyle('orderedList', n.id)}>
                  {n.label}
                </MenuItem>
              ))}
            {menu.name === 'color' && (
              <div className="palette">
                <small>글자 색</small>
                <div className="swatches">
                  <Swatch title="기본 글자 색" none on={!s.color} run={() => (c().unsetColor().run(), close())} />
                  {TEXT_COLORS.map((col) => (
                    <Swatch key={col.value} title={col.name} color={col.value} on={s.color === col.value} run={() => (c().setColor(col.value).run(), close())} />
                  ))}
                </div>
                <small>형광펜</small>
                <div className="swatches">
                  <Swatch title="형광펜 없음" none on={!s.highlight} run={() => (c().unsetHighlight().run(), close())} />
                  {HIGHLIGHT_COLORS.map((col) => (
                    <Swatch key={col.value} title={`형광펜 ${col.name}`} color={col.value} on={s.highlight === col.value} run={() => (c().setHighlight({ color: col.value }).run(), close())} />
                  ))}
                </div>
              </div>
            )}
            {menu.name === 'table' && (
              <TableSizePicker
                onPick={(rows, cols) => {
                  c().insertTable({ rows, cols, withHeaderRow: true }).run()
                  close()
                }}
              />
            )}
          </div>
        </>
      )}
    </>
  )
}

function T({ on, label, title, run, disabled }: { on?: boolean; label: string; title: string; run: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`tool ${on ? 'on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // 편집기 선택 영역을 잃지 않도록
      onClick={run}
    >
      {label}
    </button>
  )
}

const Sep = () => <span className="sep" />

function MenuItem({ on, run, children }: { on?: boolean; run: () => void; children: ReactNode }) {
  return (
    <button role="menuitemradio" aria-checked={on} className={on ? 'checked' : ''} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {children}
    </button>
  )
}

function Swatch({ title, color, none, on, run }: { title: string; color?: string; none?: boolean; on?: boolean; run: () => void }) {
  return (
    <button
      className={`swatch ${on ? 'on' : ''} ${none ? 'none' : ''}`}
      style={color ? { background: color } : undefined}
      title={title}
      aria-label={title}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    />
  )
}

/** 마우스를 올려 표 크기(최대 8×8)를 고른다. 휴대폰에서는 눌러서 고른다. */
function TableSizePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ r: 3, c: 3 })
  return (
    <div className="table-picker">
      <small>
        표 넣기: {hover.r} × {hover.c}
      </small>
      <div className="table-grid" onMouseDown={(e) => e.preventDefault()}>
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 8 }, (_, col) => (
            <button
              key={`${r}-${col}`}
              className={r < hover.r && col < hover.c ? 'in' : ''}
              aria-label={`${r + 1}행 ${col + 1}열 표`}
              onMouseEnter={() => setHover({ r: r + 1, c: col + 1 })}
              onFocus={() => setHover({ r: r + 1, c: col + 1 })}
              onClick={() => onPick(r + 1, col + 1)}
            />
          )),
        )}
      </div>
    </div>
  )
}
