// src/renderer/Interaction.ts
import * as THREE from 'three'
import { Editor, EditorMode } from '../core/editor/Editor'
import { Vec3 } from '../core/geometry/Vec3'
import { ThreeRenderer } from './ThreeRenderer'

export class Interaction {
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()
  draggingPointId: string | null = null
  draggingLineId: string | null = null
  rubberBandData: { from: THREE.Vector3; to: THREE.Vector3 } | null = null //存储连线预览位置

  constructor(
    public editor: Editor,
    public renderer: ThreeRenderer,
  ) {
    // 设置射线检测线的灵敏度
    this.raycaster.params.Line = { threshold: 0.2 }
  }

  bind(dom: HTMLElement) {
    dom.addEventListener('mousedown', this.onMouseDown)
    dom.addEventListener('mousemove', this.onMouseMove)
    dom.addEventListener('mouseup', this.onMouseUp)
  }

  /** 网格吸附工具函数 */
  private snap(value: number, step: number = 0.5): number {
    return Math.round(value / step) * step
  }

  onMouseDown = (e: MouseEvent) => {
    this.updateMouse(e)
    const hit = this.pick()

    if (this.editor.mode === EditorMode.CreatePoint) {
      this.renderer.controls.enabled = false
      this.raycaster.setFromCamera(this.mouse, this.renderer.camera)
      const direction = this.raycaster.ray.direction
      const pos = this.renderer.camera.position.clone().add(direction.multiplyScalar(30))

      //只有当开关开启且没有按住 Alt 时，才进行吸附
      if (this.editor.isSnappingEnabled && !e.altKey) {
        pos.set(this.snap(pos.x), this.snap(pos.y), this.snap(pos.z))
      }
      this.editor.createPoint(new Vec3(pos.x, pos.y, pos.z))
      return
    }

    if (hit) {
      this.renderer.controls.enabled = false
      const { geoId, type } = hit.userData
      if (this.editor.mode === EditorMode.Select) {
        this.renderer.renderer.domElement.style.cursor = 'grabbing'
        if (type === 'point') {
          this.draggingPointId = geoId
          // 关键点：传入 true，实现点击即多选，不再清空之前的
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (type === 'line') {
          this.draggingLineId = geoId
          // 关键点：传入 true，多选线
          this.editor.scene.selection.selectLine(geoId, true)
        }
      } else if (this.editor.mode === EditorMode.CreateLine && type === 'point') {
        this.editor.tryCreateLineWith(this.editor.scene.points.get(geoId)!)
      }
    } else {
      if (this.editor.mode === EditorMode.Select) this.editor.scene.selection.clear()
    }
  }

  onMouseMove = (e: MouseEvent) => {
    this.updateMouse(e)

    // --- 处理创建点模式下的辅助线预览 ---
    if (this.editor.mode === EditorMode.CreatePoint) {
      this.raycaster.setFromCamera(this.mouse, this.renderer.camera)
      const direction = this.raycaster.ray.direction
      const previewPos = this.renderer.camera.position.clone().add(direction.multiplyScalar(30))

      if (this.editor.isSnappingEnabled && !e.altKey) {
        previewPos.set(this.snap(previewPos.x), this.snap(previewPos.y), this.snap(previewPos.z))
      }

      // 调用渲染器显示三轴辅助线
      this.renderer.showAxisGuidesAt(previewPos)
      return // 预览模式下不执行后续拖拽逻辑
    }

    // 橡皮筋逻辑
    if (this.editor.mode === EditorMode.CreateLine && this.editor.selectedPoints.length === 1) {
      const startPoint = this.editor.selectedPoints[0]
      const from = new THREE.Vector3(
        startPoint!.position.x,
        startPoint!.position.y,
        startPoint!.position.z,
      )

      // 计算鼠标在 3D 空间的投影点
      this.raycaster.setFromCamera(this.mouse, this.renderer.camera)
      // 这里我们假设在以起点为准的水平面上预览，或者简单的距离相机 30 个单位
      const to = this.raycaster.ray.at(30, new THREE.Vector3())

      // 如果有吸附开关，也应用到预览线上
      if (this.editor.isSnappingEnabled && !e.altKey) {
        to.set(this.snap(to.x), this.snap(to.y), this.snap(to.z))
      }

      this.rubberBandData = { from, to }
    } else {
      this.rubberBandData = null
    }

    const selection = this.editor.scene.selection

    // 拖动点（包含选中的所有点和线段端点）
    if (this.draggingPointId) {
      const point = this.editor.scene.points.get(this.draggingPointId)
      if (point) {
        this.handleDrag(
          point.position,
          (delta) => {
            const toMove = new Set<string>()

            // 核心逻辑：只要我们在拖拽，就把所有选中的点和线关联的点都加进移动列表
            selection.points.forEach((id) => toMove.add(id))
            selection.lines.forEach((lid) => {
              const l = this.editor.scene.lines.get(lid)
              if (l) {
                toMove.add(l.p1.id)
                toMove.add(l.p2.id)
              }
            })

            // 确保当前拖拽的对象也在里面（防止它没被选中也能拖）
            toMove.add(this.draggingPointId!)

            toMove.forEach((id) => this.editor.movePoint(id, delta))
          },
          e.altKey,
        )
      }
    }
    // 拖动线
    else if (this.draggingLineId) {
      const line = this.editor.scene.lines.get(this.draggingLineId)
      if (line) {
        const mid = new Vec3(
          (line.p1.position.x + line.p2.position.x) / 2,
          (line.p1.position.y + line.p2.position.y) / 2,
          (line.p1.position.z + line.p2.position.z) / 2,
        )
        this.handleDrag(
          mid,
          (delta) => {
            const toMove = new Set<string>()

            // 移动所有选中的线段的所有端点
            selection.lines.forEach((lid) => {
              const l = this.editor.scene.lines.get(lid)
              if (l) {
                toMove.add(l.p1.id)
                toMove.add(l.p2.id)
              }
            })
            // 也要移动选中的孤立点
            selection.points.forEach((id) => toMove.add(id))

            // 确保当前拖拽的线关联的点也在里面
            toMove.add(line.p1.id)
            toMove.add(line.p2.id)

            toMove.forEach((id) => this.editor.movePoint(id, delta))
          },
          e.altKey,
        )
      }
    }
  }

  onMouseUp = () => {
    this.draggingPointId = null
    this.draggingLineId = null
    this.renderer.controls.enabled = true
    this.renderer.renderer.domElement.style.cursor = 'default'

    if (this.editor.mode !== EditorMode.CreatePoint) {
      this.renderer.hideAxisGuides()
    }
  }

  /** 统一的拾取函数，支持点和线 */
  pick(): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.mouse, this.renderer.camera)
    const hits = this.raycaster.intersectObjects([...this.renderer.meshMap.values()])

