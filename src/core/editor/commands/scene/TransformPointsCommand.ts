import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Vec3 } from '../../../geometry/Vec3'
import type { ParametricData } from '../../../constraints/ObjectConstrainedPointConstraint'
import type { Scene } from '../../../scene/Scene'

type PointTransform = {
  pointId: string
  before: Vec3
  after: Vec3
}

type AxisHintChange = {
  constraintType: 'cube' | 'regularPolygon'
  constraintId: string
  before: Vec3
  after: Vec3
}

type ParametricSnapshot = {
  pointId: string
  before: ParametricData | null
  after: ParametricData | null
}

/**
 * 移动多个点的命令。
 * 使用 pointId 而非直接 Point3 引用，确保在 SnapshotCommand 重建对象后仍能正确操作。
 */
export class TransformPointsCommand extends ConstraintAwareCommand {
  readonly label = 'TransformPointsCommand'
  private parametricSnapshots: ParametricSnapshot[]

  constructor(
    private transforms: PointTransform[],
    private axisHintChanges: AxisHintChange[] = [],
    scene: Scene,
  ) {
    super(scene)
    this.parametricSnapshots = transforms.map(({ pointId, before, after }) => {
      const constraint = scene.getObjectConstrainedPointConstraint(pointId)
      if (constraint) {
        const saved = constraint.parametricData
        constraint.computeParametricDataFromPosition(before)
        const beforeData = constraint.parametricData
          ? JSON.parse(JSON.stringify(constraint.parametricData))
          : null
        constraint.computeParametricDataFromPosition(after)
        const afterData = constraint.parametricData
          ? JSON.parse(JSON.stringify(constraint.parametricData))
          : null
        constraint.parametricData = saved
        return { pointId, before: beforeData, after: afterData }
      }
      return { pointId, before: null, after: null }
    })
    this.markAffectedPoints(transforms.map((t) => t.pointId))
  }

  protected doExecute(): void {
    this.applyAxisHints('after')
    this.transforms.forEach(({ pointId, after }) => {
      const point = this.scene.points.get(pointId)
      if (point) point.setPosition(after)
    })
    this.parametricSnapshots.forEach((snapshot) => {
      const constraint = this.scene.getObjectConstrainedPointConstraint(snapshot.pointId)
      if (constraint && snapshot.after) {
        constraint.parametricData = JSON.parse(JSON.stringify(snapshot.after))
      }
    })
  }

  protected doUndo(): void {
    this.applyAxisHints('before')
    this.transforms.forEach(({ pointId, before }) => {
      const point = this.scene.points.get(pointId)
      if (point) point.setPosition(before)
    })
    this.parametricSnapshots.forEach((snapshot) => {
      const constraint = this.scene.getObjectConstrainedPointConstraint(snapshot.pointId)
      if (constraint) {
        constraint.parametricData = snapshot.before
          ? JSON.parse(JSON.stringify(snapshot.before))
          : null
      }
    })
  }

  private applyAxisHints(field: 'before' | 'after'): void {
    for (const change of this.axisHintChanges) {
      const constraint = this.findConstraint(change.constraintType, change.constraintId)
      if (constraint) constraint.setAxisHint(change[field])
    }
  }

  private findConstraint(
    type: 'cube' | 'regularPolygon',
    id: string,
  ): { setAxisHint(v: Vec3): void } | null {
    if (type === 'cube') {
      const c = this.scene.cubeConstraints.get(id)
      return c && 'setAxisHint' in c ? (c as { setAxisHint(v: Vec3): void }) : null
    }
    if (type === 'regularPolygon') {
      const c = this.scene.regularPolygonConstraints.get(id)
      return c && 'setAxisHint' in c ? (c as { setAxisHint(v: Vec3): void }) : null
    }
    return null
  }
}
