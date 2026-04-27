import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  resizeBox,
} from 'tldraw'
import type { RecordProps } from '@tldraw/tlschema'
import type { TLResizeInfo, TLShape } from 'tldraw'

export const INSTAGRAM_REEL_SHAPE_TYPE = 'instagram-reel' as const
const BASE_REEL_WIDTH = 360
const BASE_REEL_HEIGHT = 640
const MIN_REEL_WIDTH = 180
const MIN_REEL_HEIGHT = 280

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    [INSTAGRAM_REEL_SHAPE_TYPE]: {
      w: number
      h: number
      url: string
    }
  }
}

export type InstagramReelShape = TLShape<typeof INSTAGRAM_REEL_SHAPE_TYPE>

function buildInstagramReelEmbedUrl(url: string) {
  const normalized = url.endsWith('/') ? url : `${url}/`
  return `${normalized}embed`
}

function InstagramReelEmbed({
  url,
  width,
  height,
}: {
  url: string
  width: number
  height: number
}) {
  const scale = Math.max(width / BASE_REEL_WIDTH, height / BASE_REEL_HEIGHT)
  const embedUrl = buildInstagramReelEmbedUrl(url)

  return (
    <div className="instagram-reel-stage">
      <div
        className="instagram-reel-crop-shell"
        style={{
          width: BASE_REEL_WIDTH,
          height: BASE_REEL_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <iframe
          className="instagram-reel-iframe"
          src={embedUrl}
          title="Instagram Reel"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  )
}

export class InstagramReelShapeUtil extends BaseBoxShapeUtil<InstagramReelShape> {
  static override type = INSTAGRAM_REEL_SHAPE_TYPE

  static override props: RecordProps<InstagramReelShape> = {
    w: T.number,
    h: T.number,
    url: T.string,
  }

  override canBind() {
    return false
  }

  override getDefaultProps(): InstagramReelShape['props'] {
    return {
      w: BASE_REEL_WIDTH,
      h: BASE_REEL_HEIGHT,
      url: '',
    }
  }

  override getGeometry(shape: InstagramReelShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override component(shape: InstagramReelShape) {
    return (
      <HTMLContainer
        className="instagram-reel-shape"
        style={{
          width: shape.props.w,
          height: shape.props.h,
          pointerEvents: 'all',
        }}
      >
        <div className="instagram-reel-frame">
          <InstagramReelEmbed
            url={shape.props.url}
            width={shape.props.w}
            height={shape.props.h}
          />
        </div>
      </HTMLContainer>
    )
  }

  override indicator(shape: InstagramReelShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={20} ry={20} />
  }

  override onResize(shape: InstagramReelShape, info: TLResizeInfo<InstagramReelShape>) {
    const resized = resizeBox(shape, info)

    return {
      ...resized,
      props: {
        ...resized.props,
        w: Math.max(MIN_REEL_WIDTH, resized.props.w),
        h: Math.max(MIN_REEL_HEIGHT, resized.props.h),
      },
    }
  }
}
