import { usePreviewStore } from '../state/usePreviewStore'

export function ItemThumbnail({ previewKey, color, className }: { previewKey: string; color: string; className: string }) {
  const previewImage = usePreviewStore((s) => s.images[previewKey])

  if (previewImage) {
    return <img className={className} src={previewImage} alt="" />
  }
  return <span className={`${className}-fallback`} style={{ background: color }} />
}
