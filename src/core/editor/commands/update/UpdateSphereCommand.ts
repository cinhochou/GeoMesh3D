import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type SphereState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateSphereCommand extends UpdateFeatureCommand {
  constructor(
    sphereId: string,
    before: SphereState,
    after: SphereState,
    scene: Scene,
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
      '更新球体属性',
      { id: sphereId, type: 'sphere', params: {}, dependencies: [] },
      { elementIds: { spheres: [sphereId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
