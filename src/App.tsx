import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BringToFront,
  Copy,
  Crop,
  FolderPlus,
  LayoutDashboard,
  MessageSquareText,
  Move,
  Minus,
  PenTool,
  RectangleVertical,
  Plus,
  Search,
  StickyNote,
  Type,
  Pencil,
} from 'lucide-react'
import {
  Tldraw,
  PageRecordType,
  createEmptyBookmarkShape,
  createShapeId,
  toRichText,
  type Editor,
  type TLComponents,
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
type FolderEntry = Pick<TLPage, 'id' | 'name'>
type PortraitEntry = { id: TLShapeId; name: string }
type MeasurementGuide = {
  id: string
  orientation: 'horizontal' | 'vertical'
  start: { x: number; y: number }
  end: { x: number; y: number }
  distance: number
}
type MeasurementOverlay = {
  guides: MeasurementGuide[]
  width: number
  height: number
}
type SavedItemSummary = {
  id: TLShapeId
  type: 'media' | 'bookmark' | 'image' | 'note' | 'text'
  title: string
  subtitle: string
  labelShapeId?: TLShapeId
  previewUrl?: string
}
type WorkspaceView = 'library' | 'edit'

const PORTRAIT_NAME_PREFIX = 'Retrato '
const PORTRAIT_WIDTH = 420
const PORTRAIT_HEIGHT = 740
const PORTRAIT_GAP = 48
const PORTRAIT_PADDING = 24
const FOLDER_STACK_ORIGIN_X = 96
const FOLDER_STACK_ORIGIN_Y = 88
const FOLDER_STACK_GAP = 56

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

function getSavedItemSummaries(editor: Editor): SavedItemSummary[] {
  const shapes = editor.getCurrentPageShapes()
  const shapeEntries = shapes.map((shape) => ({ shape, bounds: editor.getShapePageBounds(shape.id) }))
  const labelByShapeId = new Map<TLShapeId, string>()
  const labelShapeIdByShapeId = new Map<TLShapeId, TLShapeId>()
  const linkedTextShapeIds = new Set<TLShapeId>()

  for (const entry of shapeEntries) {
    if (
      !entry.bounds ||
      !['embed', INSTAGRAM_REEL_SHAPE_TYPE, 'bookmark', 'image'].includes(entry.shape.type)
    ) {
      continue
    }

    const targetBounds = entry.bounds

    const labelCandidate = shapeEntries.find((candidate) => {
      if (!candidate.bounds || candidate.shape.type !== 'text') return false
      const textValue = richTextToPlainText((candidate.shape.props as { richText?: unknown }).richText)
      if (!textValue) return false

      const verticalDistance = candidate.bounds.minY - targetBounds.maxY
      const horizontalOverlap = rangesOverlap(
        targetBounds.minX,
        targetBounds.maxX,
        candidate.bounds.minX,
        candidate.bounds.maxX
      )

      return verticalDistance >= 0 && verticalDistance <= 56 && horizontalOverlap
    })

    if (labelCandidate) {
      labelByShapeId.set(
        entry.shape.id,
        richTextToPlainText((labelCandidate.shape.props as { richText?: unknown }).richText)
      )
      labelShapeIdByShapeId.set(entry.shape.id, labelCandidate.shape.id)
      linkedTextShapeIds.add(labelCandidate.shape.id)
    }
  }

  return shapes
    .map<SavedItemSummary | null>((shape) => {
      if (shape.type === 'embed') {
        return {
          id: shape.id,
          type: 'media',
          title:
            labelByShapeId.get(shape.id) ||
            (typeof shape.props.url === 'string' && shape.props.url.includes('/shorts/')
              ? 'Short salvo'
              : 'Video salvo'),
          subtitle: 'Abra, renomeie e organize nesta pasta',
          labelShapeId: labelShapeIdByShapeId.get(shape.id),
        } satisfies SavedItemSummary
      }

      if (shape.type === INSTAGRAM_REEL_SHAPE_TYPE) {
        return {
          id: shape.id,
          type: 'media',
          title: labelByShapeId.get(shape.id) || 'Reel salvo',
          subtitle: 'Visualizavel e pronto para nomear',
          labelShapeId: labelShapeIdByShapeId.get(shape.id),
        } satisfies SavedItemSummary
      }

      if (shape.type === 'bookmark') {
        const title = labelByShapeId.get(shape.id) || 'Link salvo'
        let subtitle = 'Link'
        if (typeof shape.props.url === 'string') {
          try {
            subtitle = new URL(shape.props.url).hostname.replace(/^www\./, '')
          } catch {
            subtitle = 'Link'
          }
        }
        return {
          id: shape.id,
          type: 'bookmark',
          title,
          subtitle,
          labelShapeId: labelShapeIdByShapeId.get(shape.id),
        } satisfies SavedItemSummary
      }

      if (shape.type === 'image') {
        return {
          id: shape.id,
          type: 'image',
          title: labelByShapeId.get(shape.id) || 'Print salvo',
          subtitle: 'Imagem pronta para mover ou recortar',
          labelShapeId: labelShapeIdByShapeId.get(shape.id),
          previewUrl: typeof shape.props.url === 'string' ? shape.props.url : undefined,
        } satisfies SavedItemSummary
      }

      if (shape.type === 'note') {
        const text = richTextToPlainText(shape.props.richText)
        return {
          id: shape.id,
          type: 'note',
          title: text.split('\n')[0]?.slice(0, 42) || 'Nota salva',
          subtitle: 'Nota editavel dentro da pasta',
        } satisfies SavedItemSummary
      }

      if (shape.type === 'text') {
        if (linkedTextShapeIds.has(shape.id)) return null
        const text = richTextToPlainText(shape.props.richText)
        if (!text) return null
        return {
          id: shape.id,
          type: 'text',
          title: text.split('\n')[0]?.slice(0, 42) || 'Texto salvo',
          subtitle: text.includes('\n') ? 'Texto com mais conteudo' : 'Texto editavel',
        } satisfies SavedItemSummary
      }

      return null
    })
    .filter((item): item is SavedItemSummary => item !== null)
}

function getSavedItemTypeLabel(item: SavedItemSummary) {
  if (item.type === 'media') return 'Video'
  if (item.type === 'bookmark') return 'Link'
  if (item.type === 'image') return 'Print'
  if (item.type === 'note') return 'Nota'
  return 'Texto'
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.min(endA, endB) - Math.max(startA, startB) > 0
}

function getMeasurementOverlay(editor: Editor): MeasurementOverlay {
  const selectedShapeIds = editor.getSelectedShapeIds()
  const viewportBounds = editor.getViewportScreenBounds()

  if (selectedShapeIds.length !== 1) {
    return { guides: [], width: viewportBounds.width, height: viewportBounds.height }
  }

  const selectedBounds = editor.getShapePageBounds(selectedShapeIds[0])
  if (!selectedBounds) {
    return { guides: [], width: viewportBounds.width, height: viewportBounds.height }
  }

  const toLocalPoint = (point: { x: number; y: number }) => {
    const screenPoint = editor.pageToScreen(point)
    return {
      x: screenPoint.x - viewportBounds.minX,
      y: screenPoint.y - viewportBounds.minY,
    }
  }

  const others = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.id !== selectedShapeIds[0])
    .map((shape) => ({ shape, bounds: editor.getShapePageBounds(shape.id) }))
    .filter((entry): entry is { shape: TLShape; bounds: NonNullable<ReturnType<Editor['getShapePageBounds']>> } => Boolean(entry.bounds))

  let leftGuide: MeasurementGuide | null = null
  let rightGuide: MeasurementGuide | null = null
  let topGuide: MeasurementGuide | null = null
  let bottomGuide: MeasurementGuide | null = null

  for (const entry of others) {
    const otherBounds = entry.bounds

    if (rangesOverlap(selectedBounds.minY, selectedBounds.maxY, otherBounds.minY, otherBounds.maxY)) {
      const sharedCenterY =
        Math.max(selectedBounds.minY, otherBounds.minY) +
        (Math.min(selectedBounds.maxY, otherBounds.maxY) - Math.max(selectedBounds.minY, otherBounds.minY)) / 2

      if (otherBounds.maxX <= selectedBounds.minX) {
        const distance = selectedBounds.minX - otherBounds.maxX
        if (!leftGuide || distance < leftGuide.distance) {
          leftGuide = {
            id: `${entry.shape.id}-left`,
            orientation: 'horizontal',
            start: toLocalPoint({ x: otherBounds.maxX, y: sharedCenterY }),
            end: toLocalPoint({ x: selectedBounds.minX, y: sharedCenterY }),
            distance,
          }
        }
      }

      if (otherBounds.minX >= selectedBounds.maxX) {
        const distance = otherBounds.minX - selectedBounds.maxX
        if (!rightGuide || distance < rightGuide.distance) {
          rightGuide = {
            id: `${entry.shape.id}-right`,
            orientation: 'horizontal',
            start: toLocalPoint({ x: selectedBounds.maxX, y: sharedCenterY }),
            end: toLocalPoint({ x: otherBounds.minX, y: sharedCenterY }),
            distance,
          }
        }
      }
    }

    if (rangesOverlap(selectedBounds.minX, selectedBounds.maxX, otherBounds.minX, otherBounds.maxX)) {
      const sharedCenterX =
        Math.max(selectedBounds.minX, otherBounds.minX) +
        (Math.min(selectedBounds.maxX, otherBounds.maxX) - Math.max(selectedBounds.minX, otherBounds.minX)) / 2

      if (otherBounds.maxY <= selectedBounds.minY) {
        const distance = selectedBounds.minY - otherBounds.maxY
        if (!topGuide || distance < topGuide.distance) {
          topGuide = {
            id: `${entry.shape.id}-top`,
            orientation: 'vertical',
            start: toLocalPoint({ x: sharedCenterX, y: otherBounds.maxY }),
            end: toLocalPoint({ x: sharedCenterX, y: selectedBounds.minY }),
            distance,
          }
        }
      }

      if (otherBounds.minY >= selectedBounds.maxY) {
        const distance = otherBounds.minY - selectedBounds.maxY
        if (!bottomGuide || distance < bottomGuide.distance) {
          bottomGuide = {
            id: `${entry.shape.id}-bottom`,
            orientation: 'vertical',
            start: toLocalPoint({ x: sharedCenterX, y: selectedBounds.maxY }),
            end: toLocalPoint({ x: sharedCenterX, y: otherBounds.minY }),
            distance,
          }
        }
      }
    }
  }

  return {
    guides: [leftGuide, rightGuide, topGuide, bottomGuide].filter(
      (guide): guide is MeasurementGuide => Boolean(guide)
    ),
    width: viewportBounds.width,
    height: viewportBounds.height,
  }
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

    if (url.hostname.replace(/^www\./, '') === 'youtu.be') {
      const start = url.searchParams.get('t')
      if (start) params.set('start', start)
    } else {
      const start = url.searchParams.get('t')
      if (start) params.set('start', start)
    }

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
  return (
    text.match(/https?:\/\/[^\s]+/g)?.map((match) => match.trim().replace(/[),.;!?]+$/, '')) ?? []
  )
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

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

