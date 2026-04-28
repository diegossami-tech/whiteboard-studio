import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BringToFront,
  Circle,
  Compass,
  Copy,
  CopyPlus,
  Eraser,
  Hand,
  Image,
  Layers3,
  Link2,
  Menu,
  Minus,
  MousePointer2,
  PencilLine,
  Plus,
  Redo2,
  Search,
  Share2,
  Square,
  Sparkles,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  UserCircle2,
  X,
} from 'lucide-react'
import {
  createEmptyBookmarkShape,
  createShapeId,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
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
import { INSTAGRAM_REEL_SHAPE_TYPE, InstagramReelShapeUtil } from './shapes/InstagramReelShapeUtil'
import './App.css'

type MediaPasteItem =
  | { kind: 'youtube'; layout: 'video' | 'short'; url: string }
  | { kind: 'instagram-reel'; url: string }
  | { kind: 'bookmark'; url: string }

type BoardEntry = Pick<TLPage, 'id' | 'name'>
type ToolbarTool = 'select' | 'hand' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'draw' | 'eraser'
type BoardDialogState = { mode: 'create' | 'rename' } | null
type AssetSummary = {
  id: TLShapeId
  type: 'image' | 'media' | 'bookmark' | 'text' | 'note'
  title: string
  subtitle: string
  previewUrl?: string
}

type CanvasRect = { x: number; y: number; w: number; h: number }

const COLOR_OPTIONS = ['black', 'blue', 'green', 'yellow', 'red'] as const
const FILL_OPTIONS = ['none', 'semi', 'solid'] as const
const SIZE_OPTIONS = ['s', 'm', 'l', 'xl'] as const
const DASH_OPTIONS = ['draw', 'solid', 'dashed', 'dotted'] as const
const FONT_OPTIONS = ['draw', 'sans', 'serif', 'mono'] as const

const TOOLBAR_TOOLS: Array<{
  id: ToolbarTool
  label: string
  icon: typeof MousePointer2
}> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'hand', label: 'Hand', icon: Hand },
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Circle', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'draw', label: 'Draw', icon: PencilLine },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
]

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
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  compact?: boolean
  icon: typeof MousePointer2
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
      <Icon size={18} />
      {!compact && <span>{label}</span>}
    </button>
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
  const [pasteValue, setPasteValue] = useState('')
  const [boardDialog, setBoardDialog] = useState<BoardDialogState>(null)
  const [boardDraft, setBoardDraft] = useState('')
  const [mediaInteractionEnabled, setMediaInteractionEnabled] = useState(false)
  const [mobileMinimapOpen, setMobileMinimapOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Paste images, links, or text straight onto the board.')
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
    setMobileMinimapOpen(false)
  }, [boards.length])

  const renameBoard = useCallback(() => {
    if (!editor || !activeBoardId) return
    const page = editor.getPage(activeBoardId)
    if (!page) return
    setBoardDraft(page.name)
    setBoardDialog({ mode: 'rename' })
    setMenuOpen(false)
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

  const selectedShapes = useMemo(() => {
    if (!editor) return []
    return selectedShapeIds
      .map((id) => editor.getShape(id))
      .filter((shape): shape is TLShape => Boolean(shape))
  }, [editor, selectedShapeIds])

  const primarySelectedShape = selectedShapes[0] ?? null
  const hasSelection = selectedShapes.length > 0
  const isMediaSelection = selectedShapes.some(
    (shape) => shape.type === 'embed' || shape.type === INSTAGRAM_REEL_SHAPE_TYPE
  )
  const hasTextSelection = selectedShapes.some((shape) => shape.type === 'text' || shape.type === 'note')

  const colorStyle = getKnownStyle(editor, DefaultColorStyle, 'black')
  const fillStyle = getKnownStyle(editor, DefaultFillStyle, 'none')
  const sizeStyle = getKnownStyle(editor, DefaultSizeStyle, 'm')
  const dashStyle = getKnownStyle(editor, DefaultDashStyle, 'draw')
  const fontStyle = getKnownStyle(editor, DefaultFontStyle, 'sans')

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

  const boardName = boards.find((board) => board.id === activeBoardId)?.name ?? 'Board'
  const boardCountLabel = `${boards.length} board${boards.length === 1 ? '' : 's'}`
  const assetCountLabel = `${assets.length} asset${assets.length === 1 ? '' : 's'}`
  const quickAssets = assets.slice(0, 4)

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

  return (
    <div className={`whiteboard-app ${mediaInteractionEnabled ? 'media-live' : 'media-locked'}`}>
      <div className="canvas-shell">
        <div className="canvas-grid-layer" aria-hidden="true" />
        <div className="ornament-corner ornament-corner--top-left" aria-hidden="true" />
        <div className="ornament-corner ornament-corner--top-right" aria-hidden="true" />
        <div className="ornament-corner ornament-corner--bottom-left" aria-hidden="true" />
        <div className="ornament-corner ornament-corner--bottom-right" aria-hidden="true" />

        <aside className="workspace-sidebar">
          <div className="workspace-brand">
            <div className="workspace-brand__mark" aria-hidden="true">
              <div className="workspace-brand__star" />
            </div>
            <div className="workspace-brand__copy">
              <span className="workspace-brand__eyebrow">Whiteboard Studio</span>
              <strong>Geometry Workspace</strong>
            </div>
          </div>

          <div className="workspace-search">
            <Search size={16} />
            <span>Search boards and assets</span>
          </div>

          <section className="workspace-sidebar__section">
            <div className="workspace-sidebar__section-header">
              <span className="panel-kicker">Workspace</span>
              <button type="button" className="sidebar-mini-action" onClick={createBoard} aria-label="Create board">
                <Plus size={15} />
              </button>
            </div>
            <div className="workspace-sidebar__summary">
              <div>
                <strong>{boardCountLabel}</strong>
                <span>Layered, persistent boards</span>
              </div>
              <div>
                <strong>{assetCountLabel}</strong>
                <span>Images, embeds, and notes</span>
              </div>
            </div>
          </section>

          <section className="workspace-sidebar__section">
            <div className="workspace-sidebar__section-header">
              <span className="panel-kicker">Boards</span>
              <button
                type="button"
                className="sidebar-link-button"
                onClick={() => {
                  setMenuOpen(true)
                  setAssetsOpen(false)
                }}
              >
                Open menu
              </button>
            </div>
            <div className="sidebar-board-list">
              {boards.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  className={`sidebar-board-card ${board.id === activeBoardId ? 'sidebar-board-card--active' : ''}`}
                  onClick={() => openBoard(board.id)}
                >
                  <div className="sidebar-board-card__glyph" aria-hidden="true">
                    <Compass size={15} />
                  </div>
                  <div className="sidebar-board-card__copy">
                    <strong>{board.name}</strong>
                    <span>{board.id === activeBoardId ? 'Current canvas' : 'Switch board'}</span>
                  </div>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </section>

          <section className="workspace-sidebar__section workspace-sidebar__section--library">
            <div className="workspace-sidebar__section-header">
              <span className="panel-kicker">Library</span>
              <button
                type="button"
                className="sidebar-link-button"
                onClick={() => {
                  setAssetsOpen(true)
                  setMenuOpen(false)
                }}
              >
                View all
              </button>
            </div>
            {quickAssets.length ? (
              <div className="sidebar-asset-stack">
                {quickAssets.map((asset) => (
                  <button key={asset.id} type="button" className="sidebar-asset-card" onClick={() => focusShape(asset.id)}>
                    <div className="sidebar-asset-card__thumb">
                      {asset.previewUrl ? (
                        <img src={asset.previewUrl} alt={asset.title} />
                      ) : asset.type === 'media' ? (
                        <ArrowUpRight size={16} />
                      ) : asset.type === 'bookmark' ? (
                        <Link2 size={16} />
                      ) : asset.type === 'note' ? (
                        <StickyNote size={16} />
                      ) : asset.type === 'text' ? (
                        <Type size={16} />
                      ) : (
                        <Image size={16} />
                      )}
                    </div>
                    <div className="sidebar-asset-card__copy">
                      <strong>{asset.title}</strong>
                      <span>{asset.subtitle}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="sidebar-empty-state">
                <Sparkles size={16} />
                <div>
                  <strong>Start with a paste</strong>
                  <span>Drop screenshots, links, or text onto the board.</span>
                </div>
              </div>
            )}
          </section>
        </aside>

        <header className="app-topbar">
          <div className="app-topbar__left">
            <button
              type="button"
              className="floating-icon-button"
              onClick={() => {
                setMenuOpen((open) => !open)
                setAssetsOpen(false)
                setMobileMinimapOpen(false)
              }}
              aria-label="Open main menu"
              title="Main menu"
            >
              <Menu size={18} />
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
                <Undo2 size={18} />
              </button>
              <button
                type="button"
                className="floating-icon-button"
                onClick={redo}
                aria-label="Redo"
                title="Redo"
                disabled={!canRedo}
              >
                <Redo2 size={18} />
              </button>
            </div>
          </div>

          <div className="app-topbar__center">
            <div className="floating-toolbar" role="toolbar" aria-label="Drawing tools">
              {TOOLBAR_TOOLS.map((tool) => (
                <ToolButton
                  key={tool.id}
                  active={activeTool === tool.id}
                  icon={tool.icon}
                  label={tool.label}
                  onClick={() => activateTool(tool.id)}
                />
              ))}
            </div>
          </div>

          <div className="app-topbar__right">
            <div className="board-badge board-badge--board">
              <Layers3 size={16} />
              <span>{boardName}</span>
            </div>
            <button
              type="button"
              className="floating-icon-button floating-icon-button--label"
              onClick={openPastePanel}
              aria-label="Open paste panel"
              title="Paste"
            >
              <Copy size={18} />
              <span>Paste</span>
            </button>
            <button
              type="button"
              className="floating-icon-button floating-icon-button--label"
              onClick={() => {
                setAssetsOpen((open) => !open)
                setMenuOpen(false)
                setMobileMinimapOpen(false)
              }}
              aria-label="Open assets"
              title="Assets"
            >
              <BookOpen size={18} />
              <span>Assets</span>
            </button>
            <button
              type="button"
              className="floating-icon-button floating-icon-button--label"
              onClick={() => void shareBoard()}
              aria-label="Share board"
              title="Share"
            >
              <Share2 size={18} />
              <span>Share</span>
            </button>
            <button type="button" className="profile-chip" aria-label="Workspace profile" title="Workspace profile">
              <UserCircle2 size={18} />
              <span>DS</span>
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
                  <X size={16} />
                </button>
              </div>

              <div className="main-menu-panel__actions">
                <button type="button" className="menu-action" onClick={createBoard}>
                  <Plus size={16} />
                  <span>New board</span>
                </button>
                <button type="button" className="menu-action" onClick={renameBoard}>
                  <Type size={16} />
                  <span>Rename board</span>
                </button>
                <button type="button" className="menu-action menu-action--danger" onClick={clearBoard}>
                  <Trash2 size={16} />
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
                    <ArrowRight size={16} />
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
                  <X size={16} />
                </button>
              </div>

              <div className="assets-panel__actions">
                <button type="button" className="menu-action" onClick={() => void openPastePanel()}>
                  <Copy size={16} />
                  <span>Paste content</span>
                </button>
                <button
                  type="button"
                  className="menu-action"
                  onClick={() => setMediaInteractionEnabled((enabled) => !enabled)}
                >
                  <ArrowUpRight size={16} />
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
                          <ArrowUpRight size={18} />
                        ) : asset.type === 'bookmark' ? (
                          <Link2 size={18} />
                        ) : asset.type === 'note' ? (
                          <StickyNote size={18} />
                        ) : asset.type === 'text' ? (
                          <Type size={18} />
                        ) : (
                          <Image size={18} />
                        )}
                      </div>
                      <div className="asset-card__copy">
                        <strong>{asset.title}</strong>
                        <span>{asset.subtitle}</span>
                      </div>
                      <ArrowRight size={14} />
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
                    <X size={16} />
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
                    <Copy size={16} />
                    <span>Use clipboard</span>
                  </button>
                  <button type="button" className="primary-button" onClick={saveManualPaste}>
                    <ArrowRight size={16} />
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
                    <X size={16} />
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

        {hasSelection && !assetsOpen && !menuOpen && !pasteOpen && !boardDialog && (
          <aside className="floating-panel properties-panel">
            <div className="floating-panel__header">
              <div>
                <span className="panel-kicker">Properties</span>
                <h2>
                  {selectedShapes.length > 1
                    ? `${selectedShapes.length} items selected`
                    : primarySelectedShape?.type === INSTAGRAM_REEL_SHAPE_TYPE
                      ? 'Instagram Reel'
                      : primarySelectedShape?.type === 'embed'
                        ? 'Embedded media'
                        : primarySelectedShape?.type === 'bookmark'
                          ? 'Bookmark card'
                          : primarySelectedShape?.type === 'image'
                            ? 'Image'
                            : primarySelectedShape?.type === 'note'
                              ? 'Sticky note'
                              : primarySelectedShape?.type === 'text'
                                ? 'Text block'
                                : 'Selection'}
                </h2>
              </div>
            </div>

            <div className="properties-panel__section">
              <span>Actions</span>
              <div className="inline-actions">
                <button type="button" className="secondary-icon-button" onClick={duplicateSelection} title="Duplicate">
                  <CopyPlus size={16} />
                </button>
                <button type="button" className="secondary-icon-button" onClick={bringSelectionToFront} title="Bring to front">
                  <BringToFront size={16} />
                </button>
                <button type="button" className="secondary-icon-button secondary-icon-button--danger" onClick={deleteSelection} title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {isMediaSelection && (
              <div className="properties-panel__section">
                <span>Embedded media</span>
                <button
                  type="button"
                  className="secondary-button secondary-button--full"
                  onClick={() => setMediaInteractionEnabled((enabled) => !enabled)}
                >
                  <ArrowUpRight size={16} />
                  <span>{mediaInteractionEnabled ? 'Lock embeds for editing' : 'Enable playback and interaction'}</span>
                </button>
              </div>
            )}

            <div className="properties-panel__section">
              <span>Stroke color</span>
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
                <span>Fill</span>
                <div className="chip-row">
                  {FILL_OPTIONS.map((fill) => (
                    <button
                      key={fill}
                      type="button"
                      className={`chip-button ${fillStyle === fill ? 'chip-button--active' : ''}`}
                      onClick={() => applyStyle(DefaultFillStyle, fill)}
                    >
                      {fill}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isMediaSelection && (
              <div className="properties-panel__section">
                <span>Stroke</span>
                <div className="chip-row">
                  {DASH_OPTIONS.map((dash) => (
                    <button
                      key={dash}
                      type="button"
                      className={`chip-button ${dashStyle === dash ? 'chip-button--active' : ''}`}
                      onClick={() => applyStyle(DefaultDashStyle, dash)}
                    >
                      {dash}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="properties-panel__section">
              <span>Size</span>
              <div className="chip-row">
                {SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`chip-button ${sizeStyle === size ? 'chip-button--active' : ''}`}
                    onClick={() => applyStyle(DefaultSizeStyle, size)}
                  >
                    {size.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {hasTextSelection && (
              <div className="properties-panel__section">
                <span>Font</span>
                <div className="chip-row">
                  {FONT_OPTIONS.map((font) => (
                    <button
                      key={font}
                      type="button"
                      className={`chip-button ${fontStyle === font ? 'chip-button--active' : ''}`}
                      onClick={() => applyStyle(DefaultFontStyle, font)}
                    >
                      {font}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        <div className="zoom-controls" aria-label="Zoom controls">
          <button type="button" className="floating-icon-button" onClick={zoomOut} aria-label="Zoom out">
            <Minus size={16} />
          </button>
          <button type="button" className="zoom-controls__level" onClick={zoomToFit} title="Zoom to fit">
            {Math.round(zoomLevel * 100)}%
          </button>
          <button type="button" className="floating-icon-button" onClick={zoomIn} aria-label="Zoom in">
            <Plus size={16} />
          </button>
        </div>

        <button
          type="button"
          className={`minimap-toggle ${mobileMinimapOpen ? 'minimap-toggle--active' : ''}`}
          onClick={() => setMobileMinimapOpen((open) => !open)}
          aria-label="Toggle minimap"
        >
          <Compass size={16} />
          <span>Map</span>
        </button>

        {minimap && (
          <aside className={`minimap-panel ${mobileMinimapOpen ? 'minimap-panel--open' : ''}`}>
            <div className="minimap-panel__header">
              <div>
                <span className="panel-kicker">Navigator</span>
                <strong>{boardName}</strong>
              </div>
              <button type="button" className="sidebar-mini-action minimap-panel__close" onClick={() => setMobileMinimapOpen(false)} aria-label="Close minimap">
                <X size={14} />
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
        </div>

        {statusMessage && <div className="status-toast">{statusMessage}</div>}
      </div>
    </div>
  )
}

export default App
