import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type PerpendicularLineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdatePerpendicularLineCommand extends UpdateFeatureCommand {
  constructor(
    private lineId: string,
    before: PerpendicularLineState,
    after: PerpendicularLineState,
    scene: Scene,
  ) {
    const line = scene.perpendicularLines.get(lineId)
    const affectedPointIds: string[] = []
    if (line) {
      affectedPointIds.push(line.p1.id, line.p2.id)
    }

    super(
      scene,
      '更新垂线属性',
      { id: lineId, type: 'perpendicularLine', params: {}, dependencies: [] },
      { elementIds: { perpendicularLines: [lineId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
