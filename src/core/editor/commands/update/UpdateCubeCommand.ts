import type { Command } from '../../Command'
import { CubeConstraint } from '../../../constraints/CubeConstraint'

type CubeState = {
  name: string
  valueVisible: boolean
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
}

export class UpdateCubeCommand implements Command {
  constructor(
    private cube: CubeConstraint,
    private before: CubeState,
    private after: CubeState,
  ) {}

  execute() {
    this.apply(this.after)
  }

  undo() {
    this.apply(this.before)
  }

  private apply(state: CubeState) {
    this.cube.name = state.name
    this.cube.valueVisible = state.valueVisible
    this.cube.edgeLengthLocked = state.edgeLengthLocked
    this.cube.lockedEdgeLength = state.lockedEdgeLength
  }
}
