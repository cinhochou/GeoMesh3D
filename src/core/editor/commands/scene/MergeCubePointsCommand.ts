import { SnapshotCommand } from '../SnapshotCommand'
import { executeMergePoints } from './MergePointsCommand'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'
import { Scene } from '../../../scene/Scene'

type PointTransform = {
  pointId: string
  before: Vec3
  after: Vec3
}

/**
 * 创建立方体平移合并命令（基于快照模式）。
 *
 * 先执行点位置变换，再执行点合并。
 * 整体由 SnapshotCommand 的全量快照自动处理 undo/redo。
 */
export function createMergeCubePointsCommand(
  scene: Scene,
  keepPoint: Point3,
  removePoint: Point3,
  transforms: PointTransform[],
): SnapshotCommand {
  const cmd = new SnapshotCommand('MergeCubePointsCommand', scene, () => {
    // 直接应用变换
    transforms.forEach(({ pointId, after }) => {
      const point = scene.points.get(pointId)
      if (point) {
        point.setPosition(after)
      }
    })
    executeMergePoints(scene, keepPoint, removePoint)
  })

  cmd.executeAndCapture()
  return cmd
}
