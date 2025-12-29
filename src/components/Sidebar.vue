<script setup lang="ts">
import { computed } from 'vue'
import { Scene } from '../core/scene/Scene'
const props = defineProps<{
  scene: Scene
  modeName: string
}>()
const selectedPoints = computed(() => {
  return [...props.scene.selection.points].map((id) => props.scene.points.get(id))
})
const selectedLines = computed(() => {
  return [...props.scene.selection.lines].map((id) => props.scene.lines.get(id))
})
const pointsInScene = computed(() => {
  return [...props.scene.points.values()]
})
const linesInScene = computed(() => {
  return [...props.scene.lines.values()]
})
</script>

<template>
  <div class="sidebar">
    <p>当前操作模式：{{ modeName }}</p>
    <div class="divider"></div>
    <h3>选中</h3>
    <div class="box">
      <div v-if="selectedPoints.length === 0 && selectedLines.length === 0">无</div>

      <div v-for="p in selectedPoints" :key="p!.id" class="selectedPoint-info">
        <div>ID: {{ p!.id }}</div>
        <div>
          x: {{ p!.position.x.toFixed(2) }}, y: {{ p!.position.y.toFixed(2) }}, z:
          {{ p!.position.z.toFixed(2) }}
        </div>
      </div>

      <div v-for="l in selectedLines" :key="l!.id" class="selectedLine-info">
        <div>ID: {{ l!.id }}</div>
        <div>
          <div>
            {{ l!.p1.id }}(x,y,z): {{ l!.p1.position.x.toFixed(2) }},
            {{ l!.p1.position.y.toFixed(2) }},
            {{ l!.p1.position.z.toFixed(2) }}
          </div>
          <div>
            {{ l!.p2.id }}(x,y,z): {{ l!.p2.position.x.toFixed(2) }},
            {{ l!.p2.position.y.toFixed(2) }},
            {{ l!.p2.position.z.toFixed(2) }}
          </div>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <h3>内容</h3>
    <div class="box">
      <div v-if="pointsInScene.length === 0 && linesInScene.length === 0">无</div>
      <div v-for="p in pointsInScene" :key="p!.id" class="point-info">
        <div>ID: {{ p!.id }}</div>
        <div>
          x: {{ p!.position.x.toFixed(2) }}, y: {{ p!.position.y.toFixed(2) }}, z:
          {{ p!.position.z.toFixed(2) }}
        </div>
      </div>
      <div v-for="l in linesInScene" :key="l!.id" class="line-info">
        <div>ID: {{ l!.id }}</div>
        <div>
          <div>
            {{ l!.p1.id }}(x,y,z): {{ l!.p1.position.x.toFixed(2) }},
            {{ l!.p1.position.y.toFixed(2) }},
            {{ l!.p1.position.z.toFixed(2) }}
          </div>
          <div>
            {{ l!.p2.id }}(x,y,z): {{ l!.p2.position.x.toFixed(2) }},
            {{ l!.p2.position.y.toFixed(2) }},
            {{ l!.p2.position.z.toFixed(2) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 220px;
  background: #1a1a1a;
  color: #ddd;
  padding: 12px;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止内部滚动影响 */
}
.sidebar > p {
  flex-shrink: 0;
}
h3 {
  margin-top: 0;
  flex-shrink: 0;
}
hr {
  border: none;
  border-top: 1px solid #333;
  margin: 12px 0;
}
.selectedPoint-info,
.selectedLine-info,
.point-info,
.line-info {
  background-color: rgba(44, 90, 52, 0.4); /* 使用半透明绿色 */
  border-left: 3px solid #43f260; /* 增加一个亮色左边框提升质感 */
  margin-bottom: 6px;
  padding: 8px;
  font-size: 13px;
}
.divider {
  width: 220px;
  height: 1px;
  background: #444;
  margin-top: 5px;
  margin-bottom: 5px;
  flex-shrink: 0;
}
.box {
  flex: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 垂直滚动 */
  overflow-x: hidden;
  margin-bottom: 2px; /* 底部边距 */
}
.box::-webkit-scrollbar {
  width: 5px;
}
.box::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 10px;
}
.box::-webkit-scrollbar-track {
  background: transparent;
}
</style>
