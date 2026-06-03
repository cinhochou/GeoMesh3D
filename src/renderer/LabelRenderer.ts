import * as THREE from 'three'
import { AxisGridManager } from './AxisGridManager'

type LabelSpriteUserData = THREE.Object3D['userData'] & {
  text?: string
  isNameLabel?: boolean
  isValueLabel?: boolean
  layoutMode?: 'name' | 'combined' | 'value'
  geoId?: string
  geoType?: string
  textPixelWidth?: number
  textPixelHeight?: number
  canvasPixelWidth?: number
  canvasPixelHeight?: number
  canvasResized?: boolean
}

export interface LabelRendererDeps {
  container: HTMLElement
  getActiveCamera: () => THREE.Camera
  getActiveCameraSpriteScaleFactor: () => number
  isARActive: () => boolean
  isTouchPreferredDevice: () => boolean
  isARCoarsePointer: () => boolean
  world: THREE.Group
  scene: THREE.Scene
  getCurrentWorldScale: () => number
  getFovSpriteScale: () => number
}

export class LabelRenderer {
  public labelMeshes = new Map<string, THREE.Sprite>()
  public pointLabelMeshes = new Map<string, THREE.Sprite>()
  public linearLabelMeshes = new Map<string, THREE.Sprite>()
  public cubeValueLabels = new Map<string, THREE.Sprite>()

  private pointTextureCache = new Map<string, THREE.CanvasTexture>()
  private readonly deps: LabelRendererDeps

  constructor(deps: LabelRendererDeps) {
    this.deps = deps
  }

  private getLabelUserData(sprite: THREE.Sprite): LabelSpriteUserData {
    return sprite.userData as LabelSpriteUserData
  }

  makeColoredTextSprite(message: string, axisColor: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 128
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    context.font = 'Bold 64px Arial'

    const r = (axisColor >> 16) & 255
    const g = (axisColor >> 8) & 255
    const b = axisColor & 255

    context.fillStyle = `rgb(${r}, ${g}, ${b})`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(message, size / 2, size / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })

    const sprite = new THREE.Sprite(material)
    const h = this.deps.container.clientHeight || 1
    const axisLabelScale = (AxisGridManager.AXIS_LABEL_PIXEL / h / this.deps.getCurrentWorldScale()) * this.deps.getFovSpriteScale()
    sprite.scale.set(axisLabelScale, axisLabelScale, 1)
    sprite.userData = { type: 'axisLabel' }

