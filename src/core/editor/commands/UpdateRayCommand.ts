import type { Command } from '../Command'
import { Ray3 } from '../../geometry/Ray3'

type RayState = {
  name: string
  nameVisible: boolean
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdateRayCommand implements Command {
  constructor(
    private ray: Ray3,
    private before: RayState,
    private after: RayState,
  ) {}

  execute() {
    this.ray.name = this.after.name
    this.ray.nameVisible = this.after.nameVisible
    this.ray.visible = this.after.visible
    this.ray.displayLength = Ray3.normalizeDisplayLength(this.after.displayLength)
    this.ray.userLocked = this.after.userLocked
  }

  undo() {
    this.ray.name = this.before.name
    this.ray.nameVisible = this.before.nameVisible
    this.ray.visible = this.before.visible
    this.ray.displayLength = Ray3.normalizeDisplayLength(this.before.displayLength)
    this.ray.userLocked = this.before.userLocked
  }
}