function getMediaItemSize(item: MediaPasteItem) {
  if (item.kind === 'youtube' && item.layout === 'video') {
    return { width: 800, height: 450 }
  }

  if (item.kind === 'bookmark') {
    return { width: 420, height: 480 }
  }

  return { width: 340, height: 604 }
}

function getMediaItemLabel(item: MediaPasteItem) {
  if (item.kind === 'youtube') {
    return item.layout === 'short' ? 'Short do YouTube' : 'Video do YouTube'
  }

  if (item.kind === 'instagram-reel') {
    return 'Reel do Instagram'
  }

  return 'Link salvo'
}

function getCurrentPortraits(editor: Editor): PortraitEntry[] {
  return editor
    .getCurrentPageShapes()
    .filter(
      (shape): shape is TLShape & { type: 'frame'; props: { name: string } } =>
        shape.type === 'frame' && typeof shape.props?.name === 'string' && shape.props.name.startsWith(PORTRAIT_NAME_PREFIX)
    )
    .sort((a, b) => a.x - b.x)
    .map((shape) => ({ id: shape.id, name: shape.props.name }))
}

function getBoundsForShapeIds(editor: Editor, shapeIds: TLShapeId[]) {
  const bounds = shapeIds
    .map((id) => editor.getShapePageBounds(id))
    .filter((bound): bound is NonNullable<typeof bound> => Boolean(bound))

  if (!bounds.length) return null

  const minX = Math.min(...bounds.map((bound) => bound.minX))
  const minY = Math.min(...bounds.map((bound) => bound.minY))
  const maxX = Math.max(...bounds.map((bound) => bound.maxX))
  const maxY = Math.max(...bounds.map((bound) => bound.maxY))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    center: {
      x: minX + (maxX - minX) / 2,
      y: minY + (maxY - minY) / 2,
    },
  }
}

function fitShapesToPortrait(editor: Editor, shapeIds: TLShapeId[], portraitId: TLShapeId) {
  if (!shapeIds.length) return

  const portraitBounds = editor.getShapePageBounds(portraitId)
  const contentBounds = getBoundsForShapeIds(editor, shapeIds)
  if (!portraitBounds || !contentBounds) return

  const targetWidth = Math.max(1, portraitBounds.width - PORTRAIT_PADDING * 2)
  const targetHeight = Math.max(1, portraitBounds.height - PORTRAIT_PADDING * 2)
  const scale = Math.min(targetWidth / contentBounds.width, targetHeight / contentBounds.height, 1)

  editor.run(() => {
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) {
      shapeIds.forEach((shapeId) => {
        editor.resizeShape(shapeId, { x: scale, y: scale }, { scaleOrigin: contentBounds.center })
      })
    }

    const fittedBounds = getBoundsForShapeIds(editor, shapeIds)
    if (!fittedBounds) return

    const deltaX = portraitBounds.center.x - fittedBounds.center.x
    const deltaY = portraitBounds.center.y - fittedBounds.center.y

    editor.updateShapes(
      shapeIds
        .map((shapeId) => editor.getShape(shapeId))
        .filter((shape): shape is TLShape => Boolean(shape))
        .map((shape) => ({
          id: shape.id,
          type: shape.type,
          x: shape.x + deltaX,
          y: shape.y + deltaY,
        }))
    )
  })
}

