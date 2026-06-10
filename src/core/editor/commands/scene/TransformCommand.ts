import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Vec3 } from '../../../geometry/Vec3'
import type { ParametricData } from '../../../constraints/ObjectConstrainedPointConstraint'
import type { Scene } from '../../../scene/Scene'

type AxisHintChange = {
  constraintType: 'cube' | 'regularPolygon'
  constraintId: string
  before: Vec3
  after: Vec3
}

/**
 * 移动单个点的命令。
 * 使用 pointId 而非直接 Point3 引用，确保在 SnapshotCommand 重建对象后仍能正确操作。
 */
export class TransformCommand extends ConstraintAwareCommand {
  readonly label = 'TransformCommand'

  private pointId: string
  private before: Vec3
  private after: Vec3
  private axisHintChanges: AxisHintChange[]
  private beforeParametricData: ParametricData | null
  private afterParametricData: ParametricData | null

  constructor(
    pointId: string,
    before: Vec3,
    after: Vec3,
    axisHintChanges: AxisHintChange[] = [],
    scene: Scene,
  ) {
    super(scene)
    this.pointId = pointId
    this.before = before
    this.after = after
    this.axisHintChanges = axisHintChanges
    const constraint = scene.getObjectConstrainedPointConstraint(pointId)
    if (constraint) {
      const saved = constraint.parametricData
      constraint.computeParametricDataFromPosition(before)
      this.beforeParametricData = constraint.parametricData
        ? JSON.parse(JSON.stringify(constraint.parametricData))
        : null
      constraint.computeParametricDataFromPosition(after)
      this.afterParametricData = constraint.parametricData
        ? JSON.parse(JSON.stringify(constraint.parametricData))
        : null
      constraint.parametricData = saved
    } else {
      this.beforeParametricData = null
      this.afterParametricData = null
    }
    this.markAffected(pointId)
  }

  protected doExecute(): void {
    this.applyAxisHints('after')
    const point = this.scene.points.get(this.pointId)
    if (point) point.setPosition(this.after)
    const constraint = this.scene.getObjectConstrainedPointConstraint(this.pointId)
    if (constraint && this.afterParametricData) {
      constraint.parametricData = JSON.parse(JSON.stringify(this.afterParametricData))
    }
  }

  protected doUndo(): void {
    this.applyAxisHints('before')
    const point = this.scene.points.get(this.pointId)
    if (point) point.setPosition(this.before)
    const constraint = this.scene.getObjectConstrainedPointConstraint(this.pointId)
    if (constraint) {
      constraint.parametricData = this.beforeParametricData
        ? JSON.parse(JSON.stringify(this.beforeParametricData))
        : null
    }
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
