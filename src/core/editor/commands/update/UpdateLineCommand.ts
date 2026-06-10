import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { Line3 } from '../../../geometry/Line3'
import { Vec3 } from '../../../geometry/Vec3'

type LineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  lengthLocked: boolean
  lockedLength: number
  p1Position?: Vec3
  p2Position?: Vec3
}

export class UpdateLineCommand extends ConstraintAwareCommand {
  readonly label = '更新线段属性'

  private before: LineState
  private after: LineState

  constructor(
    private lineId: string,
    before: LineState,
    after: LineState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const line = scene.lines.get(lineId)
    if (line) {
      this.markAffected(line.p1.id, line.p2.id)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: LineState) {
    const line = this.scene.lines.get(this.lineId)
    if (!line) return
    line.name = state.name
    line.nameVisible = state.nameVisible
    line.valueVisible = state.valueVisible
    line.labelOffsetX = state.labelOffsetX
    line.labelOffsetY = state.labelOffsetY
    line.visible = state.visible
    line.userLocked = state.userLocked
    line.lengthLocked = state.lengthLocked
    line.lockedLength = Line3.normalizeLockedLength(state.lockedLength)
    if (state.p1Position) line.p1.setPosition(state.p1Position.clone())
    if (state.p2Position) line.p2.setPosition(state.p2Position.clone())
  }
}
