<script setup lang="ts">
import { apiClient } from '@/api/client'
import { getApiConfig } from '@/config/api'
import { loadImageBlob } from '@/utils/imageCache'
import { getCachedBlobUrl, loadBlobUrlOnce } from '@/utils/blobUrlCache'
import { ref, watch } from 'vue'

const props = defineProps<{
  src: string
  alt?: string
}>()

const isNgrokUrl = (url: string): boolean => /\.ngrok(?:-free)?\.[^/]+/i.test(url)

// 会话级 blob URL 缓存已抽到 src/utils/blobUrlCache.ts（模块作用域）。
// 关键点：缓存必须放在模块作用域。若写在此处的 <script setup> 内，
// 它会随每个组件实例各自新建一份（setup() 每实例执行一次），
// 协作面板反复开关时所有头像都会重新下载。
const resolvedSrc = ref('')

const resolveSrc = async () => {
  const src = props.src
  if (!src) {
    resolvedSrc.value = ''
    return
  }
  if (src.startsWith('http') || src.startsWith('data:')) {
    resolvedSrc.value = src
    return
  }

  const baseUrl = getApiConfig().baseUrl

  // 外部绝对地址（非本站 baseUrl）直接透传，不缓存
  if (src.startsWith('//')) {
    resolvedSrc.value = baseUrl + src
    return
  }

  const fullUrl = baseUrl + src

  // 命中会话级缓存：resolveSrc 的同步段直接返回，首次渲染即有图
  const cached = getCachedBlobUrl(fullUrl)
  if (cached) {
    resolvedSrc.value = cached
    return
  }

  // 统一通过 fetch 获取并缓存为 blob URL，避免 ngrok 警告页拦截，
  // 同时避免同一图片在 v-if 切换 / 多处同时出现时重复发起 HTTP 请求。
  // loadBlobUrlOnce 内置会话缓存命中 + in-flight 去重：同一 url 并发只发一次请求。
  // loadImageBlob 内置 Cache Storage 持久化缓存：页面刷新后命中缓存即零网络请求。
  try {
    const accessToken = apiClient.getAccessToken()
    const isNgrok = isNgrokUrl(baseUrl)
    const blobUrl = await loadBlobUrlOnce(fullUrl, async () => {
      const blob = await loadImageBlob(fullUrl, {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(isNgrok ? { 'ngrok-skip-browser-warning': 'true' } : {}),
        },
      })
      return URL.createObjectURL(blob)
    })
    // 组件可能已在等待期间卸载，或 props.src 已切换到别的图片
    if (props.src === src) resolvedSrc.value = blobUrl
  } catch {
    // 仅当 props.src 仍是触发本次加载的那个值时才回退，避免覆盖更新后的图片
    if (props.src === src) resolvedSrc.value = fullUrl
  }
}

watch(() => props.src, resolveSrc, { immediate: true })
</script>

<template>
  <img :src="resolvedSrc" :alt="alt || ''" />
</template>