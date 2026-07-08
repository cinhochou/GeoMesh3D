import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { PrismConstraint } from '../../../constraints/PrismConstraint'

type PrismState = {
  name: string
  valueVisible: boolean
  keepVertical: boolean
  topPointPosition?: { x: number; y: number; z: number }
}

export class UpdatePrismCommand extends UpdateFeatureCommand {
  constructor(
    private prismId: string,
    before: PrismState,
    after: PrismState,
    scene: Scene,
  ) {
    const constraint = scene.prismConstraints.get(prismId)
    const prism = constraint as unknown as PrismConstraint
    const affectedPointIds: string[] = []
    if (prism) {
      affectedPointIds.push(...prism.ownerPointIds)
      affectedPointIds.push(...prism.dependentLayouts.map((l) => l.pointId))
    }

    super(
      scene,
      '更新棱柱属性',
      { id: prismId, type: 'prism', params: {}, dependencies: [] },
      { elementIds: { prisms: [prismId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
