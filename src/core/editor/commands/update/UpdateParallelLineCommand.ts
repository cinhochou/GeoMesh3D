import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type ParallelLineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdateParallelLineCommand extends UpdateFeatureCommand {
  constructor(
    private lineId: string,
    before: ParallelLineState,
    after: ParallelLineState,
    scene: Scene,
  ) {
    const line = scene.parallelLines.get(lineId)
    const affectedPointIds: string[] = []
    if (line) {
      affectedPointIds.push(line.p1.id, line.p2.id)
    }

    super(
      scene,
      '更新平行线属性',
      { id: lineId, type: 'parallelLine', params: {}, dependencies: [] },
      { elementIds: { parallelLines: [lineId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
