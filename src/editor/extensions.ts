// 문서 편집기에 들어가는 기능 묶음과 그 설정값.

import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { BulletList, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list'
import Highlight from '@tiptap/extension-highlight'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'

// ── 글머리 기호 / 번호 모양 ─────────────────────────────

export const BULLET_STYLES = [
  { id: 'disc', label: '● 채운 원', css: 'disc' },
  { id: 'circle', label: '○ 빈 원', css: 'circle' },
  { id: 'square', label: '■ 네모', css: 'square' },
  { id: 'dash', label: '– 줄표', css: '"–  "' },
  { id: 'check', label: '✓ 체크', css: '"✓  "' },
  { id: 'arrow', label: '→ 화살표', css: '"→  "' },
  { id: 'star', label: '★ 별', css: '"★  "' },
] as const

export const NUMBER_STYLES = [
  { id: 'decimal', label: '1. 2. 3.', css: 'decimal' },
  { id: 'hangul', label: '가. 나. 다.', css: 'hangul' },
  { id: 'consonant', label: 'ㄱ. ㄴ. ㄷ.', css: 'hangul-consonant' },
  { id: 'alpha', label: 'a. b. c.', css: 'lower-alpha' },
  { id: 'upper-alpha', label: 'A. B. C.', css: 'upper-alpha' },
  { id: 'roman', label: 'i. ii. iii.', css: 'lower-roman' },
] as const

const cssOf = (list: readonly { id: string; css: string }[], id: unknown) => list.find((s) => s.id === id)?.css

/** 목록에 listStyle 속성을 더한다. HTML 에는 style 로 들어가서 앱 밖에서 열어도 같은 모양으로 보인다. */
function withListStyle<T extends typeof BulletList | typeof OrderedList>(base: T, styles: readonly { id: string; css: string }[]) {
  return base.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        listStyle: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-list-style'),
          renderHTML: (attrs: Record<string, unknown>) => {
            const css = cssOf(styles, attrs.listStyle)
            return css ? { 'data-list-style': attrs.listStyle, style: `list-style-type: ${css}` } : {}
          },
        },
      }
    },
  })
}

// ── 색 ──────────────────────────────────────────────

export const TEXT_COLORS = [
  { name: '검정', value: '#1f1f1f' },
  { name: '회색', value: '#6b7280' },
  { name: '빨강', value: '#dc2626' },
  { name: '주황', value: '#ea580c' },
  { name: '노랑', value: '#ca8a04' },
  { name: '초록', value: '#16a34a' },
  { name: '청록', value: '#0d9488' },
  { name: '파랑', value: '#2563eb' },
  { name: '남색', value: '#4338ca' },
  { name: '보라', value: '#9333ea' },
  { name: '분홍', value: '#db2777' },
  { name: '갈색', value: '#92400e' },
]

export const HIGHLIGHT_COLORS = [
  { name: '노랑', value: '#fde68a' },
  { name: '초록', value: '#bbf7d0' },
  { name: '하늘', value: '#bae6fd' },
  { name: '분홍', value: '#fbcfe8' },
  { name: '주황', value: '#fed7aa' },
  { name: '보라', value: '#e9d5ff' },
]

// ── 저장소에 넣은 이미지 ─────────────────────────────────
// 이미지 파일은 Storage 에 두고, 문서에는 경로(storagePath)만 저장한다.
// 화면에 보일 때만 잠깐 쓰는 주소(src)를 붙인다 → images.ts

export const VaultImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      storagePath: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-storage-path'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.storagePath ? { 'data-storage-path': attrs.storagePath } : {}),
      },
    }
  },
})

export function editorExtensions() {
  return [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      bulletList: false,
      orderedList: false,
    }),
    withListStyle(BulletList, BULLET_STYLES),
    withListStyle(OrderedList, NUMBER_STYLES),
    Placeholder.configure({ placeholder: '여기에 글을 쓰세요…' }),
    TaskList,
    TaskItem.configure({
      nested: true,
      a11y: { checkboxLabel: (node, checked) => `할 일 ${checked ? '완료' : '미완료'}: ${node.textContent || '빈 항목'}` },
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    VaultImage.configure({
      allowBase64: false,
      resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 60, minHeight: 40 },
    }),
    TableKit.configure({ table: { resizable: true } }),
  ]
}
