import type { HistoryEntry } from '../../HistoryManager'
import type { Scene } from '../../../scene/Scene'
import { Net } from '../../../geometry/Net'

const genId = () => `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

export class AddNetCommand implements HistoryEntry {
  public readonly id = genId()
  public readonly label = '添加展开图'
  public readonly timestamp = Date.now()

  constructor(
    private readonly scene: Scene,
    private readonly net: Net,
  ) {}

  redo(): void {
    this.scene.addNet(this.net)
  }

  undo(): void {
    this.scene.removeNet(this.net.id)
  }
}
