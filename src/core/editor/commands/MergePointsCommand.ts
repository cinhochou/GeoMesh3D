import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { Point3 } from '../../geometry/Point3'
import { Line3 } from '../../geometry/Line3'
import { Ray3 } from '../../geometry/Ray3'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { PlanarFace } from '../../geometry/Plane'

type LinearSnapshot<T extends Line3 | Ray3 | StraightLine3> = {
  item: T
  p1: Point3
  p2: Point3
}

type FaceSnapshot = {
  face: PlanarFace
  boundaryPointIds: string[]
  memberPointIds: string[]
  boundaryLineIds: string[]
  supportPointIds: string[]
}

export class MergePointsCommand implements Command {
  private lineSnapshots: Array<LinearSnapshot<Line3>>
  private straightLineSnapshots: Array<LinearSnapshot<StraightLine3>>
  private raySnapshots: Array<LinearSnapshot<Ray3>>
  private faceSnapshots: FaceSnapshot[]
  private removedLines = new Set<string>()
  private removedStraightLines = new Set<string>()
  private removedRays = new Set<string>()
  private removedFaces = new Set<string>()

  constructor(
    private scene: Scene,
    private keepPoint: Point3,
    private removePoint: Point3,
  ) {
    this.lineSnapshots = [...scene.lines.values()]
      .filter((line) => line.p1.id === keepPoint.id || line.p2.id === keepPoint.id || line.p1.id === removePoint.id || line.p2.id === removePoint.id)
      .map((line) => ({ item: line, p1: line.p1, p2: line.p2 }))
    this.straightLineSnapshots = [...scene.straightLines.values()]
      .filter((line) => line.p1.id === keepPoint.id || line.p2.id === keepPoint.id || line.p1.id === removePoint.id || line.p2.id === removePoint.id)
      .map((line) => ({ item: line, p1: line.p1, p2: line.p2 }))
    this.raySnapshots = [...scene.rays.values()]
      .filter((ray) => ray.p1.id === keepPoint.id || ray.p2.id === keepPoint.id || ray.p1.id === removePoint.id || ray.p2.id === removePoint.id)
      .map((ray) => ({ item: ray, p1: ray.p1, p2: ray.p2 }))
    this.faceSnapshots = [...scene.faces.values()]
      .filter((face) => face.includesPoint(keepPoint.id) || face.includesPoint(removePoint.id))
      .map((face) => ({
        face,
        boundaryPointIds: [...face.boundaryPointIds],
        memberPointIds: [...face.memberPointIds],
        boundaryLineIds: [...face.boundaryLineIds],
        supportPointIds: [...face.supportPointIds],
      }))
  }

  private replacePointId(ids: string[]) {
    return [...new Set(ids.map((id) => (id === this.removePoint.id ? this.keepPoint.id : id)))]
  }

  execute() {
    this.lineSnapshots.forEach(({ item }) => {
      if (item.p1.id === this.removePoint.id) item.p1 = this.keepPoint
      if (item.p2.id === this.removePoint.id) item.p2 = this.keepPoint
      if (item.p1.id === item.p2.id) {
        this.scene.lines.delete(item.id)
        this.scene.selection.lines.delete(item.id)
        this.removedLines.add(item.id)
      }
    })

    this.straightLineSnapshots.forEach(({ item }) => {
      if (item.p1.id === this.removePoint.id) item.p1 = this.keepPoint
      if (item.p2.id === this.removePoint.id) item.p2 = this.keepPoint
      if (item.p1.id === item.p2.id) {
        this.scene.straightLines.delete(item.id)
        this.scene.selection.straightLines.delete(item.id)
        this.removedStraightLines.add(item.id)
      }
    })

    this.raySnapshots.forEach(({ item }) => {
      if (item.p1.id === this.removePoint.id) item.p1 = this.keepPoint
      if (item.p2.id === this.removePoint.id) item.p2 = this.keepPoint
      if (item.p1.id === item.p2.id) {
        this.scene.rays.delete(item.id)
        this.scene.selection.rays.delete(item.id)
        this.removedRays.add(item.id)
      }
    })

    this.faceSnapshots.forEach(({ face }) => {
      face.boundaryPointIds = this.replacePointId(face.boundaryPointIds)
      face.memberPointIds = this.replacePointId(face.memberPointIds)
      face.supportPointIds = this.replacePointId(face.supportPointIds)
      face.boundaryLineIds = face.boundaryLineIds.filter((lineId) => this.scene.lines.has(lineId))

      if (face.boundaryPointIds.length < 3 || face.memberPointIds.length < 3) {
        this.scene.removeFace(face.id)
        this.removedFaces.add(face.id)
        return
      }

      face.normalize(this.scene.points)
      if (face.supportPointIds.length < 3) {
        this.scene.removeFace(face.id)
        this.removedFaces.add(face.id)
      }
    })

    this.scene.points.delete(this.removePoint.id)
    this.scene.selection.points.delete(this.removePoint.id)
    this.scene.selection.selectPoint(this.keepPoint.id, true)
  }

  undo() {
    this.scene.addPoint(this.removePoint)

    this.lineSnapshots.forEach(({ item, p1, p2 }) => {
      item.p1 = p1
      item.p2 = p2
      if (this.removedLines.has(item.id)) this.scene.addLine(item)
    })
    this.straightLineSnapshots.forEach(({ item, p1, p2 }) => {
      item.p1 = p1
      item.p2 = p2
      if (this.removedStraightLines.has(item.id)) this.scene.addStraightLine(item)
    })
    this.raySnapshots.forEach(({ item, p1, p2 }) => {
      item.p1 = p1
      item.p2 = p2
      if (this.removedRays.has(item.id)) this.scene.addRay(item)
    })
    this.faceSnapshots.forEach(({ face, boundaryPointIds, memberPointIds, boundaryLineIds, supportPointIds }) => {
      face.boundaryPointIds = [...boundaryPointIds]
      face.memberPointIds = [...memberPointIds]
      face.boundaryLineIds = [...boundaryLineIds]
      face.supportPointIds = [...supportPointIds]
      if (this.removedFaces.has(face.id)) this.scene.addFace(face)
      else face.normalize(this.scene.points)
    })

    this.scene.selection.clear()
    this.scene.selection.selectPoint(this.keepPoint.id, true)
    this.scene.selection.selectPoint(this.removePoint.id, true)
  }
}
