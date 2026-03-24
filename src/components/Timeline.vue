<script setup lang="ts"></script>

<template>
  <div class="timeline">
    <span>Timeline（动画系统预留）</span>
  </div>
</template>

<style scoped>
.timeline {
  height: 60px;
  background: #1e1e1e;
  border-top: 1px solid #333;
  display: flex;
  align-items: center;
  padding-left: 12px;
  color: #888;
}

@media (max-width: 1024px) and (orientation: landscape) {
  .timeline {
    height: 40px;
    font-size: 12px;
    padding-left: 8px;
  }
}
</style>