function getSelectedShapeIdsEligibleForPortrait(editor: Editor) {
  return editor
    .getSelectedShapeIds()
    .filter((shapeId) => {
      const shape = editor.getShape(shapeId)
      return shape && shape.type !== 'frame'
    })
}

function organizeMovedShapesInFolder(editor: Editor, shapeIds: TLShapeId[]) {
  const movedBounds = getBoundsForShapeIds(editor, shapeIds)
  if (!movedBounds) return

  const otherBounds = editor
    .getCurrentPageShapes()
    .filter((shape) => !shapeIds.includes(shape.id))
    .map((shape) => editor.getShapePageBounds(shape.id))
    .filter((bound): bound is NonNullable<typeof bound> => Boolean(bound))

  const nextY = otherBounds.length
    ? Math.max(...otherBounds.map((bound) => bound.maxY)) + FOLDER_STACK_GAP
    : FOLDER_STACK_ORIGIN_Y

  const deltaX = FOLDER_STACK_ORIGIN_X - movedBounds.x
  const deltaY = nextY - movedBounds.y

  editor.updateShapes(
    shapeIds
      .map((shapeId) => editor.getShape(shapeId))
      .filter((shape): shape is TLShape => Boolean(shape))
      .map((shape) => ({
        id: shape.id,
        type: shape.type,
        x: shape.x + deltaX,
        y: shape.y + deltaY,
      }))
  )
}

function createTextItemFromPaste(editor: Editor, plainText: string, point?: { x: number; y: number }) {
  const trimmedText = plainText.trim()
  if (!trimmedText) return null

  const center = point ?? editor.getViewportPageBounds().center
  const isNote = trimmedText.includes('\n') || trimmedText.length > 140
  const id = createShapeId()

  if (isNote) {
    editor.createShapes([
      {
        id,
        type: 'note',
        x: center.x - 120,
        y: center.y - 110,
        props: {
          richText: toRichText(trimmedText),
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
        y: center.y - 30,
        props: {
          w: 360,
          size: 'm',
          font: 'sans',
          richText: toRichText(trimmedText),
        },
      },
    ])
  }

  organizeMovedShapesInFolder(editor, [id])
  editor.setSelectedShapes([id])

  return {
    id,
    type: isNote ? 'note' : 'text',
  }
}

function createMediaItems(editor: Editor, items: MediaPasteItem[], point?: { x: number; y: number }) {
  const center = point ?? editor.getViewportPageBounds().center
  const gap = 40
  const columns = items.length === 1 ? 1 : Math.min(2, items.length)
  const sizedItems = items.map((item) => ({ item, ...getMediaItemSize(item) }))
  const rowCount = Math.ceil(sizedItems.length / columns)
  const rowHeights = Array.from({ length: rowCount }, (_, rowIndex) =>
    Math.max(...sizedItems.slice(rowIndex * columns, rowIndex * columns + columns).map((item) => item.height))
  )
  const totalHeight =
    rowHeights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, rowHeights.length - 1)
  let currentY = center.y - totalHeight / 2
  const createdShapeIds: TLShapeId[] = []

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowItems = sizedItems.slice(rowIndex * columns, rowIndex * columns + columns)
    const rowWidth =
      rowItems.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, rowItems.length - 1)
    let currentX = center.x - rowWidth / 2

    for (const sizedItem of rowItems) {
      const labelId = createShapeId()
      const labelText = getMediaItemLabel(sizedItem.item)

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
          {
            id: labelId,
            type: 'text',
            x: currentX,
            y: currentY + sizedItem.height + 12,
            props: {
              w: sizedItem.width,
              size: 's',
              font: 'sans',
              richText: toRichText(labelText),
            },
          },
        ])
        createdShapeIds.push(id, labelId)
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
          {
            id: labelId,
            type: 'text',
            x: currentX,
            y: currentY + sizedItem.height + 12,
            props: {
              w: sizedItem.width,
              size: 's',
              font: 'sans',
              richText: toRichText(labelText),
            },
          },
        ])
        createdShapeIds.push(id, labelId)
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

        editor.createShapes([
          {
            id: labelId,
            type: 'text',
            x: currentX,
            y: currentY + sizedItem.height + 12,
            props: {
              w: sizedItem.width,
              size: 's',
              font: 'sans',
              richText: toRichText(labelText),
            },
          },
        ])

        createdShapeIds.push(...bookmarkIds, labelId)
      }

      currentX += sizedItem.width + gap
    }

    currentY += rowHeights[rowIndex] + gap
  }

  return createdShapeIds
}

