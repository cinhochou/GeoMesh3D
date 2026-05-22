import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Circle3 } from '../../../geometry/Circle3'
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

export class UpdateCircleCommand extends AbstractUpdateCommand<CircleState> {
  constructor(
    private circle: Circle3,
    before: CircleState,
    after: CircleState,
    private scene?: Scene,
  ) {
    super(before, after)
  }

  protected apply(state: CircleState) {
    this.circle.name = state.name
    this.circle.nameVisible = state.nameVisible
    this.circle.valueVisible = state.valueVisible
    this.circle.labelOffsetX = state.labelOffsetX
    this.circle.labelOffsetY = state.labelOffsetY
    this.circle.visible = state.visible
    this.circle.userLocked = state.userLocked
    this.circle.centerVisible = state.centerVisible
    this.circle.lockedRadius = state.lockedRadius
    if (this.circle.isNormalCircle() && state.lockedRadius != null && this.scene) {
      this.scene.cones.forEach((cone) => {
        if (cone.normalCircleId === this.circle.id) {
          cone.radiusValue = state.lockedRadius!
        }
      })
      this.scene.markAllRenderDirty()
    }
  }
}
