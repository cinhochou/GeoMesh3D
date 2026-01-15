// src/core/collab/CollabManager.ts
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { Scene } from '../scene/Scene'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Vec3 } from '../geometry/Vec3'

export class CollabManager {
  private ydoc: Y.Doc
  private provider: WebrtcProvider | null = null
  private yPoints: Y.Map<any>
  private yLines: Y.Map<any>

  public onPeersUpdate: (count: number) => void = () => {}

  constructor(private scene: Scene) {
    this.ydoc = new Y.Doc()
    this.yPoints = this.ydoc.getMap('points')
    this.yLines = this.ydoc.getMap('lines')
    this.setupObservers()
  }

  joinRoom(roomName: string) {
    // 1. 如果已有连接，先彻底退出
    this.leaveRoom()

    console.log(`正在加入房间: ${roomName}`)

    // 2. 初始化 WebrtcProvider
    this.provider = new WebrtcProvider(roomName, this.ydoc, {
      signaling: ['wss://electrokinetic-shawanna-unstrewn.ngrok-free.dev/'],
      // 这里的 peerOpts 可以设置连接超时等
    })

    // 3. 监听人数变化
    this.provider.on('peers', (params: any) => {
      // webrtcPeers 是其他人的数量，所以要 +1 (自己)
      const count = params.webrtcPeers ? params.webrtcPeers.length + 1 : 1
      this.onPeersUpdate(count)
    })

    // 4. 监听连接状态（可选，用于调试）
    this.provider.on('status', ({ connected }: { connected: boolean }) => {
      console.log(`协作房间: ${roomName}`, ',协作连接状态:', connected ? '已连接' : '已断开')
    })
  }

  leaveRoom() {
    if (this.provider) {
      console.log('正在断开并清理协作实例...')

      // 显式停止 WebRTC 监听和信令交换
      this.provider.disconnect()

      // 销毁实例，解绑所有事件处理程序
      this.provider.destroy()

      this.provider = null

      // 重置外部人数显示
      this.onPeersUpdate(1)
    }
  }

  private setupObservers() {
    this.yPoints.observe((event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = this.yPoints.get(id)
          if (!data) return
          const point = this.scene.points.get(id)
          if (point) {
            point.setPosition(new Vec3(data.x, data.y, data.z))
          } else {
            this.scene.addPoint(new Point3(id, new Vec3(data.x, data.y, data.z)))
          }
        }
      })
    })

    this.yLines.observe((event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add') {
          const data = this.yLines.get(id)
          if (!data) return
          const p1 = this.scene.points.get(data.p1Id)
          const p2 = this.scene.points.get(data.p2Id)
          if (p1 && p2 && !this.scene.lines.has(id)) {
            this.scene.addLine(new Line3(id, p1, p2))
          }
        }
      })
    })
  }

  syncAction() {
    // 只有在连接状态下才执行同步
    if (!this.provider || !this.provider.connected) return

    this.ydoc.transact(() => {
      this.scene.points.forEach((p, id) => {
        this.yPoints.set(id, { x: p.position.x, y: p.position.y, z: p.position.z })
      })
      this.scene.lines.forEach((l, id) => {
        this.yLines.set(id, { p1Id: l.p1.id, p2Id: l.p2.id })
      })
    })
  }
}
