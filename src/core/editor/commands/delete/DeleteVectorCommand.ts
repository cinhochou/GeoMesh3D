import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { GeoVector3 } from '../../../geometry/GeoVector3'

export class DeleteVectorCommand implements Command {
  constructor(
    private scene: Scene,
    private vector: GeoVector3,
  ) {}

  execute() {
    this.scene.vectors.delete(this.vector.id)
    this.scene.selection.vectors.delete(this.vector.id)
    this.scene.markAllRenderDirty()
  }

  undo() {
    this.scene.addVector(this.vector)
    this.scene.markAllRenderDirty()
  }
}
