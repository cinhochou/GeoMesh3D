// 基于 Cache Storage 的持久化图片缓存：
// 页面刷新后仍可复用，避免头像/缩略图等图片资源每次重新下载。
// 仅在安全上下文（https / localhost）可用，否则自动退化为直接请求。
const IMAGE_CACHE_NAME = 'geomesh-image-cache-v1'
const IMAGE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
// 条目超过该时长后：先立即返回旧图（零等待），同时在后台静默刷新
const IMAGE_REVALIDATE_AFTER_MS = 10 * 60 * 1000
const CACHED_AT_HEADER = 'x-geomesh-cached-at'

const getCachesApi = (): CacheStorage | null => {
  if (typeof self === 'undefined' || !('caches' in self)) return null
  try {
    return self.caches
  } catch {
    return null
  }
}

const openImageCache = async (): Promise<Cache | null> => {
  const cachesApi = getCachesApi()
  if (!cachesApi) return null
  try {
    return await cachesApi.open(IMAGE_CACHE_NAME)
  } catch {
    return null
  }
}

const isCacheableBlob = (blob: Blob): boolean =>
  blob.size > 0 && blob.type.startsWith('image/')

const putInCache = async (cache: Cache, url: string, blob: Blob): Promise<void> => {
  try {
    await cache.put(
      url,
      new Response(blob, {
        headers: {
          'content-type': blob.type,
          [CACHED_AT_HEADER]: String(Date.now()),
        },
      }),
    )
  } catch {
    // 缓存写入失败（如配额不足）不影响图片展示
  }
}

const revalidate = async (cache: Cache, url: string, init: RequestInit): Promise<void> => {
  try {
    const response = await fetch(url, init)
    if (!response.ok) return
    const blob = await response.blob()
    if (isCacheableBlob(blob)) await putInCache(cache, url, blob)
  } catch {
    // 后台更新失败时保留旧缓存，下次再试
  }
}

interface CacheHit {
  blob: Blob
  age: number
}

const readCacheEntry = async (cache: Cache, url: string): Promise<CacheHit | null> => {
  try {
    const cached = await cache.match(url)
    if (!cached) return null
    const cachedAt = Number(cached.headers.get(CACHED_AT_HEADER) || '')
    const blob = await cached.blob()
    if (!isCacheableBlob(blob)) {
      // 缓存了非图片内容（如 ngrok 警告页），直接清除
      await cache.delete(url)
      return null
    }
    const age = Number.isFinite(cachedAt) ? Date.now() - cachedAt : Number.POSITIVE_INFINITY
    if (age >= IMAGE_CACHE_MAX_AGE_MS) {
      await cache.delete(url)
      return null
    }
    return { blob, age }
  } catch {
    return null
  }
}

/**
 * 加载图片并持久化缓存：
 * 优先读缓存（命中即零网络请求）；条目较旧时后台静默刷新；未命中时走网络并写入缓存。
 */
export const loadImageBlob = async (url: string, init: RequestInit): Promise<Blob> => {
  const cache = await openImageCache()
  if (cache) {
    const hit = await readCacheEntry(cache, url)
    if (hit) {
      if (hit.age > IMAGE_REVALIDATE_AFTER_MS) void revalidate(cache, url, init)
      return hit.blob
    }
  }

  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`图片加载失败: ${response.status}`)
  const blob = await response.blob()
  if (cache && isCacheableBlob(blob)) await putInCache(cache, url, blob)
  return blob
}

/** 图片更新后（如重新上传头像）删除对应缓存，使下次加载立即拿到新图 */
export const invalidateImageCache = async (url: string): Promise<void> => {
  const cache = await openImageCache()
  if (!cache) return
  try {
    await cache.delete(url)
  } catch {
    // 忽略失效失败，旧的缓存会随 TTL 过期
  }
}

/** 与 ProxiedImage 的地址解析规则保持一致：相对路径拼接 baseUrl，绝对地址原样返回 */
export const resolveImageUrl = (src: string, baseUrl: string): string =>
  src.startsWith('http') || src.startsWith('data:') || src.startsWith('//')
    ? src
    : baseUrl + src

/**
 * 为缩略图 URL 追加缓存版本参数。
 * 项目缩略图按 projectId 复用固定文件名（如 /thumbnails/{projectId}.jpg），URL 恒定不变，
 * 导致浏览器 / ProxiedImage 的持久化缓存以该稳定 URL 为 key，即使后端已覆盖新图、页面仍显示旧图。
 * 传入"内容版本"（项目 updatedAt，每次保存缩略图都会变化），使 URL 随内容变化 → 突破所有缓存层，
 * 并触发 Vue 对 :src 的响应式重渲染，实现"保存后立即可见新缩略图"。
 */
export const withThumbnailVersion = (url: string, version?: string | null): string => {
  if (!url || !version) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
}
