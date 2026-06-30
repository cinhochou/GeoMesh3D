import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type SphereRadiusState = {
  radiusValue: number
}

export class UpdateSphereRadiusCommand extends UpdateFeatureCommand {
  constructor(
    scene: Scene,
    private sphereId: string,
    before: SphereRadiusState,
    after: SphereRadiusState,
  ) {
    const sphere = scene.spheres.get(sphereId)
    const affectedPointIds: string[] = []
    if (sphere) {
      affectedPointIds.push(sphere.centerPoint.id)
      if (sphere.radiusPoint) {
        affectedPointIds.push(sphere.radiusPoint.id)
      }
    }

    super(
      scene,
      '更新球体半径',
      { id: sphereId, type: 'sphere', params: {}, dependencies: [] },
      { elementIds: { spheres: [sphereId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
