import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { Circle3 } from '../../../geometry/Circle3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export type ElementType = 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'face' | 'perpendicularLine' | 'parallelLine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const executeMap: Record<string, (scene: Scene, element: any) => void> = {
  point: (scene, el) => scene.addPoint(el),
  line: (scene, el) => scene.addLine(el),
  straightLine: (scene, el) => scene.addStraightLine(el),
  vector: (scene, el) => scene.addVector(el),
  ray: (scene, el) => scene.addRay(el),
  perpendicularLine: (scene, el) => scene.addPerpendicularLine(el),
  parallelLine: (scene, el) => scene.addParallelLine(el),
}

export function createAddElementCommand(
  scene: Scene,
  element: Point3 | Line3 | StraightLine3 | Ray3 | GeoVector3 | Circle3 | PlanarPolygon | PerpendicularLine3 | ParallelLine3,
  type: ElementType,
  boundaryLines: Line3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand(
    `add-${type}`,
    scene,
    () => {
      if (type === 'face') {
        boundaryLines.forEach((line) => scene.addLine(line))
        scene.addFace(element as PlanarPolygon)
      } else if (type === 'circle') {
        scene.addCircle(element as Circle3)
        if ((element as Circle3).isNormalCircle()) {
          const centerPoint = (element as Circle3).p1
          centerPoint.circleId = element.id
          centerPoint.circleRole = 'center'
        }
      } else {
        executeMap[type]!(scene, element)
      }
    },
  )

  cmd.executeAndCapture()
  return cmd
}
