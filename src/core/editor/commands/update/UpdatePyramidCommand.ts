import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { PyramidConstraint } from '../../../constraints/PyramidConstraint'

type PyramidState = {
  name: string
  valueVisible: boolean
  keepVertical: boolean
  apexPointPosition?: { x: number; y: number; z: number }
}

export class UpdatePyramidCommand extends UpdateFeatureCommand {
  constructor(
    private pyramidId: string,
    before: PyramidState,
    after: PyramidState,
    scene: Scene,
  ) {
    const constraint = scene.pyramidConstraints.get(pyramidId)
    const pyramid = constraint as unknown as PyramidConstraint
    const affectedPointIds: string[] = []
    if (pyramid) {
      affectedPointIds.push(...pyramid.ownerPointIds)
    }

    super(
      scene,
      '更新棱锥属性',
      { id: pyramidId, type: 'pyramid', params: {}, dependencies: [] },
      { elementIds: { pyramids: [pyramidId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