    return sprite
  }

  makePointLabelSprite(
    message: string,
    color: number,
    valueText: string = '',
  ): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 256
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    const metrics = valueText
      ? this.drawCombinedLabel(context, canvas, message, valueText, color, 72)
      : this.drawNameLabel(context, canvas, message, color, 72)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })

    const sprite = new THREE.Sprite(material)
    Object.assign(this.getLabelUserData(sprite), metrics, {
      layoutMode: valueText ? 'combined' as const : 'name' as const,
    })
    return sprite
  }

  makeLineLabelSprite(
    message: string,
    color: number,
    valueText: string = '',
  ): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 256
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    const metrics = valueText
      ? this.drawCombinedLabel(context, canvas, message, valueText, color, 56)
      : this.drawNameLabel(context, canvas, message, color, 56)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })

    const sprite = new THREE.Sprite(material)
    Object.assign(this.getLabelUserData(sprite), metrics, {
      layoutMode: valueText ? 'combined' as const : 'name' as const,
    })
    return sprite
  }

  makeValueLabelSprite(message: string, color: number, isPoint: boolean): THREE.Sprite {
    const sprite = this.createAdaptiveLabelSprite(message, color, isPoint ? 72 : 56)
    this.getLabelUserData(sprite).layoutMode = 'value'
    return sprite
  }

  drawNameLabel(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    message: string,
    color: number,
    mainFontSize: number,
  ) {
    const metrics = this.measureNameText(message, mainFontSize)
    const nextWidth = 256
    const nextHeight = 256
    const widthChanged = canvas.width !== nextWidth
    const heightChanged = canvas.height !== nextHeight
    if (widthChanged) canvas.width = nextWidth
    if (heightChanged) canvas.height = nextHeight

    const ctx = canvas.getContext('2d')!
    const baselineY = canvas.height / 2 + mainFontSize * 0.18
    const r = (color >> 16) & 255
    const g = (color >> 8) & 255
    const b = color & 255

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    const startX = (canvas.width - metrics.width) / 2

    ctx.font = `Bold ${mainFontSize}px Arial`
    ctx.fillText(metrics.mainText, startX, baselineY)

    if (metrics.suffixText) {
      ctx.font = `Bold ${metrics.suffixFontSize}px Arial`
      ctx.fillText(
        metrics.suffixText,
        startX + metrics.mainWidth + metrics.gap,
        baselineY + mainFontSize * 0.22,
      )
    }

    return {
      textPixelWidth: metrics.width,
      textPixelHeight: mainFontSize,
      canvasPixelWidth: canvas.width,
      canvasPixelHeight: canvas.height,
      canvasResized: widthChanged || heightChanged,
    }
  }

  drawCombinedLabel(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    nameText: string,
    valueText: string,
    color: number,
    mainFontSize: number,
  ) {
    const nameMetrics = this.measureNameText(nameText, mainFontSize)
    context.font = `Bold ${mainFontSize}px Arial`
    const valueWidth = valueText ? context.measureText(valueText).width : 0
    const valueGap = valueText ? Math.max(4, Math.round(mainFontSize * 0.08)) : 0
    const nameSlotWidth = 256
    const totalWidth = Math.max(1, nameSlotWidth + (valueText ? valueGap + valueWidth : 0))
    const paddingX = Math.max(24, Math.round(mainFontSize * 0.44))
    const nextHeight = 256
    const nextWidth = Math.max(160, Math.ceil(totalWidth + paddingX * 2))
    const widthChanged = canvas.width !== nextWidth
    const heightChanged = canvas.height !== nextHeight
    if (widthChanged) canvas.width = nextWidth
    if (heightChanged) canvas.height = nextHeight

    const ctx = canvas.getContext('2d')!
    const baselineY = canvas.height / 2 + mainFontSize * 0.18
    const nameStartX = paddingX + (nameSlotWidth - nameMetrics.width) / 2
    const valueStartX = nameStartX + nameMetrics.width + valueGap
    const r = (color >> 16) & 255
    const g = (color >> 8) & 255
    const b = color & 255

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    ctx.font = `Bold ${mainFontSize}px Arial`
    ctx.fillText(nameMetrics.mainText, nameStartX, baselineY)
    if (nameMetrics.suffixText) {
      ctx.font = `Bold ${nameMetrics.suffixFontSize}px Arial`
      ctx.fillText(
        nameMetrics.suffixText,
        nameStartX + nameMetrics.mainWidth + nameMetrics.gap,
        baselineY + mainFontSize * 0.22,
      )
    }
    if (valueText) {
      ctx.font = `Bold ${mainFontSize}px Arial`
      ctx.fillText(valueText, valueStartX, baselineY)
    }

    return {
      textPixelWidth: totalWidth,
      textPixelHeight: mainFontSize,
      canvasPixelWidth: canvas.width,
      canvasPixelHeight: canvas.height,
      canvasResized: widthChanged || heightChanged,
    }
  }

  drawPlainLabel(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    message: string,
    color: number,
    fontSize: number,
  ) {
    const paddingX = Math.max(20, Math.round(fontSize * 0.42))
    const height = 256
    context.font = `Bold ${fontSize}px Arial`
    const textWidth = Math.ceil(context.measureText(message).width)
    const textHeight = fontSize
    const width = Math.max(64, textWidth + paddingX * 2)
    const widthChanged = canvas.width !== width
    const heightChanged = canvas.height !== height
    if (widthChanged) canvas.width = width
    if (heightChanged) canvas.height = height

    const r = (color >> 16) & 255
    const g = (color >> 8) & 255
    const b = color & 255
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = `rgb(${r}, ${g}, ${b})`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `Bold ${fontSize}px Arial`
    context.fillText(message, canvas.width / 2, canvas.height / 2)
    return {
      textPixelWidth: textWidth,
      textPixelHeight: textHeight,
      canvasPixelWidth: canvas.width,
      canvasPixelHeight: canvas.height,
      canvasResized: widthChanged || heightChanged,
    }
  }

  createAdaptiveLabelSprite(
    message: string,
    color: number,
    fontSize: number,
  ): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    const metrics = this.drawPlainLabel(context, canvas, message, color, fontSize)
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })
    const sprite = new THREE.Sprite(material)
    Object.assign(this.getLabelUserData(sprite), metrics)
    return sprite
  }

  setLabelSpriteScale(sprite: THREE.Sprite, scale: number): void {
    const data = this.getLabelUserData(sprite)
    if (data.layoutMode === 'name') {
      sprite.scale.set(scale, scale, 1)
      return
    }
    this.setAdaptiveSpriteScale(sprite, scale)
  }

  setAdaptiveSpriteScale(sprite: THREE.Sprite, scale: number): void {
    const data = this.getLabelUserData(sprite)
    const width = data.canvasPixelWidth ?? 1
    const height = data.canvasPixelHeight ?? 1
    const aspect = height > 0 ? width / height : 1
    sprite.scale.set(scale * aspect, scale, 1)
  }

  measureNameText(message: string, mainFontSize: number) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    const match = message.match(/^(.+?)(\d+)$/)
    const mainText = match?.[1] ?? message
    const suffixText = match?.[2] ?? ''
    const suffixFontSize = Math.round(mainFontSize * 0.58)
    const gap = suffixText ? Math.max(4, Math.round(mainFontSize * 0.04)) : 0
    context.font = `Bold ${mainFontSize}px Arial`
    const mainWidth = context.measureText(mainText).width
    let suffixWidth = 0
    if (suffixText) {
      context.font = `Bold ${suffixFontSize}px Arial`
      suffixWidth = context.measureText(suffixText).width
    }
    return {
      mainText,
      suffixText,
      mainFontSize,
      suffixFontSize,
      mainWidth,
      suffixWidth,
      width: mainWidth + gap + suffixWidth,
      gap,
    }
  }

  formatMetricNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0
    const rounded = Math.abs(safeValue) < 1e-8 ? 0 : safeValue
    return rounded.toFixed(2)
  }

  private getValueLabelGapPx(isPoint: boolean) {
    return isPoint ? 16 : 14
  }

  getValueLabelOffsetPx(nameLabel: THREE.Sprite | undefined, isPoint: boolean): number {
    if (!nameLabel || !nameLabel.visible) return 0
    const data = this.getLabelUserData(nameLabel)
    return Math.round((data.textPixelWidth ?? 0) + this.getValueLabelGapPx(isPoint))
  }

  getPointTexture(color: number, size: number): THREE.Texture {
    const key = `${color}_${size}`
    const cached = this.pointTextureCache.get(key)
    if (cached) return cached
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    const r = (color >> 16) & 255
    const g = (color >> 8) & 255
    const b = color & 255
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2)
    ctx.fill()
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
    this.pointTextureCache.set(key, texture)
    return texture
  }

  safeUpdateCanvasTexture(
    texture: THREE.CanvasTexture,
    canvasResized: boolean,
  ): THREE.CanvasTexture {
    if (canvasResized) {
      const oldImage = texture.image as HTMLCanvasElement | undefined
      if (!oldImage) {
        texture.needsUpdate = true
        return texture
      }
      const newCanvas = document.createElement('canvas')
      newCanvas.width = oldImage.width
      newCanvas.height = oldImage.height
      const newCtx = newCanvas.getContext('2d')!
      newCtx.drawImage(oldImage, 0, 0)
      texture.dispose()
      const newTexture = new THREE.CanvasTexture(newCanvas)
      newTexture.minFilter = THREE.LinearFilter
      return newTexture
    }
    texture.needsUpdate = true
    return texture
  }
}
