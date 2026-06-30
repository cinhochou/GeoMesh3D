import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type CylinderState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateCylinderCommand extends UpdateFeatureCommand {
  constructor(
    private cylinderId: string,
    before: CylinderState,
    after: CylinderState,
    scene: Scene,
  ) {
    const cylinder = scene.cylinders.get(cylinderId)
    const affectedPointIds: string[] = []
    if (cylinder) {
      affectedPointIds.push(cylinder.bottomCenterPoint.id, cylinder.topCenterPoint.id)
    }

    super(
      scene,
      '更新圆柱属性',
      { id: cylinderId, type: 'cylinder', params: {}, dependencies: [] },
      { elementIds: { cylinders: [cylinderId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
