import type { Command } from './Command'
import { Scene } from '../scene/Scene'
import { Ray3 } from '../geometry/Ray3'

export class DeleteRayCommand implements Command {
  constructor(
    private scene: Scene,
    private ray: Ray3,
  ) {}

  execute() {
    this.scene.rays.delete(this.ray.id)
    this.scene.selection.rays.delete(this.ray.id)
  }

  undo() {
    this.scene.addRay(this.ray)
  }
}
