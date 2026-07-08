import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Vec3 } from '../../../geometry/Vec3'
import type { PrismConstraint } from '../../../constraints/PrismConstraint'
import type { Scene } from '../../../scene/Scene'

/**
 * 移动棱柱 owner 点（最高点或底面参考顶点）的命令。
 *
 * 在“垂直保持”模式下移动最高点时，会同时记录并恢复缓存高度 verticalHeight，
 * 保证 undo/redo 后约束求解不会又把最高点拉回到旧高度。
 */
export class TransformPrismOwnerPointCommand extends ConstraintAwareCommand {
  readonly label = '移动棱柱顶点'

  private pointId: string
  private before: Vec3
  private after: Vec3
  private beforeVerticalHeight: number | null
  private afterVerticalHeight: number | null

  constructor(
    scene: Scene,
    private constraint: PrismConstraint,
    pointId: string,
    before: Vec3,
    after: Vec3,
    beforeVerticalHeight: number | null,
    afterVerticalHeight: number | null,
  ) {
    super(scene)
    this.pointId = pointId
    this.before = before
    this.after = after
    this.beforeVerticalHeight = beforeVerticalHeight
    this.afterVerticalHeight = afterVerticalHeight

    this.markAffected(pointId)
    for (const layout of constraint.dependentLayouts) {
      this.markAffected(layout.pointId)
    }
  }

  protected doExecute(): void {
    this.applyPosition(this.after)
    if (this.afterVerticalHeight !== null) {
      this.constraint.setVerticalHeight(this.afterVerticalHeight)
    }
  }

  protected doUndo(): void {
    this.applyPosition(this.before)
    if (this.beforeVerticalHeight !== null) {
      this.constraint.setVerticalHeight(this.beforeVerticalHeight)
    }
  }

  private applyPosition(position: Vec3): void {
    const point = this.scene.points.get(this.pointId)
    if (point) point.setPosition(position)
  }
}
