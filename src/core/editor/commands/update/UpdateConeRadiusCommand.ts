import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type RadiusState = {
  radiusValue: number
}

export class UpdateConeRadiusCommand extends UpdateFeatureCommand {
  constructor(
    scene: Scene,
    private coneId: string,
    before: RadiusState,
    after: RadiusState,
  ) {
    const cone = scene.cones.get(coneId)
    const affectedPointIds: string[] = []
    if (cone) {
      affectedPointIds.push(cone.baseCenterPoint.id, cone.apexPoint.id)
    }

    super(
      scene,
      '更新圆锥半径',
      { id: coneId, type: 'cone', params: {}, dependencies: [] },
      { elementIds: { cones: [coneId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
