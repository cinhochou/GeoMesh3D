import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { Vec3 } from '../../../geometry/Vec3'

type LineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  lengthLocked: boolean
  lockedLength: number
  p1Position?: Vec3
  p2Position?: Vec3
}

export class UpdateLineCommand extends UpdateFeatureCommand {
  constructor(
    private lineId: string,
    before: LineState,
    after: LineState,
    scene: Scene,
  ) {
    const line = scene.lines.get(lineId)
    const affectedPointIds: string[] = []
    if (line) {
      affectedPointIds.push(line.p1.id, line.p2.id)
    }

    super(
      scene,
      '更新线段属性',
      { id: lineId, type: 'line', params: {}, dependencies: [] },
      { elementIds: { lines: [lineId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
