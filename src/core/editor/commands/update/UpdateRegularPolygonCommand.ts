import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'

type RegularPolygonState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
}

export class UpdateRegularPolygonCommand extends ConstraintAwareCommand {
  readonly label = '更新正多边形属性'

  private before: RegularPolygonState
  private after: RegularPolygonState

  constructor(
    private constraintId: string,
    before: RegularPolygonState,
    after: RegularPolygonState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const constraint = scene.regularPolygonConstraints.get(constraintId)
    const polygonConstraint = constraint as unknown as RegularPolygonConstraint
    if (polygonConstraint) {
      this.markAffected(...polygonConstraint.ownerPointIds)
      this.markAffectedPoints(polygonConstraint.dependentLayouts.map((l) => l.pointId))
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: RegularPolygonState) {
    const constraint = this.scene.regularPolygonConstraints.get(this.constraintId)
    const polygonConstraint = constraint as unknown as RegularPolygonConstraint
    if (!polygonConstraint) return
    polygonConstraint.name = state.name
    polygonConstraint.nameVisible = state.nameVisible
    polygonConstraint.valueVisible = state.valueVisible
    polygonConstraint.edgeLengthLocked = state.edgeLengthLocked
    polygonConstraint.lockedEdgeLength = state.lockedEdgeLength
  }
}
