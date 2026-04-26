import type { Command } from '../Command'
import { Ray3 } from '../../geometry/Ray3'

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

export class UpdateRayCommand implements Command {
  constructor(
    private ray: Ray3,
    private before: RayState,
    private after: RayState,
  ) {}

  execute() {
    this.ray.name = this.after.name
    this.ray.nameVisible = this.after.nameVisible
    this.ray.valueVisible = this.after.valueVisible
    this.ray.labelOffsetX = this.after.labelOffsetX
    this.ray.labelOffsetY = this.after.labelOffsetY
    this.ray.visible = this.after.visible
    this.ray.displayLength = Ray3.normalizeDisplayLength(this.after.displayLength)
    this.ray.userLocked = this.after.userLocked
  }

  undo() {
    this.ray.name = this.before.name
    this.ray.nameVisible = this.before.nameVisible
    this.ray.valueVisible = this.before.valueVisible
    this.ray.labelOffsetX = this.before.labelOffsetX
    this.ray.labelOffsetY = this.before.labelOffsetY
    this.ray.visible = this.before.visible
    this.ray.displayLength = Ray3.normalizeDisplayLength(this.before.displayLength)
    this.ray.userLocked = this.before.userLocked
  }
}
