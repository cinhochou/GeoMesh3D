import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

export type VectorPatch = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateVectorCommand extends ConstraintAwareCommand {
  readonly label = '更新向量属性'

  private before: VectorPatch
  private after: VectorPatch

  constructor(
    scene: Scene,
    private vectorId: string,
    before: VectorPatch,
    after: VectorPatch,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const vector = scene.vectors.get(vectorId)
    if (vector) {
      this.markAffected(vector.p1.id, vector.p2.id)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(patch: VectorPatch) {
    const vector = this.scene.vectors.get(this.vectorId)
    if (!vector) return
    vector.name = patch.name
    vector.nameVisible = patch.nameVisible
    vector.valueVisible = patch.valueVisible
    vector.labelOffsetX = patch.labelOffsetX
    vector.labelOffsetY = patch.labelOffsetY
    vector.visible = patch.visible
    vector.userLocked = patch.userLocked
  }
}
