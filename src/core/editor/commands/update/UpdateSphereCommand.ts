import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Sphere3 } from '../../../geometry/Sphere3'

type SphereState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateSphereCommand extends AbstractUpdateCommand<SphereState> {
  constructor(
    private sphere: Sphere3,
    before: SphereState,
    after: SphereState,
  ) {
    super(before, after)
  }

  protected apply(state: SphereState) {
    this.sphere.name = state.name
    this.sphere.nameVisible = state.nameVisible
    this.sphere.valueVisible = state.valueVisible
    this.sphere.labelOffsetX = state.labelOffsetX
    this.sphere.labelOffsetY = state.labelOffsetY
    this.sphere.visible = state.visible
    this.sphere.userLocked = state.userLocked
  }
}
