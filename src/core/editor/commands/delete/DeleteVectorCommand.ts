import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeleteVectorCommand(
  scene: Scene,
  vector: GeoVector3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteVectorCommand', scene, () => {
    relatedPerpendicularLines.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    relatedParallelLines.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    scene.vectors.delete(vector.id)
    scene.selection.vectors.delete(vector.id)
    scene.markAllRenderDirty()
  })

  cmd.executeAndCapture()
  return cmd
}
