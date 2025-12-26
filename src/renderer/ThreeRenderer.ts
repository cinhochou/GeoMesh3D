import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Interaction } from './Interaction'

export class ThreeRenderer {
  constructor(private container: HTMLElement) {}

  init() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
    this.camera.position.set(5, 5, 5)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(width, height)
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE, // 旋转交给 Interaction 控制开启与否
      RIGHT: THREE.MOUSE.PAN,
    }

    this.interaction = new Interaction(
      this.camera,
      this.scene,
      this.renderer.domElement,
      this.controls,
      (selected) => console.log('选中对象: ', selected),
    )

    this.scene.add(new THREE.GridHelper(20, 20))
    this.scene.add(new THREE.AxesHelper(5))

    this.animate()
  }

  animate = () => {
    requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
