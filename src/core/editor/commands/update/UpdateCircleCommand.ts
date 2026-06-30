import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type CircleState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerVisible: boolean
  lockedRadius: number | null
}

export class UpdateCircleCommand extends UpdateFeatureCommand {
  constructor(
    private circleId: string,
    before: CircleState,
    after: CircleState,
    scene?: Scene,
  ) {
    const circle = scene?.circles.get(circleId)
    const affectedPointIds: string[] = []
    if (circle) {
      affectedPointIds.push(circle.p1.id, circle.p2.id, circle.p3.id)
    }

    super(
      scene!,
      '更新圆属性',
      { id: circleId, type: 'circle', params: {}, dependencies: [] },
      { elementIds: { circles: [circleId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
