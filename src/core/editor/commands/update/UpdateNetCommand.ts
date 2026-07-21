import type { HistoryEntry } from '../../HistoryManager'
import type { Scene } from '../../../scene/Scene'
import type { NetMode } from '../../../geometry/Net'
import { Vec3 } from '../../../geometry/Vec3'

const genId = () => `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

export interface NetUpdateState {
  name?: string
  visible?: boolean
  unfoldRatio?: number
  position?: Vec3
  mode?: NetMode
  reset?: boolean
}

export class UpdateNetCommand implements HistoryEntry {
  public readonly id = genId()
  public readonly label = '更新展开图'
  public readonly timestamp = Date.now()

  private previousState: NetUpdateState = {}
  private didReset: boolean = false
  private snapshotBeforeReset: {
    name: string
    visible: boolean
    unfoldRatio: number
    position: Vec3
    mode: NetMode
  } | null = null
  private executedOnce = false

  constructor(
    private readonly scene: Scene,
    private readonly netId: string,
    private readonly updates: NetUpdateState,
  ) {}

  redo(): void {
    const net = this.scene.nets.get(this.netId)
    if (!net) return

    if (!this.executedOnce) {
      this.previousState = {
        name: net.name,
        visible: net.visible,
        unfoldRatio: net.unfoldRatio,
        position: new Vec3(net.position.x, net.position.y, net.position.z),
        mode: net.mode,
      }

      if (this.updates.reset) {
        this.snapshotBeforeReset = {
          name: net.name,
          visible: net.visible,
          unfoldRatio: net.unfoldRatio,
          position: new Vec3(net.position.x, net.position.y, net.position.z),
          mode: net.mode,
        }
        net.reset()
        this.didReset = true
      } else {
        if (this.updates.name !== undefined) net.setName(this.updates.name)
        if (this.updates.visible !== undefined) net.setVisible(this.updates.visible)
        if (this.updates.unfoldRatio !== undefined) net.setUnfoldRatio(this.updates.unfoldRatio)
        if (this.updates.position !== undefined) net.setPosition(new Vec3(this.updates.position.x, this.updates.position.y, this.updates.position.z))
        if (this.updates.mode !== undefined) net.setMode(this.updates.mode)
      }

      this.executedOnce = true
    } else {
      if (this.didReset) {
        net.reset()
      } else {
        if (this.updates.name !== undefined) net.setName(this.updates.name)
        if (this.updates.visible !== undefined) net.setVisible(this.updates.visible)
        if (this.updates.unfoldRatio !== undefined) net.setUnfoldRatio(this.updates.unfoldRatio)
        if (this.updates.position !== undefined) net.setPosition(new Vec3(this.updates.position.x, this.updates.position.y, this.updates.position.z))
        if (this.updates.mode !== undefined) net.setMode(this.updates.mode)
      }
    }

    this.scene.markNetDirty(this.netId)
  }

  undo(): void {
    const net = this.scene.nets.get(this.netId)
    if (!net) return

    if (this.didReset && this.snapshotBeforeReset) {
      net.setName(this.snapshotBeforeReset.name)
      net.setVisible(this.snapshotBeforeReset.visible)
      net.setUnfoldRatio(this.snapshotBeforeReset.unfoldRatio)
      net.setPosition(new Vec3(this.snapshotBeforeReset.position.x, this.snapshotBeforeReset.position.y, this.snapshotBeforeReset.position.z))
      net.setMode(this.snapshotBeforeReset.mode)
    } else {
      if (this.previousState.name !== undefined) net.setName(this.previousState.name)
      if (this.previousState.visible !== undefined) net.setVisible(this.previousState.visible)
      if (this.previousState.unfoldRatio !== undefined) net.setUnfoldRatio(this.previousState.unfoldRatio)
      if (this.previousState.position !== undefined) net.setPosition(new Vec3(this.previousState.position.x, this.previousState.position.y, this.previousState.position.z))
      if (this.previousState.mode !== undefined) net.setMode(this.previousState.mode)
    }

    this.scene.markNetDirty(this.netId)
  }
}
