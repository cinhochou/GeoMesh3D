import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'

type RegularPolygonState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
}

export class UpdateRegularPolygonCommand extends UpdateFeatureCommand {
  constructor(
    private constraintId: string,
    before: RegularPolygonState,
    after: RegularPolygonState,
    scene: Scene,
  ) {
    const constraint = scene.regularPolygonConstraints.get(constraintId)
    const polygonConstraint = constraint as unknown as RegularPolygonConstraint
    const affectedPointIds: string[] = []
    if (polygonConstraint) {
      affectedPointIds.push(...polygonConstraint.ownerPointIds)
      affectedPointIds.push(...polygonConstraint.dependentLayouts.map((l) => l.pointId))
    }

    super(
      scene,
      '更新正多边形属性',
      { id: constraintId, type: 'regularPolygon', params: {}, dependencies: [] },
      { elementIds: { faces: [polygonConstraint?.faceId ?? constraintId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
