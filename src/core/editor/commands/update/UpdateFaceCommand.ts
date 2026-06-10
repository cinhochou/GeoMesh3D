import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type FaceState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  areaLocked: boolean
  lockedArea: number
  edgeLengthLocks: Array<number | null>
}

export class UpdateFaceCommand extends ConstraintAwareCommand {
  readonly label = '更新面属性'

  private before: FaceState
  private after: FaceState

  constructor(
    private faceId: string,
    before: FaceState,
    after: FaceState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const face = scene.faces.get(faceId)
    if (face) {
      this.markAffectedPoints(face.boundaryPointIds)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: FaceState) {
    const face = this.scene.faces.get(this.faceId)
    if (!face) return
    face.name = state.name
    face.nameVisible = state.nameVisible
    face.valueVisible = state.valueVisible
    face.labelOffsetX = state.labelOffsetX
    face.labelOffsetY = state.labelOffsetY
    face.visible = state.visible
    face.userLocked = state.userLocked
    face.areaLocked = state.areaLocked
    face.lockedArea = state.lockedArea
    face.edgeLengthLocks = [...state.edgeLengthLocks]
  }
}
