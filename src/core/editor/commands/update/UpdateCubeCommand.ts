import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { CubeConstraint } from '../../../constraints/CubeConstraint'

type CubeState = {
  name: string
  valueVisible: boolean
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
}

export class UpdateCubeCommand extends UpdateFeatureCommand {
  constructor(
    private cubeId: string,
    before: CubeState,
    after: CubeState,
    scene: Scene,
  ) {
    const constraint = scene.cubeConstraints.get(cubeId)
    const cube = constraint as unknown as CubeConstraint
    const affectedPointIds: string[] = []
    if (cube) {
      affectedPointIds.push(...cube.ownerPointIds)
      affectedPointIds.push(...cube.dependentLayouts.map((l) => l.pointId))
    }

    super(
      scene,
      '更新正六面体属性',
      { id: cubeId, type: 'hexahedron', params: {}, dependencies: [] },
      { elementIds: { cubes: [cubeId] } },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
