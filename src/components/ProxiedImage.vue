<script setup lang="ts">
import { apiClient } from '@/api/client'
import { getApiConfig } from '@/config/api'
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  src: string
  alt?: string
}>()

const isNgrokUrl = (url: string): boolean => /\.ngrok(?:-free)?\.[^/]+/i.test(url)

interface CacheEntry {
  url: string
  count: number
}

// 模块级共享缓存，避免同一页面内多个组件实例重复请求同一张图片
const blobUrlCache = new Map<string, CacheEntry>()

const getCachedBlobUrl = (key: string): string | undefined => {
  const entry = blobUrlCache.get(key)
  if (entry) {
    entry.count += 1
    return entry.url
  }
  return undefined
}

const setCachedBlobUrl = (key: string, url: string): void => {
  blobUrlCache.set(key, { url, count: 1 })
}

const releaseBlobUrl = (key: string | null): void => {
  if (!key) return
  const entry = blobUrlCache.get(key)
  if (!entry) return
  entry.count -= 1
  if (entry.count <= 0) {
    URL.revokeObjectURL(entry.url)
    blobUrlCache.delete(key)
  }
}

const resolvedSrc = ref('')
let currentCacheKey: string | null = null

const resolveSrc = async () => {
  // 释放旧的缓存引用
  releaseBlobUrl(currentCacheKey)
  currentCacheKey = null

  if (!props.src) {
    resolvedSrc.value = ''
    return
  }
  if (props.src.startsWith('http') || props.src.startsWith('data:')) {
    resolvedSrc.value = props.src
    return
  }

  const baseUrl = getApiConfig().baseUrl
  const fullUrl = baseUrl + props.src

  // 外部绝对地址（非本站 baseUrl）直接透传，不缓存
  if (props.src.startsWith('//')) {
    resolvedSrc.value = fullUrl
    return
  }

  const cached = getCachedBlobUrl(fullUrl)
  if (cached) {
    resolvedSrc.value = cached
    currentCacheKey = fullUrl
    return
  }

  // 统一通过 fetch 获取并缓存为 blob URL，避免 ngrok 警告页拦截，
  // 同时避免同一图片在 v-if 切换时重复发起 HTTP 请求。
  try {
    const accessToken = apiClient.getAccessToken()
    const isNgrok = isNgrokUrl(baseUrl)
    const response = await fetch(fullUrl, {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(isNgrok ? { 'ngrok-skip-browser-warning': 'true' } : {}),
      },
    })
    if (!response.ok) throw new Error(`图片加载失败: ${response.status}`)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    setCachedBlobUrl(fullUrl, blobUrl)
    resolvedSrc.value = blobUrl
    currentCacheKey = fullUrl
  } catch {
    resolvedSrc.value = fullUrl
  }
}

watch(() => props.src, resolveSrc, { immediate: true })

onBeforeUnmount(() => {
  releaseBlobUrl(currentCacheKey)
  currentCacheKey = null
})
</script>

<template>
  <img :src="resolvedSrc" :alt="alt || ''" />
</template>
