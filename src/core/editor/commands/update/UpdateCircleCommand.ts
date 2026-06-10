import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type CircleState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerVisible: boolean
  lockedRadius: number | null
}

export class UpdateCircleCommand extends ConstraintAwareCommand {
  readonly label = '更新圆属性'

  private before: CircleState
  private after: CircleState

  constructor(
    private circleId: string,
    before: CircleState,
    after: CircleState,
    scene?: Scene,
  ) {
    super(scene!)
    this.before = before
    this.after = after
    const circle = scene?.circles.get(circleId)
    if (circle) {
      this.markAffected(circle.p1.id, circle.p2.id, circle.p3.id)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: CircleState) {
    const circle = this.scene.circles.get(this.circleId)
    if (!circle) return
    circle.name = state.name
    circle.nameVisible = state.nameVisible
    circle.valueVisible = state.valueVisible
    circle.labelOffsetX = state.labelOffsetX
    circle.labelOffsetY = state.labelOffsetY
    circle.visible = state.visible
    circle.userLocked = state.userLocked
    circle.centerVisible = state.centerVisible
    circle.lockedRadius = state.lockedRadius
    if (circle.isNormalCircle() && state.lockedRadius != null && this.scene) {
      this.scene.cones.forEach((cone) => {
        if (cone.normalCircleId === circle.id) {
          cone.radiusValue = state.lockedRadius!
        }
      })
    }
  }
}
