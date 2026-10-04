import type { PropsWithChildren } from 'react'
import { ESCAPE_LAYER, useEscape } from '../escape'

export function Modal({
  title,
  onClose,
  className,
  children,
}: PropsWithChildren<{ title: string; onClose: () => void; className?: string }>) {
  useEscape(onClose, ESCAPE_LAYER.modal)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={className ? `modal ${className}` : 'modal'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
