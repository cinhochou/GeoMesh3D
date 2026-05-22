import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { GeoVector3 } from '../../../geometry/GeoVector3'

export type VectorPatch = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateVectorCommand extends AbstractUpdateCommand<VectorPatch> {
  constructor(
    private scene: Scene,
    private vector: GeoVector3,
    before: VectorPatch,
    after: VectorPatch,
  ) {
    super(before, after)
  }

  protected apply(patch: VectorPatch) {
    this.vector.name = patch.name
    this.vector.nameVisible = patch.nameVisible
    this.vector.valueVisible = patch.valueVisible
    this.vector.labelOffsetX = patch.labelOffsetX
    this.vector.labelOffsetY = patch.labelOffsetY
    this.vector.visible = patch.visible
    this.vector.userLocked = patch.userLocked
    this.scene.markAllRenderDirty()
  }
}
