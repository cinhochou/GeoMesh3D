import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeletePerpendicularLineCommand(
  scene: Scene,
  line: PerpendicularLine3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeletePerpendicularLineCommand', scene, () => {
    relatedPerpendicularLines.forEach((l) => {
      scene.removePerpendicularLine(l.id)
      scene.selection.perpendicularLines.delete(l.id)
    })
    relatedParallelLines.forEach((l) => {
      scene.removeParallelLine(l.id)
      scene.selection.parallelLines.delete(l.id)
    })
    scene.removePerpendicularLine(line.id)
    scene.selection.perpendicularLines.delete(line.id)
  })

  cmd.executeAndCapture()
  return cmd
}
