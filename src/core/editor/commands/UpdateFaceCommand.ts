import type { Command } from '../Command'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'

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

export class UpdateFaceCommand implements Command {
  constructor(
    private face: PlanarPolygon,
    private before: FaceState,
    private after: FaceState,
  ) {}

  execute() {
    this.face.name = this.after.name
    this.face.nameVisible = this.after.nameVisible
    this.face.valueVisible = this.after.valueVisible
    this.face.labelOffsetX = this.after.labelOffsetX
    this.face.labelOffsetY = this.after.labelOffsetY
    this.face.visible = this.after.visible
    this.face.userLocked = this.after.userLocked
    this.face.areaLocked = this.after.areaLocked
    this.face.lockedArea = this.after.lockedArea
    this.face.edgeLengthLocks = [...this.after.edgeLengthLocks]
  }

  undo() {
    this.face.name = this.before.name
    this.face.nameVisible = this.before.nameVisible
    this.face.valueVisible = this.before.valueVisible
    this.face.labelOffsetX = this.before.labelOffsetX
    this.face.labelOffsetY = this.before.labelOffsetY
    this.face.visible = this.before.visible
    this.face.userLocked = this.before.userLocked
    this.face.areaLocked = this.before.areaLocked
    this.face.lockedArea = this.before.lockedArea
    this.face.edgeLengthLocks = [...this.before.edgeLengthLocks]
  }
}
