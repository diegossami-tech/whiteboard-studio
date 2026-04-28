import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createEmptyBookmarkShape,
  createShapeId,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  PageRecordType,
  Tldraw,
  toRichText,
  type Editor,
  type TLPage,
  type TLPageId,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import { GeometricIcon, type GeometricIconName } from './components/GeometricIcon'
import { INSTAGRAM_REEL_SHAPE_TYPE, InstagramReelShapeUtil } from './shapes/InstagramReelShapeUtil'
import canvasCenterMotif from './assets/canvas-center-motif.png'
import './App.css'

type MediaPasteItem =
  | { kind: 'youtube'; layout: 'video' | 'short'; url: string }
  | { kind: 'instagram-reel'; url: string }
  | { kind: 'bookmark'; url: string }

type BoardEntry = Pick<TLPage, 'id' | 'name'>
type ToolbarTool = 'select' | 'hand' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'draw' | 'eraser'
type BoardDialogState = { mode: 'create' | 'rename' } | null
type SidebarSection = 'files' | 'recent' | 'favorites' | 'shared' | 'library' | 'templates' | 'trash'
type AssetSummary = {
  id: TLShapeId
  type: 'image' | 'media' | 'bookmark' | 'text' | 'note'
  title: string
  subtitle: string
  previewUrl?: string
}

type CanvasRect = { x: number; y: number; w: number; h: number }

const COLOR_OPTIONS = ['black', 'blue', 'green', 'yellow', 'red'] as const
const SIZE_OPTIONS = ['s', 'm', 'l', 'xl'] as const
const DASH_BUTTONS: Array<{ value: 'solid' | 'dashed' | 'dotted'; icon: GeometricIconName; label: string }> = [
  { value: 'solid', icon: 'stroke-solid', label: 'Traco continuo' },
  { value: 'dashed', icon: 'stroke-dashed', label: 'Traco tracejado' },
  { value: 'dotted', icon: 'stroke-dotted', label: 'Traco pontilhado' },
]

const TOOLBAR_TOOLS: Array<{
  id: ToolbarTool
  label: string
  icon: GeometricIconName
}> = [
  { id: 'select', label: 'Selecionar', icon: 'select' },
  { id: 'hand', label: 'Mão', icon: 'hand' },
  { id: 'rectangle', label: 'Forma', icon: 'rectangle' },
  { id: 'ellipse', label: 'Círculo', icon: 'circle' },
  { id: 'line', label: 'Linha', icon: 'line' },
  { id: 'arrow', label: 'Seta', icon: 'arrow' },
  { id: 'text', label: 'Texto', icon: 'text' },
  { id: 'draw', label: 'Desenho', icon: 'draw' },
  { id: 'eraser', label: 'Borracha', icon: 'eraser' },
]

const DOCK_DIVIDERS = new Set<ToolbarTool>(['hand', 'arrow', 'eraser'])
const DESKTOP_FOLDERS = ['Projetos', 'Estudos', 'Ideias', 'Pessoais', 'Arquivos'] as const
const DESKTOP_PROJECT_NAME = 'Projeto Atlas'

function richTextToPlainText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''

  const nodes = Array.isArray((value as { content?: unknown[] }).content)
    ? (value as { content: unknown[] }).content
    : []

  const readNode = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const text = typeof (node as { text?: unknown }).text === 'string' ? (node as { text: string }).text : ''
    const content = Array.isArray((node as { content?: unknown[] }).content)
      ? (node as { content: unknown[] }).content.map(readNode).join('')
      : ''
    const spacer = text && content ? '\n' : ''
    return `${text}${spacer}${content}`.trim()
  }

  return nodes.map(readNode).filter(Boolean).join('\n').trim()
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'External link'
  }
}

function getAssetSummaries(editor: Editor): AssetSummary[] {
  return editor
    .getCurrentPageShapes()
    .map<AssetSummary | null>((shape) => {
      if (shape.type === 'image') {
        return {
          id: shape.id,
          type: 'image',
          title: 'Pasted image',
          subtitle: 'Ready to resize, crop, or move',
          previewUrl: typeof shape.props.url === 'string' ? shape.props.url : undefined,
        }
      }

      if (shape.type === 'embed') {
        const isShort = shape.props.h > shape.props.w
        return {
          id: shape.id,
          type: 'media',
          title: isShort ? 'YouTube Short' : 'YouTube video',
          subtitle: 'Embedded on the board',
        }
      }

      if (shape.type === INSTAGRAM_REEL_SHAPE_TYPE) {
        return {
          id: shape.id,
          type: 'media',
          title: 'Instagram Reel',
          subtitle: 'Embedded on the board',
        }
      }

      if (shape.type === 'bookmark') {
        const url = typeof shape.props.url === 'string' ? shape.props.url : ''
        return {
          id: shape.id,
          type: 'bookmark',
          title: safeHostname(url),
          subtitle: 'Bookmark card',
        }
      }

      if (shape.type === 'note') {
        const text = richTextToPlainText(shape.props.richText)
        if (!text) return null
        return {
          id: shape.id,
          type: 'note',
          title: text.split('\n')[0]?.slice(0, 52) || 'Sticky note',
          subtitle: 'Note',
        }
      }

      if (shape.type === 'text') {
        const text = richTextToPlainText(shape.props.richText)
        if (!text) return null
        return {
          id: shape.id,
          type: 'text',
          title: text.split('\n')[0]?.slice(0, 52) || 'Text block',
          subtitle: 'Text',
        }
      }

      return null
    })
    .filter((item): item is AssetSummary => item !== null)
}

function getYouTubeVideoInfo(raw: string): { id: string; layout: 'video' | 'short' } | null {
  try {
    const url = new URL(raw.trim())
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id ? { id, layout: 'video' } : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v')
        return id ? { id, layout: 'video' } : null
      }

      const parts = url.pathname.split('/').filter(Boolean)
      const marker = parts[0]

      if (marker === 'shorts') {
        const id = parts[1] ?? null
        return id ? { id, layout: 'short' } : null
      }

      if (marker === 'embed' || marker === 'live') {
        const id = parts[1] ?? null
        return id ? { id, layout: 'video' } : null
      }
    }
  } catch {
    return null
  }

  return null
}

function normalizeYouTubeEmbed(raw: string): { url: string; layout: 'video' | 'short' } | null {
  const info = getYouTubeVideoInfo(raw)
  if (!info) return null

  try {
    const url = new URL(raw.trim())
    const params = new URLSearchParams()
    params.set('playsinline', '1')
    params.set('rel', '0')
    const start = url.searchParams.get('t')
    if (start) params.set('start', start)

    const search = params.toString()
    return {
      url: `https://www.youtube.com/embed/${info.id}${search ? `?${search}` : ''}`,
      layout: info.layout,
    }
  } catch {
    return {
      url: `https://www.youtube.com/embed/${info.id}?playsinline=1&rel=0`,
      layout: info.layout,
    }
  }
}

function extractUrlsInOrder(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+/g)?.map((match) => match.trim().replace(/[),.;!?]+$/, '')) ?? []
}

function normalizeInstagramReelUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    const host = url.hostname.replace(/^www\./, '')
    if (host !== 'instagram.com' && host !== 'm.instagram.com') return null

    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'reel' || !parts[1]) return null

    return `https://www.instagram.com/reel/${parts[1]}/`
  } catch {
    return null
  }
}

