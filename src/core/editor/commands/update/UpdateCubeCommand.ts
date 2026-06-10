import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { CubeConstraint } from '../../../constraints/CubeConstraint'

type CubeState = {
  name: string
  valueVisible: boolean
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
}

export class UpdateCubeCommand extends ConstraintAwareCommand {
  readonly label = '更新正六面体属性'

  private before: CubeState
  private after: CubeState

  constructor(
    private cubeId: string,
    before: CubeState,
    after: CubeState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const constraint = scene.cubeConstraints.get(cubeId)
    const cube = constraint as unknown as CubeConstraint
    if (cube) {
      this.markAffected(...cube.ownerPointIds)
      this.markAffectedPoints(cube.dependentLayouts.map((l) => l.pointId))
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: CubeState) {
    const constraint = this.scene.cubeConstraints.get(this.cubeId)
    const cube = constraint as unknown as CubeConstraint
    if (!cube) return
    cube.name = state.name
    cube.valueVisible = state.valueVisible
    cube.edgeLengthLocked = state.edgeLengthLocked
    cube.lockedEdgeLength = state.lockedEdgeLength
  }
}
