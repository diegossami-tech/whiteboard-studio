import type { SVGProps } from 'react'

export type GeometricIconName =
  | 'menu'
  | 'project'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'undo'
  | 'redo'
  | 'cloud'
  | 'share'
  | 'profile'
  | 'close'
  | 'files'
  | 'recent'
  | 'favorites'
  | 'shared'
  | 'library'
  | 'templates'
  | 'examples'
  | 'trash'
  | 'plus'
  | 'folder'
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'draw'
  | 'eraser'
  | 'note'
  | 'image'
  | 'geometry'
  | 'copy'
  | 'duplicate'
  | 'front'
  | 'layers'
  | 'layout'
  | 'distribute'
  | 'link'
  | 'minus'
  | 'fullscreen'
  | 'settings'
  | 'lock'
  | 'group'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'stroke-solid'
  | 'stroke-dashed'
  | 'stroke-dotted'

type GeometricIconProps = {
  name: GeometricIconName
  size?: number
  framed?: boolean
} & Omit<SVGProps<SVGSVGElement>, 'name'>

function framePath() {
  return 'M9 2.9h6l4.1 4.1v10L15 21.1H9L4.9 17V7z'
}

function renderGlyph(name: GeometricIconName) {
  switch (name) {
    case 'menu':
      return (
        <>
          <path d="M6 8h12" />
          <path d="M6 12h9.5" />
          <path d="M6 16h12" />
        </>
      )
    case 'project':
      return (
        <>
          <circle cx="8" cy="12" r="2.2" />
          <circle cx="16.3" cy="8.4" r="1.9" />
          <circle cx="16.3" cy="15.6" r="1.9" />
          <path d="M10 11l4.2-1.8" />
          <path d="M10 13l4.2 1.8" />
        </>
      )
    case 'chevron-down':
      return <path d="m8 10 4 4 4-4" />
    case 'chevron-left':
      return <path d="m14 7-5 5 5 5" />
    case 'chevron-right':
      return <path d="m10 7 5 5-5 5" />
    case 'undo':
      return (
        <>
          <path d="m9 8-4 4 4 4" />
          <path d="M7 12h6.5a4 4 0 1 1 0 8" />
        </>
      )
    case 'redo':
      return (
        <>
          <path d="m15 8 4 4-4 4" />
          <path d="M17 12h-6.5a4 4 0 1 0 0 8" />
        </>
      )
    case 'cloud':
      return (
        <>
          <path d="M8.3 17.5h8.3a3.2 3.2 0 0 0 .5-6.3 4.7 4.7 0 0 0-8.8-1.4 3.5 3.5 0 0 0 0 7.7Z" />
        </>
      )
    case 'share':
      return (
        <>
          <circle cx="7" cy="12" r="1.8" />
          <circle cx="17" cy="7" r="1.8" />
          <circle cx="17" cy="17" r="1.8" />
          <path d="M8.7 11.1 15.3 7.9" />
          <path d="m8.7 12.9 6.6 3.2" />
        </>
      )
    case 'profile':
      return (
        <>
          <circle cx="12" cy="8.4" r="3.1" />
          <path d="M6.3 18.7a7.1 7.1 0 0 1 11.4 0" />
        </>
      )
    case 'close':
      return (
        <>
          <path d="m8 8 8 8" />
          <path d="m16 8-8 8" />
        </>
      )
    case 'files':
      return (
        <>
          <path d="M5.5 8.5h6.1l1.6 1.6h5.3v7.4H5.5z" />
          <path d="M7.3 7h4.2l1 1.1" />
        </>
      )
    case 'recent':
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8.4v4.2l2.8 1.8" />
        </>
      )
    case 'favorites':
      return (
        <>
          <path d="M12 4.4 13.9 8l4 .6-2.9 2.8.7 4-3.7-1.9-3.7 1.9.7-4L6.1 8.6l4-.6Z" />
        </>
      )
    case 'shared':
      return (
        <>
          <circle cx="9" cy="9.2" r="2.3" />
          <circle cx="15.8" cy="10.6" r="2" />
          <path d="M5.8 17.9a4.6 4.6 0 0 1 6.5-3.4" />
          <path d="M13.3 17.9a3.7 3.7 0 0 1 5-2.7" />
        </>
      )
    case 'library':
      return (
        <>
          <path d="M6.3 6.4h4.9c1.2 0 2 .3 2.8 1v10.2c-.8-.7-1.6-1-2.8-1H6.3z" />
          <path d="M17.7 6.4h-4.9c-1.2 0-2 .3-2.8 1v10.2c.8-.7 1.6-1 2.8-1h4.9z" />
        </>
      )
    case 'templates':
      return (
        <>
          <rect x="5.8" y="5.8" width="4.8" height="4.8" rx="1.1" />
          <rect x="13.4" y="5.8" width="4.8" height="4.8" rx="1.1" />
          <rect x="5.8" y="13.4" width="4.8" height="4.8" rx="1.1" />
          <rect x="13.4" y="13.4" width="4.8" height="4.8" rx="1.1" />
        </>
      )
    case 'examples':
      return (
        <>
          <circle cx="12" cy="12" r="6.2" />
          <path d="m12 8.5 2.5 3.5L12 15.5 9.5 12Z" />
        </>
      )
    case 'trash':
      return (
        <>
          <path d="M8 7.4h8" />
          <path d="M9.2 7.4V6a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v1.4" />
          <path d="M7.4 7.4 8 18.2a1.4 1.4 0 0 0 1.4 1.3h5.2a1.4 1.4 0 0 0 1.4-1.3l.6-10.8" />
          <path d="M10 10.2v6.1" />
          <path d="M14 10.2v6.1" />
        </>
      )
    case 'plus':
      return (
        <>
          <path d="M12 6v12" />
          <path d="M6 12h12" />
        </>
      )
    case 'folder':
      return (
        <>
          <path d="M5 8.4h5.4l1.8 1.8H19v7.1H5z" />
          <path d="M6.8 7h3.1l1 1" />
        </>
      )
    case 'select':
      return (
        <>
          <path d="m7 5 9 7-4.1 1.1 1.7 4.9-1.8.6-1.7-4.9-3.8 2Z" />
        </>
      )
    case 'hand':
      return (
        <>
          <path d="M9 11V6.7a1 1 0 1 1 2 0V11" />
          <path d="M11 10V5.8a1 1 0 1 1 2 0V10" />
          <path d="M13 10.6V7a1 1 0 1 1 2 0v4.2" />
          <path d="M15 11.8V8.8a1 1 0 1 1 2 0v4.4c0 3-2.2 5.3-5.1 5.3-2.4 0-4-1.3-5.1-4l-1.1-2.7a1 1 0 0 1 1.8-.8l1.5 2.4Z" />
        </>
      )
    case 'rectangle':
      return <rect x="6" y="7" width="12" height="10" rx="1.6" />
    case 'circle':
      return <circle cx="12" cy="12" r="5.8" />
    case 'line':
      return <path d="M6 17 18 7" />
    case 'arrow':
      return (
        <>
          <path d="M6 17 16.2 8.1" />
          <path d="M12.8 8.1h3.4v3.4" />
        </>
      )
    case 'text':
      return (
        <>
          <path d="M7 7h10" />
          <path d="M12 7v10" />
          <path d="M9 17h6" />
        </>
      )
    case 'draw':
      return (
        <>
          <path d="M6.4 16.8c2.2-4.8 5-7.5 10.2-9.6" />
          <path d="m14.8 6.2 2.8.6-.8 2.8" />
        </>
      )
    case 'eraser':
      return (
        <>
          <path d="m9.1 7.4 5.5 5.5" />
          <path d="m7.8 13.6 4.8-4.8a1.4 1.4 0 0 1 2 0l2.7 2.7a1.4 1.4 0 0 1 0 2l-3.5 3.5a1.4 1.4 0 0 1-2 0l-4-4a1 1 0 0 1 0-1.4Z" />
          <path d="M6.4 18.2h7.2" />
        </>
      )
    case 'note':
      return (
        <>
          <path d="M7 5.8h10v12.4H9.4L7 15.8Z" />
          <path d="M9.4 18.2v-2.4H7" />
          <path d="M9.5 10h5" />
          <path d="M9.5 13h4" />
        </>
      )
    case 'image':
      return (
        <>
          <rect x="5.8" y="6.2" width="12.4" height="11.6" rx="1.6" />
          <circle cx="10" cy="10" r="1.5" />
          <path d="m7.6 16 3.2-3.4 2.2 2.2 2.7-2.9 1.6 4.1" />
        </>
      )
    case 'geometry':
      return (
        <>
          <path d="M12 3.3 14 6.8l4-.2-1.7 3.7 3.1 2.2-3.1 2.2 1.7 3.7-4-.2-2 3.5-2-3.5-4 .2 1.7-3.7-3.1-2.2 3.1-2.2-1.7-3.7 4 .2Z" />
          <circle cx="12" cy="12" r="1.9" />
        </>
      )
    case 'copy':
      return (
        <>
          <rect x="9" y="8" width="8.2" height="9.2" rx="1.4" />
          <path d="M7 15.7H6a1.3 1.3 0 0 1-1.3-1.3V7a1.3 1.3 0 0 1 1.3-1.3h7.5A1.3 1.3 0 0 1 14.8 7v1" />
        </>
      )
    case 'duplicate':
      return (
        <>
          <rect x="10" y="9" width="7.2" height="7.8" rx="1.2" />
          <rect x="6.8" y="6" width="7.2" height="7.8" rx="1.2" />
        </>
      )
    case 'front':
      return (
        <>
          <rect x="7" y="8" width="8.5" height="8.5" rx="1.2" />
          <path d="M11 5.6h6v6" />
          <path d="m17 5.8-4.2 4.2" />
        </>
      )
    case 'layers':
      return (
        <>
          <path d="m12 6 6 3.1-6 3.1-6-3.1Z" />
          <path d="m6 12 6 3.1 6-3.1" />
          <path d="m6 15.2 6 2.8 6-2.8" />
        </>
      )
    case 'layout':
      return (
        <>
          <rect x="6" y="6.3" width="5.2" height="4.4" rx="1" />
          <rect x="12.8" y="6.3" width="5.2" height="4.4" rx="1" />
          <rect x="6" y="13.3" width="12" height="4.4" rx="1" />
        </>
      )
    case 'distribute':
      return (
        <>
          <path d="M6 7.2v9.6" />
          <path d="M18 7.2v9.6" />
          <rect x="8.8" y="8.5" width="2.8" height="7" rx="0.8" />
          <rect x="13.4" y="6.8" width="1.8" height="10.4" rx="0.8" />
        </>
      )
    case 'link':
      return (
        <>
          <path d="M10 14.6 8.3 16.3a2.6 2.6 0 0 1-3.7-3.7l2.5-2.5a2.6 2.6 0 0 1 3.7 0" />
          <path d="m14 9.4 1.7-1.7a2.6 2.6 0 1 1 3.7 3.7l-2.5 2.5a2.6 2.6 0 0 1-3.7 0" />
          <path d="m9.2 14.8 5.6-5.6" />
        </>
      )
    case 'minus':
      return <path d="M6 12h12" />
    case 'fullscreen':
      return (
        <>
          <path d="M8 10V7.8H10.2" />
          <path d="M16 10V7.8H13.8" />
          <path d="M8 14v2.2h2.2" />
          <path d="M16 14v2.2h-2.2" />
        </>
      )
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="2.4" />
          <path d="M12 4.8v1.8" />
          <path d="M12 17.4v1.8" />
          <path d="m6.9 6.9 1.3 1.3" />
          <path d="m15.8 15.8 1.3 1.3" />
          <path d="M4.8 12h1.8" />
          <path d="M17.4 12h1.8" />
          <path d="m6.9 17.1 1.3-1.3" />
          <path d="m15.8 8.2 1.3-1.3" />
        </>
      )
    case 'lock':
      return (
        <>
          <rect x="6.8" y="10.2" width="10.4" height="8.2" rx="1.6" />
          <path d="M8.8 10.2V8.8a3.2 3.2 0 0 1 6.4 0v1.4" />
        </>
      )
    case 'group':
      return (
        <>
          <rect x="5.8" y="8.2" width="6.4" height="6.4" rx="1.2" />
          <rect x="11.8" y="9.8" width="6.4" height="6.4" rx="1.2" />
        </>
      )
    case 'align-left':
      return (
        <>
          <path d="M6.5 6.2v11.6" />
          <rect x="8.8" y="7.4" width="6.4" height="2.4" rx="0.8" />
          <rect x="8.8" y="14.2" width="8.2" height="2.4" rx="0.8" />
        </>
      )
    case 'align-center':
      return (
        <>
          <path d="M12 6.2v11.6" />
          <rect x="8.3" y="7.4" width="7.4" height="2.4" rx="0.8" />
          <rect x="6.9" y="14.2" width="10.2" height="2.4" rx="0.8" />
        </>
      )
    case 'align-right':
      return (
        <>
          <path d="M17.5 6.2v11.6" />
          <rect x="8.8" y="7.4" width="6.4" height="2.4" rx="0.8" />
          <rect x="7" y="14.2" width="8.2" height="2.4" rx="0.8" />
        </>
      )
    case 'stroke-solid':
      return <path d="M6 12h12" />
    case 'stroke-dashed':
      return <path d="M6 12h3m2 0h2m2 0h3" />
    case 'stroke-dotted':
      return (
        <>
          <circle cx="7" cy="12" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="11" cy="12" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="0.8" fill="currentColor" stroke="none" />
        </>
      )
    default:
      return null
  }
}

export function GeometricIcon({ name, size = 18, framed = false, className, ...props }: GeometricIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.48"
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      className={['geometric-icon', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      {...props}
    >
      {framed ? <path d={framePath()} opacity="0.22" /> : null}
      {renderGlyph(name)}
    </svg>
  )
}