function extractMediaPasteItems(text: string): MediaPasteItem[] {
  const matches = extractUrlsInOrder(text)
  const seen = new Set<string>()
  const items: MediaPasteItem[] = []

  for (const match of matches) {
    const normalizedYouTube = normalizeYouTubeEmbed(match)
    if (normalizedYouTube) {
      const key = `${normalizedYouTube.layout}:${normalizedYouTube.url}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ kind: 'youtube', layout: normalizedYouTube.layout, url: normalizedYouTube.url })
      continue
    }

    const normalizedReel = normalizeInstagramReelUrl(match)
    if (normalizedReel) {
      const key = `reel:${normalizedReel}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ kind: 'instagram-reel', url: normalizedReel })
      continue
    }

    try {
      const url = new URL(match)
      const host = url.hostname.replace(/^www\./, '')
      if (host === 'instagram.com' || host === 'm.instagram.com') {
        const key = `bookmark:${match}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push({ kind: 'bookmark', url: match })
      }
    } catch {
      continue
    }
  }

  return items
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable
}

function getMediaItemSize(item: MediaPasteItem) {
  if (item.kind === 'youtube' && item.layout === 'video') {
    return { width: 760, height: 428 }
  }

  if (item.kind === 'bookmark') {
    return { width: 420, height: 260 }
  }

  return { width: 340, height: 604 }
}

function getCanvasCenter(editor: Editor, point?: { x: number; y: number }) {
  return point ?? editor.getViewportPageBounds().center
}

function createTextShape(editor: Editor, text: string, point?: { x: number; y: number }) {
  const trimmed = text.trim()
  if (!trimmed) return null

  const center = getCanvasCenter(editor, point)
  const isNote = trimmed.includes('\n') || trimmed.length > 140
  const id = createShapeId()

  if (isNote) {
    editor.createShapes([
      {
        id,
        type: 'note',
        x: center.x - 120,
        y: center.y - 120,
        props: {
          richText: toRichText(trimmed),
          size: 'm',
          font: 'sans',
        },
      },
    ])
  } else {
    editor.createShapes([
      {
        id,
        type: 'text',
        x: center.x - 180,
        y: center.y - 36,
        props: {
          w: 360,
          size: 'm',
          font: 'sans',
          richText: toRichText(trimmed),
        },
      },
    ])
  }

  editor.setSelectedShapes([id])
  return id
}

function createMediaItems(editor: Editor, items: MediaPasteItem[], point?: { x: number; y: number }) {
  const center = getCanvasCenter(editor, point)
  const gap = 32
  const columns = items.length > 1 ? Math.min(2, items.length) : 1
  const sizedItems = items.map((item) => ({ item, ...getMediaItemSize(item) }))
  const rowCount = Math.ceil(sizedItems.length / columns)
  const rowHeights = Array.from({ length: rowCount }, (_, rowIndex) =>
    Math.max(...sizedItems.slice(rowIndex * columns, rowIndex * columns + columns).map((item) => item.height))
  )
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, rowHeights.length - 1)

  let currentY = center.y - totalHeight / 2
  const createdShapeIds: TLShapeId[] = []

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowItems = sizedItems.slice(rowIndex * columns, rowIndex * columns + columns)
    const rowWidth = rowItems.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, rowItems.length - 1)
    let currentX = center.x - rowWidth / 2

    for (const sizedItem of rowItems) {
      if (sizedItem.item.kind === 'youtube') {
        const id = createShapeId()
        editor.createShapes([
          {
            id,
            type: 'embed' as const,
            x: currentX,
            y: currentY,
            props: {
              w: sizedItem.width,
              h: sizedItem.height,
              url: sizedItem.item.url,
            },
          },
        ])
        createdShapeIds.push(id)
      } else if (sizedItem.item.kind === 'instagram-reel') {
        const id = createShapeId()
        editor.createShapes([
          {
            id,
            type: INSTAGRAM_REEL_SHAPE_TYPE,
            x: currentX,
            y: currentY,
            props: {
              w: sizedItem.width,
              h: sizedItem.height,
              url: sizedItem.item.url,
            },
          },
        ])
        createdShapeIds.push(id)
      } else {
        const beforeIds = new Set(editor.getCurrentPageShapes().map((shape) => shape.id))
        createEmptyBookmarkShape(editor, sizedItem.item.url, {
          x: currentX + sizedItem.width / 2,
          y: currentY + sizedItem.height / 2,
        })
        const bookmarkIds = editor
          .getCurrentPageShapes()
          .filter((shape) => !beforeIds.has(shape.id))
          .map((shape) => shape.id)
        createdShapeIds.push(...bookmarkIds)
      }

      currentX += sizedItem.width + gap
    }

    currentY += rowHeights[rowIndex] + gap
  }

  if (createdShapeIds.length) {
    editor.setSelectedShapes(createdShapeIds)
  }

  return createdShapeIds
}

function getKnownStyle(editor: Editor | null, style: unknown, fallback: string) {
  if (!editor) return fallback
  const styles = editor.getSharedStyles()
  return (styles.getAsKnownValue(style as never) ?? editor.getStyleForNextShape(style as never) ?? fallback) as string
}

function normalizeTool(editor: Editor | null, rawToolId: string): ToolbarTool {
  if (!editor) return 'select'
  if (rawToolId.startsWith('select')) return 'select'
  if (rawToolId === 'geo') {
    const geo = editor.getStyleForNextShape(GeoShapeGeoStyle)
    return geo === 'ellipse' ? 'ellipse' : 'rectangle'
  }
  if (
    rawToolId === 'hand' ||
    rawToolId === 'line' ||
    rawToolId === 'arrow' ||
    rawToolId === 'text' ||
    rawToolId === 'draw' ||
    rawToolId === 'eraser'
  ) {
    return rawToolId
  }
  return 'select'
}

function ToolButton({
  active,
  compact,
  icon,
  label,
  onClick,
}: {
  active: boolean
  compact?: boolean
  icon: GeometricIconName
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`tool-button ${active ? 'tool-button--active' : ''} ${compact ? 'tool-button--compact' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <GeometricIcon name={icon} size={18} />
      {!compact && <span>{label}</span>}
    </button>
  )
}

function GeometricMotifIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth="1.34"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        <MotifMiniPaths />
      </g>
    </svg>
  )
}

function MotifMiniPaths() {
  return (
    <>
      <rect x="7.2" y="7.2" width="8.6" height="8.6" rx="0.9" />
      <rect x="24.2" y="7.2" width="8.6" height="8.6" rx="0.9" />
      <rect x="7.2" y="24.2" width="8.6" height="8.6" rx="0.9" />
      <rect x="24.2" y="24.2" width="8.6" height="8.6" rx="0.9" />

      <path d="M20 4.8C24.9 9 25.1 15 20 20c-5.1-5-4.9-11 0-15.2Z" />
      <path d="M35.2 20C31 24.9 25 25.1 20 20c5-5.1 11-4.9 15.2 0Z" />
      <path d="M20 35.2C15.1 31 14.9 25 20 20c5.1 5 4.9 11 0 15.2Z" />
      <path d="M4.8 20C9 15.1 15 14.9 20 20c-5 5.1-11 4.9-15.2 0Z" />

      <path d="M11.4 11.4C16.4 11.4 19.2 14.1 20 20c-5.9-.8-8.6-3.6-8.6-8.6Z" />
      <path d="M28.6 11.4C28.6 16.4 25.9 19.2 20 20c.8-5.9 3.6-8.6 8.6-8.6Z" />
      <path d="M28.6 28.6C23.6 28.6 20.8 25.9 20 20c5.9.8 8.6 3.6 8.6 8.6Z" />
      <path d="M11.4 28.6C11.4 23.6 14.1 20.8 20 20c-.8 5.9-3.6 8.6-8.6 8.6Z" />

      <path d="M20 14.4 21.8 17.7 25.6 18.2 22.9 20.8 23.6 24.5 20 22.7 16.4 24.5 17.1 20.8 14.4 18.2 18.2 17.7Z" />
    </>
  )
}

function CanvasWatermarkMotif() {
  return (
    <svg viewBox="0 0 320 320" fill="none" aria-hidden="true">
      <g opacity="0.12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M160 34v252" />
        <path d="M34 160h252" />
        <path d="M72 72 248 248" />
        <path d="M248 72 72 248" />
        <rect x="86" y="86" width="148" height="148" rx="0" />
        <rect x="108" y="108" width="104" height="104" rx="0" transform="rotate(45 160 160)" />
        <circle cx="160" cy="160" r="84" />
      </g>
      <g
        opacity="0.9"
        stroke="currentColor"
        strokeWidth="1.22"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="96" y="96" width="56" height="56" rx="0" />
        <rect x="168" y="96" width="56" height="56" rx="0" />
        <rect x="96" y="168" width="56" height="56" rx="0" />
        <rect x="168" y="168" width="56" height="56" rx="0" />

        <path d="M160 60C177 92 192 116 192 160C192 204 177 228 160 260C143 228 128 204 128 160C128 116 143 92 160 60Z" />
        <path d="M260 160C228 177 204 192 160 192C116 192 92 177 60 160C92 143 116 128 160 128C204 128 228 143 260 160Z" />

        <path d="M110 110C144 110 174 126 190 160C174 194 144 210 110 210C110 176 126 146 160 130C126 146 110 176 110 210" />
        <path d="M210 110C176 110 146 126 130 160C146 194 176 210 210 210C210 176 194 146 160 130C194 146 210 176 210 210" />

        <path d="M110 110C110 144 126 174 160 190C194 174 210 144 210 110C176 110 146 126 130 160C146 126 176 110 210 110" />
        <path d="M110 210C110 176 126 146 160 130C194 146 210 176 210 210C176 210 146 194 130 160C146 194 176 210 210 210" />

        <path d="M160 138 166 149 178 151 169 160 171 172 160 166 149 172 151 160 142 151 154 149Z" />
      </g>
    </svg>
  )
}