    if (hits.length > 0) {
      // 优先寻找碰撞列表中的“点”
      const pointHit = hits.find((h) => h.object.userData.type === 'point')
      if (pointHit) return pointHit.object

      // 如果没点中点，再看有没有点中“线”
      const lineHit = hits.find((h) => h.object.userData.type === 'line')
      if (lineHit) return lineHit.object

      return hits[0]!.object
    }
    return null
  }

  updateMouse(e: MouseEvent) {
    const rect = this.renderer.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  /**
   * 抽离通用的拖拽计算逻辑
   * @param referencePos 参考点坐标（Vec3）
   * @param applyDelta 回调函数，接收计算出的位移
   */
  private handleDrag(referencePos: Vec3, applyDelta: (d: Vec3) => void, isAltPressed: boolean) {
    const cameraDir = new THREE.Vector3()
    this.renderer.camera.getWorldDirection(cameraDir)

    // 创建一个面对相机的虚拟平面，通过参考点
    const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      cameraDir,
      new THREE.Vector3(referencePos.x, referencePos.y, referencePos.z),
    )

    this.raycaster.setFromCamera(this.mouse, this.renderer.camera)
    const targetPos = new THREE.Vector3()

    if (this.raycaster.ray.intersectPlane(dragPlane, targetPos)) {
      // 吸附逻辑判断
      if (this.editor.isSnappingEnabled && !isAltPressed) {
        targetPos.set(this.snap(targetPos.x), this.snap(targetPos.y), this.snap(targetPos.z))
      }

      const delta = new Vec3(
        targetPos.x - referencePos.x,
        targetPos.y - referencePos.y,
        targetPos.z - referencePos.z,
      )

      if (delta.x !== 0 || delta.y !== 0 || delta.z !== 0) {
        applyDelta(delta)
      }
    }
  }
}
