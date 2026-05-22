import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'

type RegularPolygonState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
}

export class UpdateRegularPolygonCommand extends AbstractUpdateCommand<RegularPolygonState> {
  constructor(
    private constraint: RegularPolygonConstraint,
    before: RegularPolygonState,
    after: RegularPolygonState,
  ) {
    super(before, after)
  }

  protected apply(state: RegularPolygonState) {
    this.constraint.name = state.name
    this.constraint.nameVisible = state.nameVisible
    this.constraint.valueVisible = state.valueVisible
    this.constraint.edgeLengthLocked = state.edgeLengthLocked
    this.constraint.lockedEdgeLength = state.lockedEdgeLength
  }
}
