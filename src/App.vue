<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/store/authStore'

const authStore = useAuthStore()
const isInitializing = ref(true)

onMounted(async () => {
  try {
    await authStore.initialize()
  } finally {
    isInitializing.value = false
  }
})
</script>

<template>
  <div v-if="isInitializing" class="loading-container">
    <div class="loading-spinner"></div>
    <div class="loading-text">加载中...</div>
  </div>
  <router-view v-else />
</template>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #111;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(67, 242, 96, 0.25);
  border-top-color: #43f260;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  margin-top: 16px;
  color: #888;
  font-size: 14px;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
