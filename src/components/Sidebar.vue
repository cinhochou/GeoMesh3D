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
</script>

<template>
  <div class="sidebar">
    <h3>状态</h3>
    <p>模式：{{ modeName }}</p>

    <h4>选中点</h4>
    <div v-if="selectedPoints.length === 0">无</div>

    <div v-for="p in selectedPoints" :key="p!.id" class="point-info">
      <div>ID: {{ p!.id }}</div>
      <div>
        x: {{ p!.position.x.toFixed(2) }}, y: {{ p!.position.y.toFixed(2) }}, z:
        {{ p!.position.z.toFixed(2) }}
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
}
h3 {
  margin-top: 0;
}
hr {
  border: none;
  border-top: 1px solid #333;
  margin: 12px 0;
}
</style>