function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mediaInteractionEnabled, setMediaInteractionEnabled] = useState(false)
  const [folders, setFolders] = useState<FolderEntry[]>([])
  const [activeFolderId, setActiveFolderId] = useState<TLPageId | null>(null)
  const [, setPortraits] = useState<PortraitEntry[]>([])
  const [activePortraitId, setActivePortraitId] = useState<TLShapeId | null>(null)
  const [measurementOverlay, setMeasurementOverlay] = useState<MeasurementOverlay>({
    guides: [],
    width: 0,
    height: 0,
  })
  const [savedItems, setSavedItems] = useState<SavedItemSummary[]>([])
  const [libraryQuery, setLibraryQuery] = useState('')
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('library')
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [manualPasteOpen, setManualPasteOpen] = useState(false)
  const [manualPasteValue, setManualPasteValue] = useState('')
  const [sidebarDropActive, setSidebarDropActive] = useState(false)
  const [sidebarDropFolderId, setSidebarDropFolderId] = useState<TLPageId | null>(null)
  const [lastSavedItemId, setLastSavedItemId] = useState<TLShapeId | null>(null)
  const folderCounterRef = useRef(1)
  const createMenuRef = useRef<HTMLDivElement | null>(null)
  const sidebarDropFolderRef = useRef<TLPageId | null>(null)
  const recentPastedUrlsRef = useRef<Set<string>>(new Set())
  const recentPasteTimerRef = useRef<number | null>(null)
  const pendingPortraitFitRef = useRef<TLShapeId | null>(null)
  const [, setStatusMessage] = useState(
    'Cole qualquer imagem com Ctrl+V ou Cmd+V diretamente no quadro.'
  )

  const libraryQueryNormalized = libraryQuery.trim().toLowerCase()

  const tldrawComponents = useMemo<TLComponents>(
    () => ({
      StylePanel: null,
      PageMenu: null,
      NavigationPanel: null,
      QuickActions: null,
      MenuPanel: null,
    }),
    []
  )

  const shapeUtils = useMemo(
    () => [InstagramReelShapeUtil],
    []
  )

  const syncFolders = useCallback((instance: Editor) => {
    const pages = instance.getPages().map((page) => ({ id: page.id, name: page.name }))
    setFolders(pages)
    setActiveFolderId(instance.getCurrentPageId())
  }, [])

  const syncPortraits = useCallback((instance: Editor) => {
    const nextPortraits = getCurrentPortraits(instance)
    setPortraits(nextPortraits)
    setActivePortraitId((current) =>
      current && nextPortraits.some((portrait) => portrait.id === current) ? current : nextPortraits[0]?.id ?? null
    )
  }, [])

  const syncMeasurementOverlay = useCallback((instance: Editor) => {
    setMeasurementOverlay(getMeasurementOverlay(instance))
  }, [])

  const syncSavedItems = useCallback((instance: Editor) => {
    setSavedItems(getSavedItemSummaries(instance))
  }, [])

  useEffect(() => {
    if (!editor) return

    syncFolders(editor)
    syncPortraits(editor)
    syncMeasurementOverlay(editor)
    syncSavedItems(editor)
  }, [editor, syncFolders, syncMeasurementOverlay, syncPortraits, syncSavedItems])

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      syncFolders(editor)
      syncPortraits(editor)
      syncMeasurementOverlay(editor)
      syncSavedItems(editor)
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor, syncFolders, syncMeasurementOverlay, syncPortraits, syncSavedItems])

  useEffect(() => {
    if (!editor) return
    editor.updateInstanceState({ isGridMode: false })
  }, [editor])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!createMenuRef.current?.contains(event.target as Node)) {
        setCreateMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!editor) return

    editor.registerExternalContentHandler('url', ({ url, point }) => {
      if (recentPastedUrlsRef.current.has(url)) {
        return
      }

      const normalizedYouTube = normalizeYouTubeEmbed(url)
      if (normalizedYouTube) {
        const createdIds = createMediaItems(
          editor,
          [{ kind: 'youtube', layout: normalizedYouTube.layout, url: normalizedYouTube.url }],
          point
        )
        if (activePortraitId) {
          fitShapesToPortrait(editor, createdIds, activePortraitId)
        } else {
          organizeMovedShapesInFolder(editor, createdIds)
        }
        setLastSavedItemId(createdIds[0] ?? null)
        setMediaInteractionEnabled(true)
        setStatusMessage(
          normalizedYouTube.layout === 'short'
            ? 'Short do YouTube incorporado no quadro.'
            : 'Video do YouTube incorporado no quadro.'
        )
        return
      }

      const normalizedReel = normalizeInstagramReelUrl(url)
      if (normalizedReel) {
        const createdIds = createMediaItems(editor, [{ kind: 'instagram-reel', url: normalizedReel }], point)
        if (activePortraitId) {
          fitShapesToPortrait(editor, createdIds, activePortraitId)
        } else {
          organizeMovedShapesInFolder(editor, createdIds)
        }
        setLastSavedItemId(createdIds[0] ?? null)
        setMediaInteractionEnabled(true)
        setStatusMessage('Reel do Instagram incorporado no quadro.')
        return
      }

      createEmptyBookmarkShape(editor, url, point ?? editor.getViewportPageBounds().center)
    })

    return () => {
      editor.registerExternalContentHandler('url', null)
    }
  }, [editor])

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      if (!editor) return
      if (isEditableElement(event.target)) return

      const hasImage = Array.from(event.clipboardData?.items ?? []).some((item) =>
        item.type.startsWith('image/')
      )

      if (hasImage) {
        pendingPortraitFitRef.current = activePortraitId
        window.setTimeout(() => {
          if (!editor) return
          const selectedShapeIds = editor.getSelectedShapeIds()
          if (!selectedShapeIds.length) return

          if (pendingPortraitFitRef.current) {
            fitShapesToPortrait(editor, selectedShapeIds, pendingPortraitFitRef.current)
          } else {
            organizeMovedShapesInFolder(editor, selectedShapeIds)
          }

          setLastSavedItemId(selectedShapeIds[0] ?? null)
          pendingPortraitFitRef.current = null
        }, 120)
        setStatusMessage(
          activePortraitId
            ? 'Imagem detectada. Ela sera encaixada no retrato ativo.'
            : 'Imagem detectada. Ela sera guardada e organizada nesta pasta.'
        )
        return
      }

      const plainText = event.clipboardData?.getData('text/plain')
      if (plainText) {
        const mediaItems = extractMediaPasteItems(plainText)

        if (mediaItems.length) {
          event.preventDefault()
          event.stopPropagation()

          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation()
          }

          recentPastedUrlsRef.current = new Set(mediaItems.map((item) => item.url))
          if (recentPasteTimerRef.current) {
            window.clearTimeout(recentPasteTimerRef.current)
          }
          recentPasteTimerRef.current = window.setTimeout(() => {
            recentPastedUrlsRef.current.clear()
            recentPasteTimerRef.current = null
          }, 300)

          const createdIds = createMediaItems(editor, mediaItems, activePortraitId ? editor.getShapePageBounds(activePortraitId)?.center : undefined)
          if (activePortraitId) {
            fitShapesToPortrait(editor, createdIds, activePortraitId)
          } else {
            organizeMovedShapesInFolder(editor, createdIds)
          }
          setLastSavedItemId(createdIds[0] ?? null)
          setMediaInteractionEnabled(true)
          if (activePortraitId) {
            const bounds = editor.getShapePageBounds(activePortraitId)
            if (bounds) editor.zoomToBounds(bounds, { targetZoom: Math.min(1, editor.getZoomLevel()) })
          } else {
            editor.zoomToFit()
          }

          const videosCount = mediaItems.filter(
            (item) => item.kind === 'youtube' && item.layout === 'video'
          ).length
          const shortsCount = mediaItems.filter(
            (item) => item.kind === 'youtube' && item.layout === 'short'
          ).length
          const reelsCount = mediaItems.filter((item) => item.kind === 'instagram-reel').length
          const cardsCount = mediaItems.filter((item) => item.kind === 'bookmark').length

          setStatusMessage(
            [
              videosCount ? `${videosCount} video${videosCount > 1 ? 's' : ''}` : '',
              shortsCount ? `${shortsCount} short${shortsCount > 1 ? 's' : ''}` : '',
              reelsCount ? `${reelsCount} reel${reelsCount > 1 ? 's' : ''}` : '',
              cardsCount ? `${cardsCount} card${cardsCount > 1 ? 's' : ''}` : '',
            ]
              .filter(Boolean)
              .join(' + ') + ' adicionados ao quadro.'
          )
          return
        }

        const trimmedText = plainText.trim()
        if (trimmedText) {
          event.preventDefault()
          event.stopPropagation()

          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation()
          }

          const createdItem = createTextItemFromPaste(editor, trimmedText)
          if (createdItem) {
            setLastSavedItemId(createdItem.id)
            setStatusMessage(
              createdItem.type === 'note'
                ? 'Nota colada e guardada nesta pasta.'
                : 'Texto colado e guardado como item editavel nesta pasta.'
            )
          }
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
  }, [activePortraitId, editor])

  const saveManualPastedText = useCallback(() => {
    if (!editor) return

    const createdItem = createTextItemFromPaste(editor, manualPasteValue)
    if (!createdItem) {
      setStatusMessage('Cole algum texto antes de salvar.')
      return
    }

    setLastSavedItemId(createdItem.id)
    setManualPasteOpen(false)
    setManualPasteValue('')
    setStatusMessage(
      createdItem.type === 'note'
        ? 'Nota salva manualmente nesta pasta.'
        : 'Texto salvo manualmente nesta pasta.'
    )
  }, [editor, manualPasteValue])

  const pasteFromClipboard = useCallback(async () => {
    if (!editor) return

    try {
      const plainText = await navigator.clipboard.readText()
      const trimmedText = plainText.trim()

      if (!trimmedText) {
        setStatusMessage('Copie um texto, link, reel ou short antes de usar Colar.')
        return
      }

      const mediaItems = extractMediaPasteItems(trimmedText)
      if (mediaItems.length) {
        const createdIds = createMediaItems(
          editor,
          mediaItems,
          activePortraitId ? editor.getShapePageBounds(activePortraitId)?.center : undefined
        )

        if (activePortraitId) {
          fitShapesToPortrait(editor, createdIds, activePortraitId)
        } else {
          organizeMovedShapesInFolder(editor, createdIds)
        }

        setLastSavedItemId(createdIds[0] ?? null)
        setMediaInteractionEnabled(true)
        setStatusMessage('Conteudo do clipboard salvo nesta pasta.')
        return
      }

      const createdItem = createTextItemFromPaste(editor, trimmedText)
      if (!createdItem) {
        setStatusMessage('Nao encontrei texto valido no clipboard.')
        return
      }

      setLastSavedItemId(createdItem.id)
      setStatusMessage(
        createdItem.type === 'note'
          ? 'Nota criada a partir do clipboard.'
          : 'Texto criado a partir do clipboard.'
      )
    } catch {
      setManualPasteOpen(true)
      setStatusMessage('O navegador bloqueou o clipboard. Cole o texto manualmente na caixa que abriu.')
    }
  }, [activePortraitId, editor])

  const focusPortrait = useCallback(
    (portraitId: TLShapeId) => {
      if (!editor) return
      const bounds = editor.getShapePageBounds(portraitId)
      if (!bounds) return

      const selectedShapeIds = getSelectedShapeIdsEligibleForPortrait(editor)
      const hasImageSelection = selectedShapeIds.some((shapeId) => editor.getShape(shapeId)?.type === 'image')

      setActivePortraitId(portraitId)

      if (hasImageSelection) {
        fitShapesToPortrait(editor, selectedShapeIds, portraitId)
        editor.setSelectedShapes(selectedShapeIds)
        editor.zoomToBounds(bounds, { targetZoom: Math.min(1, editor.getZoomLevel()) })
        setStatusMessage('Print ajustado automaticamente ao retrato selecionado.')
        return
      }

      editor.setSelectedShapes([portraitId])
      editor.zoomToBounds(bounds, { targetZoom: Math.min(1, editor.getZoomLevel()) })
      setStatusMessage('Retrato selecionado para receber o proximo conteudo.')
    },
    [editor]
  )

  const openSavedItemInCanvas = useCallback(
    (shapeId: TLShapeId) => {
      if (!editor) return
      setWorkspaceView('edit')
      const bounds = editor.getShapePageBounds(shapeId)
      if (!bounds) return
      editor.setSelectedShapes([shapeId])
      editor.zoomToBounds(bounds, { targetZoom: Math.min(1, editor.getZoomLevel()) })
    },
    [editor]
  )

  const focusCanvas = useCallback(() => {
    if (!editor) return
    editor.zoomToFit()
    setStatusMessage('Canvas centralizado. Cole imagens ou comece a desenhar.')
  }, [editor])

  const createPortrait = useCallback(() => {
    if (!editor) return

    const existingPortraits = getCurrentPortraits(editor)
    const center = editor.getViewportPageBounds().center
    const lastPortraitId = existingPortraits.at(-1)?.id
    const lastBounds = lastPortraitId ? editor.getShapePageBounds(lastPortraitId) : null
    const id = createShapeId()
    const portraitNumber = existingPortraits.length + 1
    const x = lastBounds ? lastBounds.maxX + PORTRAIT_GAP : center.x - PORTRAIT_WIDTH / 2
    const y = lastBounds ? lastBounds.minY : center.y - PORTRAIT_HEIGHT / 2

    editor.createShapes([
      {
        id,
        type: 'frame',
        x,
        y,
        props: {
          w: PORTRAIT_WIDTH,
          h: PORTRAIT_HEIGHT,
          name: `${PORTRAIT_NAME_PREFIX}${portraitNumber}`,
        },
      },
    ])

    syncPortraits(editor)
    setWorkspaceView('edit')
    focusPortrait(id)
  }, [editor, focusPortrait, syncPortraits])

  const openFolder = useCallback(
    (pageId: TLPageId) => {
      if (!editor) return
      editor.setCurrentPage(pageId)
      setLastSavedItemId(null)
      setWorkspaceView('library')
      syncFolders(editor)
      syncPortraits(editor)
      setStatusMessage('Pasta aberta no quadro.')
    },
    [editor, syncFolders, syncPortraits]
  )

  const moveSelectionToFolder = useCallback(
    (pageId: TLPageId, shouldOrganize = false) => {
      if (!editor) return

      const selectedShapeIds = editor.getSelectedShapeIds()
      if (!selectedShapeIds.length) {
        setStatusMessage('Selecione algo no canvas antes de enviar para a pasta.')
        return
      }

      editor.moveShapesToPage(selectedShapeIds, pageId)
      setStatusMessage('Selecao enviada para a pasta.')
      editor.setCurrentPage(pageId)
      editor.setSelectedShapes(selectedShapeIds)
      if (shouldOrganize) {
        organizeMovedShapesInFolder(editor, selectedShapeIds)
      }
      syncFolders(editor)
      syncPortraits(editor)
      setStatusMessage(
        shouldOrganize ? 'Item guardado na pasta e organizado automaticamente.' : 'Selecao enviada para a pasta.'
      )
    },
    [editor, syncFolders, syncPortraits]
  )

  const createFolder = useCallback(() => {
    if (!editor) return

    const folderIndex = folderCounterRef.current
    const defaultName = `Pasta ${folderIndex}`
    const folderName = window.prompt('Nome da pasta', defaultName)?.trim()

    if (!folderName) {
      setStatusMessage('Criacao de pasta cancelada.')
      return
    }

    folderCounterRef.current += 1

    const pageId = PageRecordType.createId()
    editor.createPage({ id: pageId, name: folderName })
    editor.setCurrentPage(pageId)
    setLastSavedItemId(null)
    setWorkspaceView('library')
    syncFolders(editor)
    syncPortraits(editor)
    setStatusMessage(`${folderName} criada na lateral esquerda.`)
  }, [editor, syncFolders, syncPortraits])

  const renameFolder = useCallback(
    (pageId?: TLPageId) => {
      if (!editor) return

      const targetPageId = pageId ?? activeFolderId
      if (!targetPageId) return

      const folder = editor.getPage(targetPageId)
      if (!folder) return

      const nextName = window.prompt('Novo nome da pasta', folder.name)?.trim()
      if (!nextName || nextName === folder.name) return

      editor.renamePage(targetPageId, nextName)
      syncFolders(editor)
      setStatusMessage(`Pasta renomeada para "${nextName}".`)
    },
    [activeFolderId, editor, syncFolders]
  )

  const renameSavedItem = useCallback(
    (item: SavedItemSummary | null) => {
      if (!editor) return

      const targetItem = item
      if (!targetItem) {
        setStatusMessage('Selecione um item salvo antes de renomear.')
        return
      }

      const nextTitle = window.prompt('Novo nome do item', targetItem.title)?.trim()
      if (!nextTitle || nextTitle === targetItem.title) return

      if (targetItem.labelShapeId) {
        const labelShape = editor.getShape(targetItem.labelShapeId)
        if (labelShape?.type === 'text') {
          editor.updateShapes([
            {
              id: labelShape.id,
              type: 'text',
              props: {
                ...labelShape.props,
                richText: toRichText(nextTitle),
              },
            },
          ])
          setLastSavedItemId(targetItem.id)
          setStatusMessage(`Item renomeado para "${nextTitle}".`)
          return
        }
      }

      const shape = editor.getShape(targetItem.id)
      if (shape?.type === 'text' || shape?.type === 'note') {
        editor.updateShapes([
          {
            id: shape.id,
            type: shape.type,
            props: {
              ...shape.props,
              richText: toRichText(nextTitle),
            },
          },
        ])
        setLastSavedItemId(targetItem.id)
        setStatusMessage(`Item renomeado para "${nextTitle}".`)
        return
      }

      const bounds = editor.getShapePageBounds(targetItem.id)
      if (!shape || !bounds) return

      const labelId = createShapeId()
      editor.createShapes([
        {
          id: labelId,
          type: 'text',
          x: bounds.minX,
          y: bounds.maxY + 12,
          props: {
            w: bounds.width,
            size: 's',
            font: 'sans',
            richText: toRichText(nextTitle),
          },
        },
      ])
      setLastSavedItemId(targetItem.id)
      setStatusMessage(`Nome criado para "${nextTitle}".`)
    },
    [editor]
  )

  const cropSelectedImage = useCallback(() => {
    if (!editor) {
      setStatusMessage('Selecione um print antes de iniciar o recorte.')
      return
    }

    const selectedShapeId = editor.getSelectedShapeIds()[0]
    if (!selectedShapeId) {
      setStatusMessage('Selecione um print antes de iniciar o recorte.')
      return
    }

    const shape = editor.getShape(selectedShapeId)
    if (shape?.type !== 'image' || !editor.canCropShape(shape)) {
      setStatusMessage('Selecione um print antes de iniciar o recorte.')
      return
    }

    editor.setSelectedShapes([shape.id])
    editor.setCroppingShape(shape.id)
    setStatusMessage('Modo de recorte ativado. Ajuste a imagem no canvas.')
  }, [editor])

  const fitSelectedPrintToActivePortrait = useCallback(() => {
    if (!editor || !activePortraitId) {
      setStatusMessage('Selecione ou crie um retrato antes de ajustar o print.')
      return
    }

    const selectedShapeIds = getSelectedShapeIdsEligibleForPortrait(editor)
    const hasImageSelection = selectedShapeIds.some((shapeId) => editor.getShape(shapeId)?.type === 'image')

    if (!hasImageSelection) {
      setStatusMessage('Selecione um print antes de ajustar ao retrato.')
      return
    }

    fitShapesToPortrait(editor, selectedShapeIds, activePortraitId)
    editor.setSelectedShapes(selectedShapeIds)

    const bounds = editor.getShapePageBounds(activePortraitId)
    if (bounds) {
      editor.zoomToBounds(bounds, { targetZoom: Math.min(1, editor.getZoomLevel()) })
    }

    setStatusMessage('Print ajustado ao retrato ativo.')
  }, [activePortraitId, editor])

  useEffect(() => {
    if (!editor) return

    let pointerDownInsideCanvas = false
    let dragDetected = false

    const finishDropMode = () => {
      pointerDownInsideCanvas = false
      dragDetected = false
      sidebarDropFolderRef.current = null
      setSidebarDropActive(false)
      setSidebarDropFolderId(null)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) return
      pointerDownInsideCanvas =
        Boolean(event.target.closest('.canvas-stage')) && editor.getSelectedShapeIds().length > 0
      dragDetected = false

      if (!pointerDownInsideCanvas) {
        finishDropMode()
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerDownInsideCanvas || !editor.getSelectedShapeIds().length) return

      dragDetected = true
      setSidebarDropActive(true)

      const hoveredFolder = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-folder-drop-id]')
        ?.getAttribute('data-folder-drop-id') as TLPageId | null

      sidebarDropFolderRef.current = hoveredFolder
      setSidebarDropFolderId(hoveredFolder)
    }

    const handlePointerUp = () => {
      const targetFolderId = sidebarDropFolderRef.current

      if (pointerDownInsideCanvas && dragDetected && targetFolderId) {
        moveSelectionToFolder(targetFolderId, true)
      }

      finishDropMode()
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('pointermove', handlePointerMove, true)
    window.addEventListener('pointerup', handlePointerUp, true)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
    }
  }, [editor, moveSelectionToFolder])

  const createQuickNote = useCallback(() => {
    if (!editor) return

    const center = editor.getViewportPageBounds().center
    const id = createShapeId()
    editor.createShapes([
      {
        id,
        type: 'note',
        x: center.x - 120,
        y: center.y - 110,
        props: {
          richText: toRichText('Nova nota'),
          size: 'm',
          font: 'sans',
        },
      },
    ])
    organizeMovedShapesInFolder(editor, [id])
    editor.setSelectedShapes([id])
    setLastSavedItemId(id)
    setWorkspaceView('edit')
    setStatusMessage('Nova nota criada. Clique duas vezes para editar o texto.')
  }, [editor])

  const createQuickText = useCallback(
    (kind: 'title' | 'text') => {
      if (!editor) return

      const center = editor.getViewportPageBounds().center
      const id = createShapeId()
      const isTitle = kind === 'title'

      editor.createShapes([
        {
          id,
          type: 'text',
          x: center.x - 180,
          y: center.y - (isTitle ? 120 : 40),
          props: {
            w: isTitle ? 420 : 360,
            size: isTitle ? 'xl' : 'm',
            font: 'sans',
            richText: toRichText(isTitle ? 'Novo titulo' : 'Novo texto'),
          },
        },
      ])
      organizeMovedShapesInFolder(editor, [id])
      editor.setSelectedShapes([id])
      setLastSavedItemId(id)
      setWorkspaceView('edit')
      setStatusMessage(isTitle ? 'Titulo criado para voce renomear.' : 'Texto criado para editar.')
    },
    [editor]
  )

  const setHandMode = useCallback(() => {
    if (!editor) return
    editor.setCurrentTool('hand')
  }, [editor])

  const zoomIn = useCallback(() => {
    if (!editor) return
    editor.zoomIn()
  }, [editor])

  const zoomOut = useCallback(() => {
    if (!editor) return
    editor.zoomOut()
  }, [editor])

  const boardCount = editor?.getCurrentPageShapes().length ?? 0
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null
  const filteredFolders = useMemo(() => {
    if (!libraryQueryNormalized) return folders

    return folders.filter((folder) => folder.name.toLowerCase().includes(libraryQueryNormalized))
  }, [folders, libraryQueryNormalized])
  const filteredSavedItems = useMemo(() => {
    if (!libraryQueryNormalized) return savedItems

    return savedItems.filter((item) =>
      `${item.title} ${item.subtitle} ${getSavedItemTypeLabel(item)}`
        .toLowerCase()
        .includes(libraryQueryNormalized)
    )
  }, [libraryQueryNormalized, savedItems])
  const selectedSavedItem = useMemo(() => {
    if (!editor) return null

    const selectedShapeId = editor.getSelectedShapeIds()[0]
    if (!selectedShapeId) return null

    return (
      savedItems.find((item) => item.id === selectedShapeId || item.labelShapeId === selectedShapeId) ?? null
    )
  }, [editor, savedItems, measurementOverlay])
  const selectedImageShapeId = useMemo(() => {
    if (!editor) return null
    const selectedShapeId = editor.getSelectedShapeIds()[0]
    if (!selectedShapeId) return null
    const shape = editor.getShape(selectedShapeId)
    return shape?.type === 'image' && editor.canCropShape(shape) ? shape.id : null
  }, [editor, measurementOverlay])

  return (
    <div className="app-shell accent-teal">
      <aside className="left-rail">
        <div className="left-rail-top">
          <div className="brand-lockup">
            <div className="brand-mark">BV</div>
            <div>
              <strong>Biblioteca Visual</strong>
              <span>Guarde prints, links, reels, shorts e textos em pastas simples</span>
            </div>
          </div>

          <div className="library-shortcuts" aria-label="Acoes rapidas">
            <button
              type="button"
              className="library-action"
              onClick={createFolder}
              aria-label="Nova pasta"
              title="Nova pasta"
            >
              <span className="library-action__icon">
                <FolderPlus size={18} />
              </span>
              <span className="library-action__copy">
                <strong>Nova pasta</strong>
                <span>Organize prints, links e notas</span>
              </span>
            </button>
          </div>

          <section className="library-search" aria-label="Busca da biblioteca">
            <label className="library-search__field">
              <Search size={16} />
              <input
                type="text"
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Buscar pastas, prints, links e notas"
                aria-label="Buscar na biblioteca"
              />
            </label>
            {libraryQuery && (
              <button type="button" className="library-search__clear" onClick={() => setLibraryQuery('')}>
                Limpar
              </button>
            )}
          </section>

          <section className="folder-stack" aria-label="Pastas do quadro">
            <div className="folder-stack__header">
              <strong>Pastas</strong>
              <span>{filteredFolders.length}</span>
            </div>

            <div className={sidebarDropActive ? 'folder-list drag-active' : 'folder-list'}>
              {filteredFolders.map((folder) => (
                <div
                  key={folder.id}
                  data-folder-drop-id={folder.id}
                  className={
                    folder.id === sidebarDropFolderId
                      ? 'folder-item drag-target'
                      : folder.id === activeFolderId
                        ? 'folder-item active'
                        : 'folder-item'
                  }
                >
                  <button type="button" className="folder-item__open" onClick={() => openFolder(folder.id)}>
                    <span className="folder-item__dot" />
                    <span className="folder-item__content">
                      <span className="folder-item__name">{folder.name}</span>
                      <span className="folder-item__meta">
                        {folder.id === activeFolderId
                          ? 'Pasta aberta'
                          : folder.id === sidebarDropFolderId
                            ? 'Solte aqui'
                            : 'Abra ou arraste itens'}
                      </span>
                    </span>
                  </button>
                </div>
              ))}
              {!filteredFolders.length && <div className="folder-list__empty">Nenhuma pasta bate com a busca.</div>}
            </div>
          </section>

        </div>

        <div className="left-footer">
          <span>{activeFolder?.name ?? 'Biblioteca atual'}</span>
          <strong>{savedItems.length} itens salvos</strong>
        </div>
      </aside>

      <main className="workspace">
        <section
          className={`canvas-shell pattern-dots ${
            mediaInteractionEnabled ? 'media-live' : 'media-locked'
          } ${workspaceView === 'library' ? 'canvas-shell--library' : 'canvas-shell--edit'}`}
        >
          <div className="canvas-toolbar">
            <div className="canvas-toolbar__group">
              <div className="canvas-toolbar__menu-wrap" ref={createMenuRef}>
                <button type="button" onClick={() => setCreateMenuOpen((value) => !value)}>
                  <Plus size={16} />
                  <span>Novo</span>
                </button>
                {createMenuOpen && (
                  <div className="canvas-toolbar__menu" role="menu" aria-label="Criar novo item">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCreateMenuOpen(false)
                        createQuickNote()
                      }}
                    >
                      <StickyNote size={16} />
                      <span>Nova nota</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCreateMenuOpen(false)
                        createQuickText('text')
                      }}
                    >
                      <MessageSquareText size={16} />
                      <span>Novo texto</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCreateMenuOpen(false)
                        createQuickText('title')
                      }}
                    >
                      <Type size={16} />
                      <span>Novo titulo</span>
                    </button>
                    {workspaceView === 'edit' && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCreateMenuOpen(false)
                          createPortrait()
                        }}
                      >
                        <RectangleVertical size={16} />
                        <span>Novo retrato</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  void pasteFromClipboard()
                }}
                title="Use Ctrl+V ou Cmd+V para colar"
              >
                <Copy size={16} />
                <span>Colar</span>
              </button>
            </div>

            <div className="canvas-toolbar__group canvas-toolbar__group--primary">
              <button type="button" onClick={() => setWorkspaceView((view) => (view === 'library' ? 'edit' : 'library'))}>
                {workspaceView === 'library' ? <PenTool size={16} /> : <LayoutDashboard size={16} />}
                <span>{workspaceView === 'library' ? 'Editar' : 'Biblioteca'}</span>
              </button>
            </div>
          </div>

          {manualPasteOpen && (
            <div className="manual-paste-modal" role="dialog" aria-modal="true" aria-label="Colar texto manualmente">
              <div className="manual-paste-modal__card">
                <div className="manual-paste-modal__copy">
                  <span className="manual-paste-modal__eyebrow">Colar texto</span>
                  <h2>Cole sua nota ou texto aqui</h2>
                  <p>
                    Se o navegador bloquear o clipboard, voce ainda pode colar manualmente e salvar nesta pasta.
                  </p>
                </div>
                <textarea
                  value={manualPasteValue}
                  onChange={(event) => setManualPasteValue(event.target.value)}
                  placeholder="Cole aqui seu texto, anotacao ou bloco maior de conteudo"
                  autoFocus
                />
                <div className="manual-paste-modal__actions">
                  <button
                    type="button"
                    className="manual-paste-modal__secondary"
                    onClick={() => {
                      setManualPasteOpen(false)
                      setManualPasteValue('')
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="button" onClick={saveManualPastedText}>
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          )}

          {workspaceView === 'library' && (
            <div className="library-stage">
              <div className="library-stage__header">
                <div className="library-stage__copy">
                  <span className="library-stage__eyebrow">Biblioteca da pasta</span>
                  <h1>{activeFolder?.name ?? 'Biblioteca visual'}</h1>
                  <p>
                    Visualize o que foi guardado nesta pasta. Abra no canvas so quando quiser editar, recortar ou reorganizar.
                  </p>
                </div>
                <div className="library-stage__actions">
                  <button type="button" onClick={() => renameFolder()}>
                    <Pencil size={16} />
                    <span>Renomear pasta</span>
                  </button>
                  <button type="button" onClick={() => setWorkspaceView('edit')}>
                    <PenTool size={16} />
                    <span>Editar canvas</span>
                  </button>
                </div>
              </div>

              {filteredSavedItems.length ? (
                <div className="library-stage__grid">
                  {filteredSavedItems.map((item) => (
                    <article
                      key={`gallery-${item.id}`}
                      className={`gallery-card gallery-card--${item.type} ${
                        item.id === lastSavedItemId ? 'gallery-card--fresh' : ''
                      }`}
                    >
                      <div className="gallery-card__top">
                        <span className="gallery-card__badge">{getSavedItemTypeLabel(item)}</span>
                        <button
                          type="button"
                          className="gallery-card__icon"
                          onClick={() => renameSavedItem(item)}
                          aria-label={`Renomear ${item.title}`}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                      <div className="gallery-card__visual">
                        {item.type === 'image' && item.previewUrl ? (
                          <div className="gallery-card__preview">
                            <img src={item.previewUrl} alt={item.title} className="gallery-card__image" />
                          </div>
                        ) : null}
                        <div className="gallery-card__content">
                          <strong>{item.title}</strong>
                          <span>{item.subtitle}</span>
                        </div>
                      </div>
                      <div className="gallery-card__actions">
                        <button type="button" onClick={() => openSavedItemInCanvas(item.id)}>
                          <PenTool size={15} />
                          <span>Editar</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="library-stage__empty">
                  <div className="capture-empty-state capture-empty-state--library">
                    <div className="capture-empty-state__badge">Fluxo rapido</div>
                    <h2>{activeFolder?.name ?? 'Sua biblioteca esta pronta'}</h2>
                    <p>Cole um print, link, reel, short ou texto. O app organiza e voce renomeia depois.</p>
                    <div className="capture-empty-state__actions">
                      <button type="button" onClick={createQuickNote}>
                        <StickyNote size={16} />
                        <span>Nova nota</span>
                      </button>
                      <button type="button" onClick={() => createQuickText('title')}>
                        <Type size={16} />
                        <span>Novo titulo</span>
                      </button>
                      <button type="button" onClick={() => setWorkspaceView('edit')}>
                        <PenTool size={16} />
                        <span>Abrir canvas</span>
                      </button>
                    </div>
                    <ol className="capture-empty-state__steps">
                      <li>Copie algo de fora do app</li>
                      <li>Cole aqui dentro</li>
                      <li>Renomeie e mova para a pasta certa</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          )}

          {workspaceView === 'edit' && (selectedSavedItem || selectedImageShapeId || activePortraitId) && (
            <div className="selection-actions">
              {selectedSavedItem && (
                <button type="button" onClick={() => renameSavedItem(selectedSavedItem)}>
                  <Pencil size={15} />
                  <span>Renomear</span>
                </button>
              )}
              {selectedImageShapeId && activePortraitId && (
                <button type="button" onClick={fitSelectedPrintToActivePortrait}>
                  <RectangleVertical size={15} />
                  <span>Ajustar ao retrato</span>
                </button>
              )}
              {selectedImageShapeId && (
                <button type="button" onClick={cropSelectedImage}>
                  <Crop size={15} />
                  <span>Recortar</span>
                </button>
              )}
            </div>
          )}

          <div className="canvas-stage">
            {!boardCount && workspaceView === 'edit' && (
              <div className="capture-empty-state">
                <div className="capture-empty-state__badge">Fluxo rapido</div>
                <h2>{activeFolder?.name ?? 'Sua biblioteca esta pronta'}</h2>
                <p>Cole um print, link, reel, short ou texto. O app organiza e voce renomeia depois.</p>
                <div className="capture-empty-state__actions">
                  <button type="button" onClick={createQuickNote}>
                    <StickyNote size={16} />
                    <span>Nova nota</span>
                  </button>
                  <button type="button" onClick={() => createQuickText('title')}>
                    <Type size={16} />
                    <span>Novo titulo</span>
                  </button>
                  <button type="button" onClick={createPortrait}>
                    <RectangleVertical size={16} />
                    <span>Novo retrato</span>
                  </button>
                </div>
                <ol className="capture-empty-state__steps">
                  <li>Copie algo de fora do app</li>
                  <li>Cole aqui dentro</li>
                  <li>Renomeie e mova para a pasta certa</li>
                </ol>
              </div>
            )}
            <Tldraw
              components={tldrawComponents}
              persistenceKey="whiteboard-studio-autosave"
              onMount={setEditor}
              shapeUtils={shapeUtils}
              autoFocus
            />
            {measurementOverlay.guides.length > 0 && (
              <svg
                className="measurement-overlay"
                viewBox={`0 0 ${measurementOverlay.width} ${measurementOverlay.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {measurementOverlay.guides.map((guide) => {
                  const label = `${Math.round(guide.distance)} px`
                  const labelWidth = label.length * 7 + 14
                  const centerX = (guide.start.x + guide.end.x) / 2
                  const centerY = (guide.start.y + guide.end.y) / 2
                  const capSize = 7

                  return (
                    <g key={guide.id}>
                      <line
                        className="measurement-overlay__line"
                        x1={guide.start.x}
                        y1={guide.start.y}
                        x2={guide.end.x}
                        y2={guide.end.y}
                      />
                      {guide.orientation === 'horizontal' ? (
                        <>
                          <line
                            className="measurement-overlay__cap"
                            x1={guide.start.x}
                            y1={guide.start.y - capSize}
                            x2={guide.start.x}
                            y2={guide.start.y + capSize}
                          />
                          <line
                            className="measurement-overlay__cap"
                            x1={guide.end.x}
                            y1={guide.end.y - capSize}
                            x2={guide.end.x}
                            y2={guide.end.y + capSize}
                          />
                          <rect
                            className="measurement-overlay__label-box"
                            x={centerX - labelWidth / 2}
                            y={centerY - 24}
                            width={labelWidth}
                            height={18}
                            rx={9}
                            ry={9}
                          />
                          <text className="measurement-overlay__label" x={centerX} y={centerY - 11}>
                            {label}
                          </text>
                        </>
                      ) : (
                        <>
                          <line
                            className="measurement-overlay__cap"
                            x1={guide.start.x - capSize}
                            y1={guide.start.y}
                            x2={guide.start.x + capSize}
                            y2={guide.start.y}
                          />
                          <line
                            className="measurement-overlay__cap"
                            x1={guide.end.x - capSize}
                            y1={guide.end.y}
                            x2={guide.end.x + capSize}
                            y2={guide.end.y}
                          />
                          <rect
                            className="measurement-overlay__label-box"
                            x={centerX + 10}
                            y={centerY - 9}
                            width={labelWidth}
                            height={18}
                            rx={9}
                            ry={9}
                          />
                          <text className="measurement-overlay__label measurement-overlay__label--start" x={centerX + 10 + labelWidth / 2} y={centerY + 4}>
                            {label}
                          </text>
                        </>
                      )}
                    </g>
                  )
                })}
              </svg>
            )}
          </div>

          {workspaceView === 'edit' && (
            <div className="canvas-nav" aria-label="Navegacao do canvas">
              <button type="button" onClick={setHandMode} aria-label="Mover pelo canvas">
                <Move size={16} />
              </button>
              <button type="button" onClick={zoomIn} aria-label="Aproximar">
                <Plus size={16} />
              </button>
              <button type="button" onClick={zoomOut} aria-label="Afastar">
                <Minus size={16} />
              </button>
              <button type="button" onClick={focusCanvas} aria-label="Ajustar ao quadro">
                <BringToFront size={16} />
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App

