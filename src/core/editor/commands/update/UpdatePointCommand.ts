import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type PointState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  visible: boolean
  labelOffsetX: number
  labelOffsetY: number
  userLocked: boolean
}

export class UpdatePointCommand extends UpdateFeatureCommand {
  constructor(
    private pointId: string,
    before: PointState,
    after: PointState,
    scene: Scene,
  ) {
    const point = scene.points.get(pointId)
    const affectedPointIds: string[] = point ? [point.id] : []

    super(
      scene,
      '更新点属性',
      { id: pointId, type: 'point', params: {}, dependencies: [] },
      { elementIds: { points: [pointId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
