import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'

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

export class UpdateFaceCommand extends AbstractUpdateCommand<FaceState> {
  constructor(
    private face: PlanarPolygon,
    before: FaceState,
    after: FaceState,
  ) {
    super(before, after)
  }

  protected apply(state: FaceState) {
    this.face.name = state.name
    this.face.nameVisible = state.nameVisible
    this.face.valueVisible = state.valueVisible
    this.face.labelOffsetX = state.labelOffsetX
    this.face.labelOffsetY = state.labelOffsetY
    this.face.visible = state.visible
    this.face.userLocked = state.userLocked
    this.face.areaLocked = state.areaLocked
    this.face.lockedArea = state.lockedArea
    this.face.edgeLengthLocks = [...state.edgeLengthLocks]
  }
}