function CanvasCornerOrnament({ variant }: { variant: 'top-left' | 'bottom-right' }) {
  const id = variant === 'top-left' ? 'canvas-corner-top-left' : 'canvas-corner-bottom-right'

  const motifs =
    variant === 'top-left'
      ? [
          { x: 48, y: 54, scale: 0.9, opacity: 0.82 },
          { x: 92, y: 86, scale: 0.78, opacity: 0.64 },
          { x: 24, y: 108, scale: 0.62, opacity: 0.5 },
          { x: 126, y: 124, scale: 0.52, opacity: 0.44 },
          { x: 74, y: 138, scale: 0.46, opacity: 0.38 },
        ]
      : [
          { x: 312, y: 34, scale: 1.04, opacity: 0.72 },
          { x: 278, y: 74, scale: 0.9, opacity: 0.64 },
          { x: 244, y: 108, scale: 0.8, opacity: 0.58 },
          { x: 210, y: 142, scale: 0.72, opacity: 0.52 },
          { x: 176, y: 174, scale: 0.66, opacity: 0.48 },
          { x: 146, y: 206, scale: 0.58, opacity: 0.44 },
          { x: 118, y: 230, scale: 0.5, opacity: 0.38 },
          { x: 90, y: 252, scale: 0.42, opacity: 0.34 },
        ]

  return (
    <svg
      className={`ornament-corner__svg ornament-corner__svg--${variant}`}
      viewBox={variant === 'top-left' ? '0 0 170 170' : '0 0 360 280'}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={id}>
          {variant === 'top-left' ? <path d="M0 0H170V132C122 133 87 147 48 170H0Z" /> : <path d="M360 0V280H0C70 278 108 236 144 196C178 156 212 112 250 74C286 38 316 16 360 0Z" />}
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {motifs.map((motif, index) => (
          <g
            key={`${variant}-${index}`}
            transform={`translate(${motif.x} ${motif.y}) scale(${motif.scale}) translate(-20 -20)`}
            opacity={motif.opacity}
            strokeWidth={1.02}
          >
            <MotifMiniPaths />
          </g>
        ))}
      </g>
    </svg>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [boards, setBoards] = useState<BoardEntry[]>([])
  const [activeBoardId, setActiveBoardId] = useState<TLPageId | null>(null)
  const [selectedShapeIds, setSelectedShapeIds] = useState<TLShapeId[]>([])
  const [assets, setAssets] = useState<AssetSummary[]>([])
  const [activeTool, setActiveTool] = useState<ToolbarTool>('select')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [activeSidebarSection, setActiveSidebarSection] = useState<SidebarSection>('files')
  const [pasteValue, setPasteValue] = useState('')
  const [boardDialog, setBoardDialog] = useState<BoardDialogState>(null)
  const [boardDraft, setBoardDraft] = useState('')
  const [mediaInteractionEnabled, setMediaInteractionEnabled] = useState(false)
  const [accentToolActive, setAccentToolActive] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [mobilePropertiesOpen, setMobilePropertiesOpen] = useState(false)
  const [mobileMinimapOpen, setMobileMinimapOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const recentPastedUrlsRef = useRef<Set<string>>(new Set())
  const recentPasteTimerRef = useRef<number | null>(null)

  const shapeUtils = useMemo(() => [InstagramReelShapeUtil], [])

  const syncUi = useCallback((instance: Editor) => {
    setBoards(instance.getPages().map((page) => ({ id: page.id, name: page.name })))
    setActiveBoardId(instance.getCurrentPageId())
    setSelectedShapeIds([...instance.getSelectedShapeIds()])
    setAssets(getAssetSummaries(instance))
    setActiveTool(normalizeTool(instance, instance.getCurrentToolId()))
    setZoomLevel(instance.getZoomLevel())
    setCanUndo(instance.getCanUndo())
    setCanRedo(instance.getCanRedo())
  }, [])

  useEffect(() => {
    if (!editor) return

    const page = editor.getCurrentPage()
    if (page?.name === 'Page 1') {
      editor.renamePage(page.id, 'Board 1')
    }

    syncUi(editor)
  }, [editor, syncUi])

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => syncUi(editor)
    editor.on('update', handleUpdate)

    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor, syncUi])

  useEffect(() => {
    if (!editor) return
    editor.updateInstanceState({ isGridMode: false })
  }, [editor])

  useEffect(() => {
    if (!statusMessage) return

    const timeout = window.setTimeout(() => setStatusMessage(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [statusMessage])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setAssetsOpen(false)
        setPasteOpen(false)
        setBoardDialog(null)
        setMobileToolsOpen(false)
        setMobilePropertiesOpen(false)
        setMobileMinimapOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!editor) return

    editor.registerExternalContentHandler('url', ({ url, point }) => {
      if (recentPastedUrlsRef.current.has(url)) return

      const normalizedYouTube = normalizeYouTubeEmbed(url)
      if (normalizedYouTube) {
        const ids = createMediaItems(editor, [{ kind: 'youtube', layout: normalizedYouTube.layout, url: normalizedYouTube.url }], point)
        if (ids.length) {
          setMediaInteractionEnabled(true)
          setStatusMessage(normalizedYouTube.layout === 'short' ? 'YouTube Short added.' : 'YouTube video added.')
        }
        return
      }

      const normalizedReel = normalizeInstagramReelUrl(url)
      if (normalizedReel) {
        const ids = createMediaItems(editor, [{ kind: 'instagram-reel', url: normalizedReel }], point)
        if (ids.length) {
          setMediaInteractionEnabled(true)
          setStatusMessage('Instagram Reel added.')
        }
        return
      }

      createEmptyBookmarkShape(editor, url, point ?? editor.getViewportPageBounds().center)
      setStatusMessage('Bookmark card added.')
    })

    return () => {
      editor.registerExternalContentHandler('url', null)
    }
  }, [editor])

  const insertPlainText = useCallback(
    (text: string, point?: { x: number; y: number }) => {
      if (!editor) return false

      const trimmed = text.trim()
      if (!trimmed) return false

      const mediaItems = extractMediaPasteItems(trimmed)
      if (mediaItems.length) {
        createMediaItems(editor, mediaItems, point)
        setMediaInteractionEnabled(true)
        setStatusMessage(`${mediaItems.length} item${mediaItems.length > 1 ? 's' : ''} added to the board.`)
        return true
      }

      const id = createTextShape(editor, trimmed, point)
      if (id) {
        setStatusMessage(trimmed.includes('\n') || trimmed.length > 140 ? 'Sticky note added.' : 'Text block added.')
        return true
      }

      return false
    },
    [editor]
  )

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!editor) return
      if (isEditableElement(event.target)) return

      const hasImage = Array.from(event.clipboardData?.items ?? []).some((item) => item.type.startsWith('image/'))
      if (hasImage) {
        window.setTimeout(() => {
          if (!editor) return
          const ids = editor.getSelectedShapeIds()
          if (ids.length) {
            setStatusMessage('Image pasted onto the board.')
          }
        }, 140)
        return
      }

      const plainText = event.clipboardData?.getData('text/plain')
      if (!plainText?.trim()) return

      if (insertPlainText(plainText)) {
        event.preventDefault()
        event.stopPropagation()
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation()
        }

        const mediaItems = extractMediaPasteItems(plainText)
        if (mediaItems.length) {
          recentPastedUrlsRef.current = new Set(mediaItems.map((item) => item.url))
          if (recentPasteTimerRef.current) window.clearTimeout(recentPasteTimerRef.current)
          recentPasteTimerRef.current = window.setTimeout(() => {
            recentPastedUrlsRef.current.clear()
            recentPasteTimerRef.current = null
          }, 350)
        }
      }
    }

    window.addEventListener('paste', onPaste, true)
    return () => {
      window.removeEventListener('paste', onPaste, true)
      if (recentPasteTimerRef.current) {
        window.clearTimeout(recentPasteTimerRef.current)
        recentPasteTimerRef.current = null
      }
    }
  }, [editor, insertPlainText])

  const hydratePasteFromClipboard = useCallback(async () => {
    if (pasteValue.trim()) return

    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) setPasteValue(text)
    } catch {
      // noop
    }
  }, [pasteValue])

  const openPastePanel = useCallback(() => {
    setMenuOpen(false)
    setAssetsOpen(false)
    setMobileToolsOpen(false)
    setMobilePropertiesOpen(false)
    setMobileMinimapOpen(false)
    setPasteOpen(true)
    void hydratePasteFromClipboard()
  }, [hydratePasteFromClipboard])

  const pasteFromClipboard = useCallback(async () => {
    if (!editor) return

    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setStatusMessage('Copy something first.')
        return
      }
      if (insertPlainText(text)) {
        setPasteOpen(false)
        setPasteValue('')
        setMobileToolsOpen(false)
      }
    } catch {
      setStatusMessage('Clipboard was blocked. Paste manually in the panel.')
      setPasteOpen(true)
    }
  }, [editor, insertPlainText])

  const saveManualPaste = useCallback(() => {
    if (insertPlainText(pasteValue)) {
      setPasteOpen(false)
      setPasteValue('')
      setMobileToolsOpen(false)
    }
  }, [insertPlainText, pasteValue])

  const activateTool = useCallback(
    (tool: ToolbarTool) => {
      if (!editor) return

      editor.run(() => {
        if (tool === 'rectangle' || tool === 'ellipse') {
          editor.setStyleForNextShapes(GeoShapeGeoStyle, tool)
          editor.setCurrentTool('geo')
        } else {
          editor.setCurrentTool(tool)
        }
      })

      setActiveTool(tool)
      setAccentToolActive(false)
      setMobileToolsOpen(false)
    },
    [editor]
  )

  const focusShape = useCallback(
    (shapeId: TLShapeId) => {
      if (!editor) return
      const bounds = editor.getShapePageBounds(shapeId)
      if (!bounds) return
      editor.setSelectedShapes([shapeId])
      editor.zoomToBounds(bounds, { targetZoom: Math.min(1, editor.getZoomLevel()) })
      setAssetsOpen(false)
    },
    [editor]
  )

  const createBoard = useCallback(() => {
    const nextIndex = boards.length + 1
    setBoardDraft(`Board ${nextIndex}`)
    setBoardDialog({ mode: 'create' })
    setMenuOpen(false)
    setActiveSidebarSection('files')
    setMobileMinimapOpen(false)
  }, [boards.length])

  const renameBoard = useCallback(() => {
    if (!editor || !activeBoardId) return
    const page = editor.getPage(activeBoardId)
    if (!page) return
    setBoardDraft(page.name)
    setBoardDialog({ mode: 'rename' })
    setMenuOpen(false)
    setActiveSidebarSection('files')
    setMobileMinimapOpen(false)
  }, [activeBoardId, editor])

  const submitBoardDialog = useCallback(() => {
    if (!editor || !boardDialog) return

    const nextName = boardDraft.trim()
    if (!nextName) {
      setStatusMessage('Choose a board name first.')
      return
    }

    if (boardDialog.mode === 'create') {
      const pageId = PageRecordType.createId()
      editor.createPage({ id: pageId, name: nextName })
      editor.setCurrentPage(pageId)
      setStatusMessage(`Created ${nextName}.`)
    } else if (activeBoardId) {
      editor.renamePage(activeBoardId, nextName)
      setStatusMessage(`Renamed to ${nextName}.`)
    }

    setBoardDialog(null)
    setBoardDraft('')
  }, [activeBoardId, boardDialog, boardDraft, editor])

  const openBoard = useCallback(
    (pageId: TLPageId) => {
      if (!editor) return
      editor.setCurrentPage(pageId)
      setMenuOpen(false)
      setAssetsOpen(false)
      setActiveSidebarSection('files')
      setMobileMinimapOpen(false)
      setStatusMessage('Board switched.')
    },
    [editor]
  )

  const clearBoard = useCallback(() => {
    if (!editor) return
    const ids = editor.getCurrentPageShapes().map((shape) => shape.id)
    if (!ids.length) return
    if (!window.confirm('Clear everything on this board?')) return
    editor.deleteShapes(ids)
    setStatusMessage('Board cleared.')
    setMenuOpen(false)
  }, [editor])

  const duplicateSelection = useCallback(() => {
    if (!editor || !selectedShapeIds.length) return
    editor.duplicateShapes(selectedShapeIds)
    setStatusMessage('Selection duplicated.')
  }, [editor, selectedShapeIds])

  const deleteSelection = useCallback(() => {
    if (!editor || !selectedShapeIds.length) return
    editor.deleteShapes(selectedShapeIds)
    setStatusMessage('Selection deleted.')
  }, [editor, selectedShapeIds])

  const bringSelectionToFront = useCallback(() => {
    if (!editor || !selectedShapeIds.length) return
    editor.bringToFront(selectedShapeIds)
    setStatusMessage('Selection brought to front.')
  }, [editor, selectedShapeIds])

  const undo = useCallback(() => {
    editor?.undo()
  }, [editor])

  const redo = useCallback(() => {
    editor?.redo()
  }, [editor])

  const zoomIn = useCallback(() => {
    editor?.zoomIn()
  }, [editor])

  const zoomOut = useCallback(() => {
    editor?.zoomOut()
  }, [editor])

  const zoomToFit = useCallback(() => {
    editor?.zoomToFit()
  }, [editor])

  const shareBoard = useCallback(async () => {
    const shareUrl = window.location.href

    try {
      await navigator.clipboard.writeText(shareUrl)
      setStatusMessage('Board link copied to clipboard.')
    } catch {
      setStatusMessage('Copy this link to share the board.')
    }
  }, [])

  const activateGeometricMode = useCallback(() => {
    if (!editor) return
    editor.setCurrentTool('draw')
    setActiveTool('draw')
    setAccentToolActive(true)
    setMobileToolsOpen(false)
    setStatusMessage('Geometric sketch mode ready.')
  }, [editor])

  const openSidebarSection = useCallback(
    (section: SidebarSection) => {
      setActiveSidebarSection(section)
      setMobileToolsOpen(false)
      setMobilePropertiesOpen(false)

      if (section === 'library') {
        setAssetsOpen(true)
        setMenuOpen(false)
        setPasteOpen(false)
        return
      }

      if (section === 'files') {
        setAssetsOpen(false)
        setMenuOpen(false)
        setPasteOpen(false)
        setStatusMessage('Navegue pelos seus quadros e itens salvos no estúdio.')
        return
      }

      if (section === 'templates') {
        setMenuOpen(false)
        setAssetsOpen(false)
        setPasteOpen(false)
        setStatusMessage('A coleção de templates entra no próximo passo.')
        return
      }

      if (section === 'recent') {
        setMenuOpen(false)
        setAssetsOpen(false)
        setPasteOpen(false)
        setStatusMessage('A visão de recentes entra no próximo passo.')
        return
      }

      if (section === 'favorites') {
        setMenuOpen(false)
        setAssetsOpen(false)
        setPasteOpen(false)
        setStatusMessage('A área de favoritos entra no próximo passo.')
        return
      }

      if (section === 'shared') {
        setMenuOpen(false)
        setAssetsOpen(false)
        setPasteOpen(false)
        setStatusMessage('A área de compartilhados entra no próximo passo.')
        return
      }

      if (section === 'trash') {
        setMenuOpen(false)
        setAssetsOpen(false)
        setPasteOpen(false)
        setStatusMessage('A lixeira está vazia.')
        return
      }

      setMenuOpen(false)
      setAssetsOpen(false)
      setPasteOpen(false)
    },
    []
  )

  const selectedShapes = useMemo(() => {
    if (!editor) return []
    return selectedShapeIds
      .map((id) => editor.getShape(id))
      .filter((shape): shape is TLShape => Boolean(shape))
  }, [editor, selectedShapeIds])

  const hasSelection = selectedShapes.length > 0
  const isMediaSelection = selectedShapes.some(
    (shape) => shape.type === 'embed' || shape.type === INSTAGRAM_REEL_SHAPE_TYPE
  )

  const colorStyle = getKnownStyle(editor, DefaultColorStyle, 'black')
  const sizeStyle = getKnownStyle(editor, DefaultSizeStyle, 'm')
  const dashStyle = getKnownStyle(editor, DefaultDashStyle, 'solid')

  useEffect(() => {
    if (!hasSelection) {
      setMobilePropertiesOpen(false)
    }
  }, [hasSelection])

  const applyStyle = useCallback(
    (style: unknown, value: string) => {
      if (!editor) return
      if (selectedShapeIds.length) {
        editor.setStyleForSelectedShapes(style as never, value as never)
      }
      editor.setStyleForNextShapes(style as never, value as never)
    },
    [editor, selectedShapeIds.length]
  )

  const sizeIndex = Math.max(0, SIZE_OPTIONS.indexOf(sizeStyle as (typeof SIZE_OPTIONS)[number]))

  const changeSizeStyle = useCallback(
    (direction: -1 | 1) => {
      const currentIndex = Math.max(0, SIZE_OPTIONS.indexOf(sizeStyle as (typeof SIZE_OPTIONS)[number]))
      const nextIndex = clamp(currentIndex + direction, 0, SIZE_OPTIONS.length - 1)
      applyStyle(DefaultSizeStyle, SIZE_OPTIONS[nextIndex])
    },
    [applyStyle, sizeStyle]
  )

  const boardName = boards.find((board) => board.id === activeBoardId)?.name ?? DESKTOP_PROJECT_NAME
  const assetCountLabel = `${assets.length} item${assets.length === 1 ? '' : 's'}`
  const isBoardEmpty = assets.length === 0

  const minimap = useMemo(() => {
    if (!editor) return null

    const viewportBounds = editor.getViewportPageBounds()
    const viewport: CanvasRect = {
      x: viewportBounds.x,
      y: viewportBounds.y,
      w: viewportBounds.w,
      h: viewportBounds.h,
    }

    const shapeRects: Array<{ id: TLShapeId; rect: CanvasRect }> = []
    editor.getCurrentPageShapes().forEach((shape) => {
      const bounds = editor.getShapePageBounds(shape.id)
      if (!bounds) return

      shapeRects.push({
        id: shape.id,
        rect: {
          x: bounds.x,
          y: bounds.y,
          w: bounds.w,
          h: bounds.h,
        },
      })
    })

    const sourceRects = shapeRects.length ? shapeRects.map((item) => item.rect) : [viewport]
    const minX = Math.min(...sourceRects.map((rect) => rect.x), viewport.x)
    const minY = Math.min(...sourceRects.map((rect) => rect.y), viewport.y)
    const maxX = Math.max(...sourceRects.map((rect) => rect.x + rect.w), viewport.x + viewport.w)
    const maxY = Math.max(...sourceRects.map((rect) => rect.y + rect.h), viewport.y + viewport.h)
    const padding = 320

    const scene = {
      x: minX - padding,
      y: minY - padding,
      w: Math.max(1, maxX - minX + padding * 2),
      h: Math.max(1, maxY - minY + padding * 2),
    }

    const toPercentRect = (rect: CanvasRect) => ({
      x: ((rect.x - scene.x) / scene.w) * 100,
      y: ((rect.y - scene.y) / scene.h) * 100,
      w: (rect.w / scene.w) * 100,
      h: (rect.h / scene.h) * 100,
    })

    return {
      shapes: shapeRects.map((item) => ({ id: item.id, ...toPercentRect(item.rect) })),
      viewport: toPercentRect(viewport),
    }
  }, [activeBoardId, assets, editor, selectedShapeIds, zoomLevel])

  const addStickyNote = useCallback(() => {
    if (!editor) return
    createTextShape(editor, 'New note\nAdd your thought here')
    setAccentToolActive(false)
    setStatusMessage('Sticky note added.')
  }, [editor])

  const addImagePrompt = useCallback(() => {
    setAccentToolActive(false)
    openPastePanel()
  }, [openPastePanel])

  return (
    <div className={`whiteboard-app ${mediaInteractionEnabled ? 'media-live' : 'media-locked'}`}>
      <div className="canvas-shell">
        <div className="canvas-grid-layer" aria-hidden="true" />
        <div className="ornament-corner ornament-corner--top-left" aria-hidden="true">
          <CanvasCornerOrnament variant="top-left" />
        </div>
        <div className="ornament-corner ornament-corner--bottom-right" aria-hidden="true">
          <CanvasCornerOrnament variant="bottom-right" />
        </div>

        <aside className="workspace-sidebar">
          <div className="workspace-sidebar__header">
            <div className="workspace-brand">
              <div className="workspace-brand__mark" aria-hidden="true">
                <GeometricMotifIcon />
              </div>
              <div className="workspace-brand__copy">
                <span className="workspace-brand__eyebrow">Whiteboard Studio</span>
                <strong>Whiteboard Studio</strong>
                <small className="workspace-brand__subtle">PENSE. DESENHE. CONECTE.</small>
              </div>
            </div>
            <button type="button" className="sidebar-mini-action sidebar-mini-action--ghost" aria-label="Recolher sidebar" title="Recolher sidebar">
              <GeometricIcon name="chevron-left" size={16} />
            </button>
          </div>

          <section className="workspace-sidebar__section">
            <div className="workspace-sidebar__section-header workspace-sidebar__section-header--plain">
              <span className="panel-kicker">INÍCIO</span>
            </div>
            <nav className="sidebar-nav-list" aria-label="Navegação principal">
              <button type="button" className={`sidebar-nav-item ${activeSidebarSection === 'files' ? 'sidebar-nav-item--active' : ''}`} onClick={() => openSidebarSection('files')}>
                <GeometricIcon name="files" size={16} />
                <span>Meus arquivos</span>
              </button>
              <button type="button" className={`sidebar-nav-item ${activeSidebarSection === 'recent' ? 'sidebar-nav-item--active' : ''}`} onClick={() => openSidebarSection('recent')}>
                <GeometricIcon name="recent" size={16} />
                <span>Recentes</span>
              </button>
              <button type="button" className={`sidebar-nav-item ${activeSidebarSection === 'favorites' ? 'sidebar-nav-item--active' : ''}`} onClick={() => openSidebarSection('favorites')}>
                <GeometricIcon name="favorites" size={16} />
                <span>Favoritos</span>
              </button>
              <button type="button" className={`sidebar-nav-item ${activeSidebarSection === 'shared' ? 'sidebar-nav-item--active' : ''}`} onClick={() => openSidebarSection('shared')}>
                <GeometricIcon name="shared" size={16} />
                <span>Compartilhados</span>
              </button>
            </nav>
          </section>

            <section className="workspace-sidebar__section">
              <div className="workspace-sidebar__section-header workspace-sidebar__section-header--plain">
                <span className="panel-kicker">BIBLIOTECA</span>
              </div>
              <nav className="sidebar-nav-list" aria-label="Biblioteca">
                <button type="button" className={`sidebar-nav-item ${activeSidebarSection === 'templates' ? 'sidebar-nav-item--active' : ''}`} onClick={() => openSidebarSection('templates')}>
                  <GeometricIcon name="templates" size={16} />
                  <span>Templates</span>
                </button>
                <button type="button" className={`sidebar-nav-item ${activeSidebarSection === 'library' ? 'sidebar-nav-item--active' : ''}`} onClick={() => openSidebarSection('library')}>
                  <GeometricIcon name="library" size={16} />
                  <span>Exemplos</span>
                </button>
                <button type="button" className={`sidebar-nav-item ${activeSidebarSection === 'trash' ? 'sidebar-nav-item--active' : ''}`} onClick={() => openSidebarSection('trash')}>
                  <GeometricIcon name="trash" size={16} />
                  <span>Lixeira</span>
                </button>
              </nav>
          </section>

          <section className="workspace-sidebar__section workspace-sidebar__section--boards">
            <div className="workspace-sidebar__section-header">
              <span className="panel-kicker">PASTAS</span>
              <button type="button" className="sidebar-mini-action" onClick={createBoard} aria-label="Criar pasta">
                <GeometricIcon name="plus" size={15} />
              </button>
            </div>
            <div className="sidebar-board-list">
              {DESKTOP_FOLDERS.map((folderName) => (
                <button
                  key={folderName}
                  type="button"
                  className={`sidebar-board-card ${folderName === 'Projetos' ? 'sidebar-board-card--active' : ''}`}
                  onClick={() => setStatusMessage(`A pasta ${folderName} entra no próximo passo.`)}
                  >
                    <div className="sidebar-board-card__glyph" aria-hidden="true">
                      <GeometricIcon name="folder" size={15} />
                    </div>
                    <div className="sidebar-board-card__copy">
                      <strong>{folderName}</strong>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <div className="upgrade-card">
              <div className="upgrade-card__icon" aria-hidden="true">
                <GeometricMotifIcon />
              </div>
              <div className="upgrade-card__copy">
                <strong>Plano Pro</strong>
                <span>Recursos avançados para organizar suas ideias.</span>
              </div>
              <button type="button" className="upgrade-card__button" onClick={() => setStatusMessage('O fluxo de upgrade entra no próximo passo.')}>
                <GeometricIcon name="favorites" size={15} />
                <span>Upgrade</span>
              </button>
            </div>

            <button type="button" className="sidebar-footer-shortcut" aria-label="Recolher sidebar" title="Recolher sidebar">
              <span className="sidebar-footer-shortcut__left">
                <GeometricIcon name="chevron-left" size={14} />
                <span>Recolher sidebar</span>
              </span>
              <span className="sidebar-footer-shortcut__hint">Alt + B</span>
            </button>
          </aside>

        <header className="app-topbar">
          <div className="app-topbar__left">
            <button
              type="button"
              className="floating-icon-button app-menu-toggle"
              onClick={() => {
                setMenuOpen((open) => !open)
                setAssetsOpen(false)
                setActiveSidebarSection('files')
                setMobileToolsOpen(false)
                setMobileMinimapOpen(false)
              }}
              aria-label="Open main menu"
              title="Main menu"
            >
              <GeometricIcon name="menu" size={18} />
            </button>
            <button
              type="button"
              className="board-selector"
              onClick={renameBoard}
              aria-label="Current project selector"
            >
              <GeometricIcon name="project" size={18} />
              <div className="board-selector__copy">
                <strong>{DESKTOP_PROJECT_NAME}</strong>
              </div>
              <GeometricIcon name="chevron-down" size={16} />
            </button>
            <div className="history-cluster">
              <button
                type="button"
                className="floating-icon-button"
                onClick={undo}
                aria-label="Undo"
                title="Undo"
                disabled={!canUndo}
              >
                <GeometricIcon name="undo" size={18} />
              </button>
              <button
                type="button"
                className="floating-icon-button"
                onClick={redo}
                aria-label="Redo"
                title="Redo"
                disabled={!canRedo}
              >
                <GeometricIcon name="redo" size={18} />
              </button>
            </div>
          </div>

          <div className="app-topbar__center">
            <div className="app-topbar__mobile-brand" aria-hidden="true">
              <GeometricMotifIcon />
            </div>
          </div>

          <div className="app-topbar__right">
            <button
              type="button"
              className="floating-icon-button"
              onClick={() => setStatusMessage('O status de sincronização entra no próximo passo.')}
              aria-label="Sincronização na nuvem"
              title="Sincronização na nuvem"
            >
              <GeometricIcon name="cloud" size={18} />
            </button>
            <button
              type="button"
              className="floating-icon-button floating-icon-button--label"
              onClick={() => void shareBoard()}
              aria-label="Share board"
              title="Share"
            >
              <GeometricIcon name="geometry" size={18} framed />
              <span>Compartilhar</span>
            </button>
            <button type="button" className="profile-chip" aria-label="Workspace profile" title="Workspace profile">
              <span>DS</span>
            </button>
            <button type="button" className="sidebar-mini-action sidebar-mini-action--ghost topbar-chevron" aria-label="Abrir perfil" title="Abrir perfil">
              <GeometricIcon name="chevron-down" size={16} />
            </button>
          </div>
        </header>

        {menuOpen && (
          <>
            <button
              type="button"
              className="overlay-scrim"
              onClick={() => setMenuOpen(false)}
              aria-label="Close main menu"
            />
            <aside className="floating-panel main-menu-panel">
              <div className="floating-panel__header">
                <div>
                  <span className="panel-kicker">Boards</span>
                  <h2>Workspace</h2>
                </div>
                <button type="button" className="floating-icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <GeometricIcon name="close" size={16} />
                </button>
              </div>

              <div className="main-menu-panel__actions">
                <button type="button" className="menu-action" onClick={createBoard}>
                  <GeometricIcon name="plus" size={16} />
                  <span>New board</span>
                </button>
                <button type="button" className="menu-action" onClick={renameBoard}>
                  <GeometricIcon name="text" size={16} />
                  <span>Rename board</span>
                </button>
                <button type="button" className="menu-action menu-action--danger" onClick={clearBoard}>
                  <GeometricIcon name="trash" size={16} />
                  <span>Clear board</span>
                </button>
              </div>

              <div className="board-list">
                {boards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    className={`board-list__item ${board.id === activeBoardId ? 'board-list__item--active' : ''}`}
                    onClick={() => openBoard(board.id)}
                  >
                    <div>
                      <strong>{board.name}</strong>
                      <span>{board.id === activeBoardId ? 'Current board' : 'Open board'}</span>
                    </div>
                    <GeometricIcon name="chevron-right" size={16} />
                  </button>
                ))}
              </div>
            </aside>
          </>
        )}

        {assetsOpen && (
          <>
            <button
              type="button"
              className="overlay-scrim"
              onClick={() => setAssetsOpen(false)}
              aria-label="Close assets panel"
            />
            <aside className="floating-panel assets-panel">
              <div className="floating-panel__header">
                <div>
                  <span className="panel-kicker">Library</span>
                  <h2>Board assets</h2>
                </div>
                <button type="button" className="floating-icon-button" onClick={() => setAssetsOpen(false)} aria-label="Close assets">
                  <GeometricIcon name="close" size={16} />
                </button>
              </div>

              <div className="assets-panel__actions">
                <button type="button" className="menu-action" onClick={() => void openPastePanel()}>
                  <GeometricIcon name="copy" size={16} />
                  <span>Paste content</span>
                </button>
                <button
                  type="button"
                  className="menu-action"
                  onClick={() => setMediaInteractionEnabled((enabled) => !enabled)}
                >
                  <GeometricIcon name="arrow" size={16} />
                  <span>{mediaInteractionEnabled ? 'Lock media' : 'Play media'}</span>
                </button>
              </div>

              <div className="asset-list">
                {assets.length ? (
                  assets.map((asset) => (
                    <button key={asset.id} type="button" className="asset-card" onClick={() => focusShape(asset.id)}>
                      <div className="asset-card__thumb">
                        {asset.previewUrl ? (
                          <img src={asset.previewUrl} alt={asset.title} />
                        ) : asset.type === 'media' ? (
                          <GeometricIcon name="arrow" size={18} />
                        ) : asset.type === 'bookmark' ? (
                          <GeometricIcon name="link" size={18} />
                        ) : asset.type === 'note' ? (
                          <GeometricIcon name="note" size={18} />
                        ) : asset.type === 'text' ? (
                          <GeometricIcon name="text" size={18} />
                        ) : (
                          <GeometricIcon name="image" size={18} />
                        )}
                      </div>
                      <div className="asset-card__copy">
                        <strong>{asset.title}</strong>
                        <span>{asset.subtitle}</span>
                      </div>
                      <GeometricIcon name="chevron-right" size={14} />
                    </button>
                  ))
                ) : (
                  <div className="asset-empty">
                    <strong>No assets yet</strong>
                    <span>Paste images, links, reels, shorts, or text directly onto the board.</span>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}

        {pasteOpen && (
          <>
            <button
              type="button"
              className="overlay-scrim"
              onClick={() => setPasteOpen(false)}
              aria-label="Close paste panel"
            />
            <div className="dialog-shell">
              <div className="dialog-card">
                <div className="floating-panel__header">
                  <div>
                    <span className="panel-kicker">Paste</span>
                    <h2>Add content to the board</h2>
                  </div>
                  <button type="button" className="floating-icon-button" onClick={() => setPasteOpen(false)} aria-label="Close paste dialog">
                    <GeometricIcon name="close" size={16} />
                  </button>
                </div>

                <p className="dialog-card__description">
                  Paste links, notes, or copied text. Images can be pasted directly with Ctrl+V / Cmd+V.
                </p>

                <textarea
                  value={pasteValue}
                  onChange={(event) => setPasteValue(event.target.value)}
                  placeholder="Paste links, notes, or a block of text"
                />

                <div className="dialog-card__actions">
                  <button type="button" className="secondary-button" onClick={() => void pasteFromClipboard()}>
                    <GeometricIcon name="copy" size={16} />
                    <span>Use clipboard</span>
                  </button>
                  <button type="button" className="primary-button" onClick={saveManualPaste}>
                    <GeometricIcon name="chevron-right" size={16} />
                    <span>Add to board</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {boardDialog && (
          <>
            <button
              type="button"
              className="overlay-scrim"
              onClick={() => setBoardDialog(null)}
              aria-label="Close board dialog"
            />
            <div className="dialog-shell">
              <div className="dialog-card dialog-card--compact">
                <div className="floating-panel__header">
                  <div>
                    <span className="panel-kicker">Board</span>
                    <h2>{boardDialog.mode === 'create' ? 'Create a new board' : 'Rename current board'}</h2>
                  </div>
                  <button type="button" className="floating-icon-button" onClick={() => setBoardDialog(null)} aria-label="Close board dialog">
                    <GeometricIcon name="close" size={16} />
                  </button>
                </div>

                <input
                  value={boardDraft}
                  onChange={(event) => setBoardDraft(event.target.value)}
                  placeholder="Board name"
                  autoFocus
                />

                <div className="dialog-card__actions">
                  <button type="button" className="secondary-button" onClick={() => setBoardDialog(null)}>
                    <span>Cancel</span>
                  </button>
                  <button type="button" className="primary-button" onClick={submitBoardDialog}>
                    <span>{boardDialog.mode === 'create' ? 'Create board' : 'Save name'}</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="editor-canvas">
          <Tldraw
            hideUi
            persistenceKey="whiteboard-studio-autosave"
            onMount={setEditor}
            shapeUtils={shapeUtils}
            autoFocus
          />
        </div>

        <div className="canvas-accent-banner" aria-hidden="true">
          <div className="canvas-accent-banner__line" />
          <span>Timeless geometry, modern sketching</span>
          <div className="canvas-accent-banner__line" />
        </div>

        <div className="canvas-quick-actions" aria-label="Ações rápidas do canvas">
          <button type="button" className="floating-icon-button" onClick={() => activateTool('hand')} aria-label="Mover canvas" title="Mover canvas">
            <GeometricIcon name="hand" size={16} />
          </button>
          <button type="button" className="floating-icon-button" onClick={() => setStatusMessage('Os controles de distribuição entram no próximo passo.')} aria-label="Distribuição" title="Distribuição">
            <GeometricIcon name="distribute" size={16} />
          </button>
          <button type="button" className="floating-icon-button" onClick={() => setStatusMessage('Os layouts rápidos entram no próximo passo.')} aria-label="Layouts" title="Layouts">
            <GeometricIcon name="layout" size={16} />
          </button>
          <button type="button" className="floating-icon-button" onClick={() => setStatusMessage('A grade modular entra no próximo passo.')} aria-label="Grade modular" title="Grade modular">
            <GeometricIcon name="layers" size={16} />
          </button>
        </div>

          <div className={`canvas-center-watermark ${isBoardEmpty ? 'canvas-center-watermark--visible' : 'canvas-center-watermark--faded'}`} aria-hidden="true">
            <div className="canvas-center-watermark__motif-shell">
              <div className="canvas-center-watermark__motif">
                <img src={canvasCenterMotif} alt="" className="canvas-center-watermark__image" />
              </div>
            </div>
          </div>

        {!assetsOpen && !menuOpen && !pasteOpen && !boardDialog && (
          <aside className={`floating-panel properties-panel ${mobilePropertiesOpen ? 'properties-panel--mobile-open' : ''}`}>
            <div className="floating-panel__header">
              <div>
                <h2>Propriedades</h2>
              </div>
              <button type="button" className="sidebar-mini-action sidebar-mini-action--ghost properties-panel__collapse" aria-label="Recolher painel" title="Recolher painel">
                <GeometricIcon name="chevron-left" size={15} />
              </button>
            </div>

            {!hasSelection && (
              <div className="properties-empty">
                <span>Selecione um elemento para ajustar aparência, camadas e ações.</span>
              </div>
            )}

            <div className="properties-panel__section">
              <span>Aparência</span>
              <div className="swatch-row">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch color-swatch--${color} ${colorStyle === color ? 'is-active' : ''}`}
                    onClick={() => applyStyle(DefaultColorStyle, color)}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>

            {!isMediaSelection && (
              <div className="properties-panel__section">
                <span>Traço</span>
                <div className="stroke-chip-row">
                  {DASH_BUTTONS.map((dash) => (
                    <button
                      key={dash.value}
                      type="button"
                      className={`stroke-chip ${dashStyle === dash.value ? 'stroke-chip--active' : ''}`}
                      onClick={() => applyStyle(DefaultDashStyle, dash.value)}
                      aria-label={dash.label}
                      title={dash.label}
                    >
                      <GeometricIcon name={dash.icon} size={18} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="properties-panel__section">
              <span>Espessura</span>
              <div className="stepper-row">
                <button type="button" className="secondary-icon-button" onClick={() => changeSizeStyle(-1)} aria-label="Reduzir espessura">
                  <GeometricIcon name="minus" size={16} />
                </button>
                <div className="stepper-value">
                  <strong>{sizeIndex + 1}</strong>
                  <span>px</span>
                </div>
                <button type="button" className="secondary-icon-button" onClick={() => changeSizeStyle(1)} aria-label="Aumentar espessura">
                  <GeometricIcon name="plus" size={16} />
                </button>
              </div>
            </div>

            <div className="properties-panel__section">
              <span>Opacidade</span>
              <div className="opacity-row">
                <strong>100%</strong>
                <div className="opacity-rail" aria-hidden="true">
                  <span />
                </div>
              </div>
            </div>

            <div className="properties-panel__section">
              <span>Camadas</span>
              <div className="inline-actions">
                <button type="button" className="secondary-icon-button" onClick={bringSelectionToFront} title="Trazer para frente" disabled={!hasSelection}>
                  <GeometricIcon name="front" size={16} />
                </button>
                <button type="button" className="secondary-icon-button" onClick={duplicateSelection} title="Duplicar" disabled={!hasSelection}>
                  <GeometricIcon name="duplicate" size={16} />
                </button>
                <button type="button" className="secondary-icon-button secondary-icon-button--danger" onClick={deleteSelection} title="Excluir" disabled={!hasSelection}>
                  <GeometricIcon name="trash" size={16} />
                </button>
              </div>
            </div>

            <div className="properties-panel__section">
              <span>Alinhamento</span>
              <div className="inline-actions">
                <button type="button" className="secondary-icon-button" onClick={() => setStatusMessage('O alinhamento à esquerda entra no próximo passo.')} title="Alinhar à esquerda">
                  <GeometricIcon name="align-left" size={16} />
                </button>
                <button type="button" className="secondary-icon-button" onClick={() => setStatusMessage('O alinhamento central entra no próximo passo.')} title="Centralizar">
                  <GeometricIcon name="align-center" size={16} />
                </button>
                <button type="button" className="secondary-icon-button" onClick={() => setStatusMessage('O alinhamento à direita entra no próximo passo.')} title="Alinhar à direita">
                  <GeometricIcon name="align-right" size={16} />
                </button>
              </div>
            </div>

            <div className="properties-panel__section">
              <span>Ações</span>
              <div className="inline-actions inline-actions--stack">
                <button
                  type="button"
                  className="secondary-button secondary-button--full"
                  onClick={() => setStatusMessage('O bloqueio inteligente entra no próximo passo.')}
                >
                  <GeometricIcon name="lock" size={16} />
                  <span>Bloquear</span>
                </button>
                <button
                  type="button"
                  className="secondary-button secondary-button--full"
                  onClick={() => setStatusMessage('O agrupamento visual entra no próximo passo.')}
                >
                  <GeometricIcon name="group" size={16} />
                  <span>Agrupar</span>
                </button>
              </div>
            </div>
          </aside>
        )}

        <div className="floating-toolbar floating-toolbar--dock" role="toolbar" aria-label="Drawing tools">
          {TOOLBAR_TOOLS.map((tool) => (
            <Fragment key={tool.id}>
              <ToolButton
                active={activeTool === tool.id}
                icon={tool.icon}
                label={tool.label}
                onClick={() => activateTool(tool.id)}
              />
              {DOCK_DIVIDERS.has(tool.id) ? <span className="dock-divider" aria-hidden="true" /> : null}
            </Fragment>
          ))}
          <button
            type="button"
            className="tool-button"
            onClick={addStickyNote}
            aria-label="Sticky notes"
            title="Sticky notes"
          >
            <GeometricIcon name="note" size={18} />
            <span>Notas</span>
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={addImagePrompt}
            aria-label="Image"
            title="Image"
          >
            <GeometricIcon name="image" size={18} />
            <span>Imagens</span>
          </button>
          <button
            type="button"
            className={`tool-button tool-button--accent ${accentToolActive ? 'tool-button--active tool-button--accent-active' : ''}`}
            onClick={activateGeometricMode}
            aria-label="Geometric tool"
            title="Geometric tool"
          >
            <GeometricMotifIcon />
            <span>Motif</span>
          </button>
        </div>

        <div className="zoom-controls" aria-label="Zoom controls">
          <button type="button" className="floating-icon-button" onClick={zoomOut} aria-label="Zoom out">
            <GeometricIcon name="minus" size={16} />
          </button>
          <button type="button" className="zoom-controls__level" onClick={zoomToFit} title="Zoom to fit">
            {Math.round(zoomLevel * 100)}%
          </button>
          <button type="button" className="floating-icon-button" onClick={zoomIn} aria-label="Zoom in">
            <GeometricIcon name="plus" size={16} />
          </button>
          <button type="button" className="floating-icon-button" onClick={zoomToFit} aria-label="Fullscreen view" title="Fullscreen view">
            <GeometricIcon name="fullscreen" size={16} />
          </button>
        </div>

        <button
          type="button"
          className={`minimap-toggle ${mobileMinimapOpen ? 'minimap-toggle--active' : ''}`}
          onClick={() => setMobileMinimapOpen((open) => !open)}
          aria-label="Toggle minimap"
        >
          <GeometricIcon name="layout" size={16} />
          <span>Mapa</span>
        </button>

        {minimap && (
          <aside className={`minimap-panel ${mobileMinimapOpen ? 'minimap-panel--open' : ''}`}>
            <div className="minimap-panel__header">
              <div>
                <span className="panel-kicker">Navigator</span>
                <strong>{boardName}</strong>
              </div>
              <button type="button" className="sidebar-mini-action minimap-panel__close" onClick={() => setMobileMinimapOpen(false)} aria-label="Close minimap">
                <GeometricIcon name="close" size={14} />
              </button>
            </div>
            <div className="minimap-panel__viewport">
              <svg viewBox="0 0 100 100" role="img" aria-label="Board minimap">
                <rect x="0" y="0" width="100" height="100" rx="12" className="minimap-scene" />
                {minimap.shapes.map((shape) => (
                  <rect
                    key={shape.id}
                    x={clamp(shape.x, 1, 98)}
                    y={clamp(shape.y, 1, 98)}
                    width={Math.max(shape.w, 1.4)}
                    height={Math.max(shape.h, 1.4)}
                    rx="1.8"
                    className={`minimap-shape ${selectedShapeIds.includes(shape.id) ? 'minimap-shape--active' : ''}`}
                  />
                ))}
                <rect
                  x={clamp(minimap.viewport.x, 0.8, 98)}
                  y={clamp(minimap.viewport.y, 0.8, 98)}
                  width={Math.max(minimap.viewport.w, 6)}
                  height={Math.max(minimap.viewport.h, 6)}
                  rx="4"
                  className="minimap-window"
                />
              </svg>
            </div>
            <div className="minimap-panel__meta">
              <span>{Math.round(zoomLevel * 100)}% zoom</span>
              <span>{assetCountLabel}</span>
            </div>
          </aside>
        )}

        {mobileToolsOpen && (
          <>
            <button
              type="button"
              className="overlay-scrim overlay-scrim--mobile"
              onClick={() => setMobileToolsOpen(false)}
              aria-label="Close tools"
            />
            <div className="mobile-tools-sheet">
              <div className="mobile-tools-sheet__header">
                <div>
                  <span className="panel-kicker">Ferramentas</span>
                  <strong>Escolha sua próxima ação</strong>
                </div>
                <button type="button" className="sidebar-mini-action" onClick={() => setMobileToolsOpen(false)} aria-label="Close tools">
                  <GeometricIcon name="close" size={14} />
                </button>
              </div>
              <div className="mobile-toolbar" role="toolbar" aria-label="Mobile tools">
                {TOOLBAR_TOOLS.map((tool) => (
                  <ToolButton
                    key={tool.id}
                    compact
                    active={activeTool === tool.id}
                    icon={tool.icon}
                    label={tool.label}
                    onClick={() => activateTool(tool.id)}
                  />
                ))}
                <button type="button" className="tool-button tool-button--compact" onClick={addStickyNote} aria-label="Sticky notes">
                  <GeometricIcon name="note" size={18} />
                  <span>Notas</span>
                </button>
                <button type="button" className="tool-button tool-button--compact" onClick={addImagePrompt} aria-label="Image">
                  <GeometricIcon name="image" size={18} />
                  <span>Imagens</span>
                </button>
                <button
                  type="button"
                  className={`tool-button tool-button--compact tool-button--accent ${accentToolActive ? 'tool-button--active tool-button--accent-active' : ''}`}
                  onClick={activateGeometricMode}
                  aria-label="Geometric tool"
                >
                  <CanvasWatermarkMotif />
                  <span>Geo</span>
                </button>
              </div>
            </div>
          </>
        )}

        <div className="mobile-bottom-nav" aria-label="Mobile navigation">
          <button type="button" className="mobile-bottom-nav__item" onClick={() => openSidebarSection('files')}>
            <GeometricIcon name="files" size={16} />
            <span>Arquivos</span>
          </button>
          <button type="button" className="mobile-bottom-nav__item" onClick={() => openSidebarSection('library')}>
            <GeometricIcon name="library" size={16} />
            <span>Biblioteca</span>
          </button>
          <button
            type="button"
            className="mobile-bottom-nav__item mobile-bottom-nav__item--primary"
            onClick={() => {
              setMobileToolsOpen((open) => !open)
              setMobilePropertiesOpen(false)
              setMobileMinimapOpen(false)
            }}
          >
            <GeometricIcon name="plus" size={18} />
            <span>+</span>
          </button>
          <button type="button" className="mobile-bottom-nav__item" onClick={() => openSidebarSection('shared')}>
            <GeometricIcon name="shared" size={16} />
            <span>Compart.</span>
          </button>
          <button
            type="button"
            className={`mobile-bottom-nav__item ${mobilePropertiesOpen ? 'mobile-bottom-nav__item--active' : ''}`}
            onClick={() => {
              if (!hasSelection) {
                setStatusMessage('Select an item to edit its properties.')
                return
              }
              setMobilePropertiesOpen((open) => !open)
              setMobileToolsOpen(false)
            }}
          >
            <GeometricIcon name="settings" size={16} />
            <span>Ajustes</span>
          </button>
        </div>

        {statusMessage && <div className="status-toast">{statusMessage}</div>}
      </div>
    </div>
  )
}

export default App


