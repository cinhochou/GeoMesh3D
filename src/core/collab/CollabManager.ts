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
    if (this.provider) this.provider.destroy()

    // 使用你指定的信令服务器
    this.provider = new WebrtcProvider(roomName, this.ydoc, {
      signaling: ['wss://electrokinetic-shawanna-unstrewn.ngrok-free.dev/'],
    })

    this.provider.on('peers', ({ webrtcPeers }) => {
      this.onPeersUpdate(webrtcPeers.length + 1)
    })
  }

  private setupObservers() {
    // 监听远端点的变化
    this.yPoints.observe((event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = this.yPoints.get(id)
          const point = this.scene.points.get(id)
          if (point) {
            point.setPosition(new Vec3(data.x, data.y, data.z))
          } else {
            this.scene.addPoint(new Point3(id, new Vec3(data.x, data.y, data.z)))
          }
        }
      })
    })

    // 监听远端线的变化
    this.yLines.observe((event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add') {
          const data = this.yLines.get(id)
          const p1 = this.scene.points.get(data.p1Id)
          const p2 = this.scene.points.get(data.p2Id)
          if (p1 && p2 && !this.scene.lines.has(id)) {
            this.scene.addLine(new Line3(id, p1, p2))
          }
        }
      })
    })
  }

  // 当本地执行 Command 后，同步数据到 YJS
  syncAction() {
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
