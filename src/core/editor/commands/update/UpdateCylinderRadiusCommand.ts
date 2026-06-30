import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type RadiusState = {
  radiusValue: number
}

export class UpdateCylinderRadiusCommand extends UpdateFeatureCommand {
  constructor(
    scene: Scene,
    private cylinderId: string,
    before: RadiusState,
    after: RadiusState,
  ) {
    const cylinder = scene.cylinders.get(cylinderId)
    const affectedPointIds: string[] = []
    if (cylinder) {
      affectedPointIds.push(cylinder.bottomCenterPoint.id, cylinder.topCenterPoint.id)
    }

    super(
      scene,
      '更新圆柱半径',
      { id: cylinderId, type: 'cylinder', params: {}, dependencies: [] },
      { elementIds: { cylinders: [cylinderId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
