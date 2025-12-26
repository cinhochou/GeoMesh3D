import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class Interaction {
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private selected: THREE.Object3D | null = null
  private dragging = false

  constructor(
    private camera: THREE.Camera,
    private scene: THREE.Scene,
    private domElement: HTMLElement,
    private controls: OrbitControls,
    private onSelect: (obj: THREE.Object3D | null) => void,
  ) {
    this.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.domElement.addEventListener('pointermove', this.onPointerMove)
    this.domElement.addEventListener('pointerup', this.onPointerUp)
  }

  private setPointer(event: PointerEvent) {
    const rect = this.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  private intersectObjects() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.scene.children, true)
  }

  private onPointerDown = (event: PointerEvent) => {
    this.setPointer(event)
    const intersects = this.intersectObjects()

    if (intersects.length > 0) {
      this.selected = intersects[0]!.object
      this.dragging = true
      this.controls.enabled = false // ⛔ 禁用旋转
      this.onSelect(this.selected)
    } else {
      // 点击空白，取消选中
      this.selected = null
      this.dragging = false
      this.controls.enabled = true // 允许旋转
      this.onSelect(null)
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging || !this.selected) return

    this.setPointer(event)
    const intersects = this.intersectObjects()

    if (intersects.length > 0) {
      const point = intersects[0]!.point
      this.selected.position.copy(point) // 简单版拖拽
    }
  }

  private onPointerUp = () => {
    this.dragging = false
    this.controls.enabled = true
  }
}
