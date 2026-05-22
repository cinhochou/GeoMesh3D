import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { CubeConstraint } from '../../../constraints/CubeConstraint'

type CubeState = {
  name: string
  valueVisible: boolean
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
}

export class UpdateCubeCommand extends AbstractUpdateCommand<CubeState> {
  constructor(
    private cube: CubeConstraint,
    before: CubeState,
    after: CubeState,
  ) {
    super(before, after)
  }

  protected apply(state: CubeState) {
    this.cube.name = state.name
    this.cube.valueVisible = state.valueVisible
    this.cube.edgeLengthLocked = state.edgeLengthLocked
    this.cube.lockedEdgeLength = state.lockedEdgeLength
  }
}
