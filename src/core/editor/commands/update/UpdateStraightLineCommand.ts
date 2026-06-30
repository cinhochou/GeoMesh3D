import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type StraightLineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdateStraightLineCommand extends UpdateFeatureCommand {
  constructor(
    private lineId: string,
    before: StraightLineState,
    after: StraightLineState,
    scene: Scene,
  ) {
    const line = scene.straightLines.get(lineId)
    const affectedPointIds: string[] = []
    if (line) {
      affectedPointIds.push(line.p1.id, line.p2.id)
    }

    super(
      scene,
      '更新直线属性',
      { id: lineId, type: 'straightLine', params: {}, dependencies: [] },
      { elementIds: { straightLines: [lineId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
