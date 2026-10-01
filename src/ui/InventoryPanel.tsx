import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { DECORATION_CATALOG, getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { Button } from './components/Button'
import { ItemThumbnail } from './ItemThumbnail'
import { useState } from 'react'

export function InventoryPanel() {
  const unlockedDecorationDefIds = useGameStore((s) => s.unlockedDecorationDefIds)
  const placedDecorations = useGameStore((s) => s.placedDecorations)
  const addDecorationInstance = useGameStore((s) => s.addDecorationInstance)
  const rotateDecoration = useGameStore((s) => s.rotateDecoration)
  const removeDecoration = useGameStore((s) => s.removeDecoration)

  const selectedDecorationId = useUIStore((s) => s.selectedDecorationId)
  const draggingId = useUIStore((s) => s.draggingId)
  const setSelectedDecorationId = useUIStore((s) => s.setSelectedDecorationId)
  const openModal = useUIStore((s) => s.openModal)
  const [expandedForSelection, setExpandedForSelection] = useState(false)
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false)

  const unlocked = DECORATION_CATALOG.filter((d) => unlockedDecorationDefIds.includes(d.id))
  const selectedInstance = placedDecorations.find((p) => p.id === selectedDecorationId)
  const selectedDef = selectedInstance ? getDecorationDef(selectedInstance.defId) : undefined
  const collapsed = Boolean(draggingId || (selectedDecorationId ? !expandedForSelection : manuallyCollapsed))

  return (
    <div className={`inventory-panel ${collapsed ? 'inventory-collapsed' : ''}`}>
      <div className="inventory-palette-heading">
        <strong>{selectedDecorationId ? `${selectedDef?.name ?? 'Decoration'} selected` : 'Decorate your tank'}</strong>
        <button className="inventory-collapse" aria-expanded={!collapsed} onClick={() => selectedDecorationId ? setExpandedForSelection(!expandedForSelection) : setManuallyCollapsed(!manuallyCollapsed)}>
          {collapsed ? 'Choose another' : 'Hide palette'}
        </button>
      </div>
      {!collapsed && <div className="inventory-palette">
        {unlocked.map((def) => {
          const active = def.bonus && placedDecorations.some((p) => p.defId === def.id)
          return (
            <button
              key={def.id}
              className={`inventory-item ${def.bonus ? 'inventory-gadget' : ''}`}
              title={def.bonus ? `Place ${def.name} · ${def.bonus.label}${active ? ' (active)' : ''}` : `Place ${def.name}`}
              onClick={() => { setExpandedForSelection(false); setManuallyCollapsed(false); addDecorationInstance(def.id) }}
            >
              <ItemThumbnail previewKey={def.id} color={def.color} className="inventory-item-thumb" />
              {def.name}
              {def.bonus && <small className={`inventory-bonus ${active ? 'on' : ''}`}>{active ? '✓ ' : '✨ '}{def.bonus.label}</small>}
            </button>
          )
        })}
        <button className="inventory-item inventory-item-shop" onClick={() => openModal('shop')}>
          + More in Shop
        </button>
      </div>}

      {selectedDecorationId && (
        <div className="selection-toolbar">
          <span>{selectedDef?.name ?? 'Item'} selected</span>
          <Button onClick={() => rotateDecoration(selectedDecorationId)}>⟳ Rotate</Button>
          <Button
            variant="danger"
            onClick={() => {
              removeDecoration(selectedDecorationId)
              setSelectedDecorationId(null)
            }}
          >
            Remove
          </Button>
          <Button onClick={() => setSelectedDecorationId(null)}>Done</Button>
        </div>
      )}
    </div>
  )
}
