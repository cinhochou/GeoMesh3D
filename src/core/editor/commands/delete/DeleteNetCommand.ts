import type { HistoryEntry } from '../../HistoryManager'
import type { Scene } from '../../../scene/Scene'
import type { Net } from '../../../geometry/Net'

const genId = () => `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

export class DeleteNetCommand implements HistoryEntry {
  public readonly id = genId()
  public readonly label = '删除展开图'
  public readonly timestamp = Date.now()
  private netSnapshot: Net | null = null

  constructor(
    private readonly scene: Scene,
    private readonly netId: string,
  ) {}

  redo(): void {
    const net = this.scene.nets.get(this.netId)
    if (net) {
      this.netSnapshot = net.clone()
      this.scene.removeNet(this.netId)
    }
  }

  undo(): void {
    if (this.netSnapshot) {
      this.scene.addNet(this.netSnapshot)
      this.netSnapshot = null
    }
  }
}
