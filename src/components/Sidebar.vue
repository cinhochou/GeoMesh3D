<script setup lang="ts">
defineProps<{
  modeName: string
}>()
</script>

<template>
  <div class="sidebar">
    <h3>状态</h3>
    <p>当前模式：{{ modeName }}</p>

    <hr />

    <p style="opacity: 0.6">
      这里将来显示：<br />
      • 选中点坐标<br />
      • 线长度<br />
      • 约束参数
    </p>
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
