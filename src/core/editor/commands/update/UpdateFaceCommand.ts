import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'

type FaceState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  areaLocked: boolean
  lockedArea: number
  edgeLengthLocks: Array<number | null>
}

export class UpdateFaceCommand extends UpdateFeatureCommand {
  constructor(
    private faceId: string,
    before: FaceState,
    after: FaceState,
    scene: Scene,
  ) {
    const face = scene.faces.get(faceId)
    const affectedPointIds: string[] = face ? [...face.boundaryPointIds] : []

    super(
      scene,
      '更新面属性',
      { id: faceId, type: 'face', params: {}, dependencies: [] },
      { elementIds: { faces: [faceId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
