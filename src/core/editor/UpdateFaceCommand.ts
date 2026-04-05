import type { Command } from './Command'
import { PlanarFace } from '../geometry/Plane'

type FaceState = {
  name: string
  nameVisible: boolean
  visible: boolean
  userLocked: boolean
}

export class UpdateFaceCommand implements Command {
  constructor(
    private face: PlanarFace,
    private before: FaceState,
    private after: FaceState,
  ) {}

  execute() {
    this.face.name = this.after.name
    this.face.nameVisible = this.after.nameVisible
    this.face.visible = this.after.visible
    this.face.userLocked = this.after.userLocked
  }

  undo() {
    this.face.name = this.before.name
    this.face.nameVisible = this.before.nameVisible
    this.face.visible = this.before.visible
    this.face.userLocked = this.before.userLocked
  }
}
