import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Ray3 } from '../../../geometry/Ray3'

type RayState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdateRayCommand extends AbstractUpdateCommand<RayState> {
  constructor(
    private ray: Ray3,
    before: RayState,
    after: RayState,
  ) {
    super(before, after)
  }

  protected apply(state: RayState) {
    this.ray.name = state.name
    this.ray.nameVisible = state.nameVisible
    this.ray.valueVisible = state.valueVisible
    this.ray.labelOffsetX = state.labelOffsetX
    this.ray.labelOffsetY = state.labelOffsetY
    this.ray.visible = state.visible
    this.ray.displayLength = Ray3.normalizeDisplayLength(state.displayLength)
    this.ray.userLocked = state.userLocked
  }
}
