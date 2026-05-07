import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { GeoVector3 } from '../../geometry/GeoVector3'

export type VectorPatch = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateVectorCommand implements Command {
  constructor(
    private scene: Scene,
    private vector: GeoVector3,
    private before: VectorPatch,
    private after: VectorPatch,
  ) {}

  execute() {
    this.applyPatch(this.after)
    this.scene.markAllRenderDirty()
  }

  undo() {
    this.applyPatch(this.before)
    this.scene.markAllRenderDirty()
  }

  private applyPatch(patch: VectorPatch) {
    this.vector.name = patch.name
    this.vector.nameVisible = patch.nameVisible
    this.vector.valueVisible = patch.valueVisible
    this.vector.labelOffsetX = patch.labelOffsetX
    this.vector.labelOffsetY = patch.labelOffsetY
    this.vector.visible = patch.visible
    this.vector.userLocked = patch.userLocked
  }
}
