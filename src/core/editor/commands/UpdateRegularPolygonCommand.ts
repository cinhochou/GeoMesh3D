import type { Command } from '../Command'
import { RegularPolygonConstraint } from '../../constraints/RegularPolygonConstraint'

type RegularPolygonState = {
  name: string
  valueVisible: boolean
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
}

export class UpdateRegularPolygonCommand implements Command {
  constructor(
    private constraint: RegularPolygonConstraint,
    private before: RegularPolygonState,
    private after: RegularPolygonState,
  ) {}

  execute() {
    this.apply(this.after)
  }

  undo() {
    this.apply(this.before)
  }

  private apply(state: RegularPolygonState) {
    this.constraint.name = state.name
    this.constraint.valueVisible = state.valueVisible
    this.constraint.edgeLengthLocked = state.edgeLengthLocked
    this.constraint.lockedEdgeLength = state.lockedEdgeLength
  }
}
