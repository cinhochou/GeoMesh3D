import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { createAddFeatureCommand } from '../../../features'

export function createAddHexahedronCommand(
  scene: Scene,
  points: Point3[],
  faces: PlanarPolygon[],
  constraint: CubeConstraint,
  boundaryLines: Line3[] = [],
): ReturnType<typeof createAddFeatureCommand> {
  // 必须用约束自身的 cubeId 作为 feature id：
  // 约束在场景里是以 cubeId 挂载的（points/faces 也带 cubeId），
  // 若换成独立的合成 id，命令声明的 intent.targetId 在场景里查不到任何对象，
  // 会导致「相机聚焦拿不到主体范围 → 该步相机不动」，
  // 同时 HexahedronFeature.update() 的 scene.cubeConstraints.get(feature.id) 也会失败。
  return createAddFeatureCommand(scene, constraint.cubeId, 'hexahedron', {
    points,
    boundaryLines,
    faces,
    constraint,
  })
}
