import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

export type VectorPatch = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateVectorCommand extends UpdateFeatureCommand {
  constructor(
    scene: Scene,
    private vectorId: string,
    before: VectorPatch,
    after: VectorPatch,
  ) {
    const vector = scene.vectors.get(vectorId)
    const affectedPointIds: string[] = []
    if (vector) {
      affectedPointIds.push(vector.p1.id, vector.p2.id)
    }

    super(
      scene,
      '更新向量属性',
      { id: vectorId, type: 'vector', params: {}, dependencies: [] },
      { elementIds: { vectors: [vectorId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
