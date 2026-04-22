import type { Command } from '../Command'
import { MergePointsCommand } from './MergePointsCommand'
import { TransformPointsCommand } from './TransformPointsCommand'
import { Point3 } from '../../geometry/Point3'
import { Vec3 } from '../../geometry/Vec3'
import { Scene } from '../../scene/Scene'

type PointTransform = {
  point: Point3
  before: Vec3
  after: Vec3
}

export class MergeCubePointsCommand implements Command {
  private readonly transformCommand: TransformPointsCommand
  private readonly mergeCommand: MergePointsCommand

  constructor(
    scene: Scene,
    keepPoint: Point3,
    removePoint: Point3,
    transforms: PointTransform[],
  ) {
    this.transformCommand = new TransformPointsCommand(transforms)
    this.mergeCommand = new MergePointsCommand(scene, keepPoint, removePoint)
  }

  execute() {
    this.transformCommand.execute()
    this.mergeCommand.execute()
  }

  undo() {
    this.mergeCommand.undo()
    this.transformCommand.undo()
  }
}
