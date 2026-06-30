import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type ConeState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateConeCommand extends UpdateFeatureCommand {
  constructor(
    private coneId: string,
    before: ConeState,
    after: ConeState,
    scene: Scene,
  ) {
    const cone = scene.cones.get(coneId)
    const affectedPointIds: string[] = []
    if (cone) {
      affectedPointIds.push(cone.baseCenterPoint.id, cone.apexPoint.id)
    }

    super(
      scene,
      '更新圆锥属性',
      { id: coneId, type: 'cone', params: {}, dependencies: [] },
      { elementIds: { cones: [coneId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
