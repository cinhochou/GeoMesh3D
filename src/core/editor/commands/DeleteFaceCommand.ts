import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { PlanarFace } from '../../geometry/Plane'

export class DeleteFaceCommand implements Command {
  constructor(
    private scene: Scene,
    private face: PlanarFace,
  ) {}

  execute() {
    this.scene.removeFace(this.face.id)
  }

  undo() {
    this.scene.addFace(this.face)
  }
}
