import { DndContext } from "@dnd-kit/core"
import { DragOverlay } from "@dnd-kit/core"
import type { CollisionDetection } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import type { DragStartEvent } from "@dnd-kit/core"
import type { SensorDescriptor, SensorOptions } from "@dnd-kit/core"
import type { DragItem } from "@/features/folders/types"
import type { JSX, ReactNode } from "react"
import { DragPreview } from "./tree-drag-preview"

interface TreeDndContextProps {
  children: ReactNode
  sensors: SensorDescriptor<SensorOptions>[]
  collisionDetection: CollisionDetection
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void
  activeDrag: DragItem | null
  dragLabel: string | null
}

export function TreeDndContext(props: TreeDndContextProps): JSX.Element {
  const {
    children,
    sensors,
    collisionDetection,
    onDragStart,
    onDragEnd,
    activeDrag,
    dragLabel,
  } = props

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      collisionDetection={collisionDetection}
    >
      {children}
      <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
        <DragPreview item={activeDrag} label={dragLabel} />
      </DragOverlay>
    </DndContext>
  )
}
