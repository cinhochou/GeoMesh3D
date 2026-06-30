import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type RayState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdateRayCommand extends UpdateFeatureCommand {
  constructor(
    private rayId: string,
    before: RayState,
    after: RayState,
    scene: Scene,
  ) {
    const ray = scene.rays.get(rayId)
    const affectedPointIds: string[] = []
    if (ray) {
      affectedPointIds.push(ray.p1.id, ray.p2.id)
    }

    super(
      scene,
      '更新射线属性',
      { id: rayId, type: 'ray', params: {}, dependencies: [] },
      { elementIds: { rays: [rayId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
