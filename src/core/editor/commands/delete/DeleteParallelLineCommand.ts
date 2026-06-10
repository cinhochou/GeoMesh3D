import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'

export function createDeleteParallelLineCommand(
  scene: Scene,
  line: ParallelLine3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteParallelLineCommand', scene, () => {
    relatedPerpendicularLines.forEach((l) => {
      scene.removePerpendicularLine(l.id)
      scene.selection.perpendicularLines.delete(l.id)
    })
    relatedParallelLines.forEach((l) => {
      scene.removeParallelLine(l.id)
      scene.selection.parallelLines.delete(l.id)
    })
    scene.removeParallelLine(line.id)
    scene.selection.parallelLines.delete(line.id)
  })

  cmd.executeAndCapture()
  return cmd
}
