/// <reference types="vite/client" />

import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    guestOnly?: boolean
    requiresAuth?: boolean
  }
}

declare namespace THREEx {
  class ArToolkitSource {
    constructor(params: { sourceType: string })
    domElement: HTMLVideoElement
    ready: boolean
    init(onReady: () => void): void
    onResizeElement(): void
    onResize(): void
    copyElementSizeTo(el: HTMLElement): void
    copySizeTo(el: HTMLElement): void
  }

  class ArToolkitContext {
    constructor(params: { cameraParametersUrl: string; detectionMode: string })
    init(onReady: () => void): void
    getProjectionMatrix(): THREE.Matrix4
    update(sourceElement: HTMLElement): void
  }

  class ArMarkerControls {
    constructor(
      arToolkitContext: ArToolkitContext,
      object3d: THREE.Object3D,
      parameters: {
        type: string
        patternUrl: string
        changeMatrixMode: string
        maxDetectionRate: number
      },
    )
  }
}

interface Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
  }) => Promise<FileSystemFileHandle>
}
