// 会话级 blob URL 共享缓存（模块作用域，跨所有 ProxiedImage 实例共享）。
//
// 【为何必须放在模块作用域】
// 若写在组件的 <script setup> 内，该变量属于 setup() 函数体，组件每实例化一次就重建一次：
// 每个实例一份独立 Map，实例卸载后随之回收 → 缓存永不命中。
// 协作面板反复开关（roomDetail 置空后重建）会让全部成员头像每次重新下载。
//
// 【作用】
// 1. blob URL 复用：同一张图在整个会话中只 fetch 一次并 createObjectURL 一次，
//    后续任何实例挂载都同步命中，首帧即有图，无空白闪烁、无网络请求。
// 2. in-flight 去重：同一 URL 并发请求时共享同一个 Promise，
//    避免多个实例同时挂载（如创建者区块与成员卡片指向同一头像）对同一图片并发多次 fetch。
// 3. URL 变更后旧 blob URL 及时回收，避免内存泄漏。

const BLOB_URL_CACHE_MAX = 300

/** url -> blob URL。Map 的插入顺序即 LRU 顺序，命中后删除重插以刷新顺序 */
const blobUrlCache = new Map<string, string>()

/** url -> 进行中的加载 Promise。用于并发去重，加载结束（无论成败）后移除 */
const pendingLoads = new Map<string, Promise<string>>()

export const getCachedBlobUrl = (url: string): string | undefined => {
  const cached = blobUrlCache.get(url)
  if (cached) {
    // LRU touch：删除后重新插入，刷新使用顺序
    blobUrlCache.delete(url)
    blobUrlCache.set(url, cached)
  }
  return cached
}

export const setCachedBlobUrl = (url: string, blobUrl: string): void => {
  // 同一 url 重复写入（如并发去重失效的兜底）时，先释放旧的 blob URL
  const previous = blobUrlCache.get(url)
  if (previous && previous !== blobUrl) URL.revokeObjectURL(previous)

  blobUrlCache.delete(url)
  blobUrlCache.set(url, blobUrl)

  while (blobUrlCache.size > BLOB_URL_CACHE_MAX) {
    const oldestKey = blobUrlCache.keys().next().value
    if (oldestKey === undefined) break
    const oldestUrl = blobUrlCache.get(oldestKey)
    blobUrlCache.delete(oldestKey)
    // 正在显示中的图片会被 LRU touch 保持新鲜，被淘汰的基本是已不在页面的
    if (oldestUrl) URL.revokeObjectURL(oldestUrl)
  }
}

/**
 * 是否有正在进行中的加载。用于在渲染层提前知道「这张图马上就有」，
 * 避免调用方各自实现去重逻辑导致遗漏。
 */
export const hasPendingLoad = (url: string): boolean => pendingLoads.has(url)

/**
 * 以 in-flight 去重的方式加载图片并返回 blob URL。
 *
 * 命中会话缓存时同步返回（Promise 已 resolve，调用方 await 后立即拿到）。
 * 同一 url 的并发调用共享同一个 Promise，网络请求只发生一次。
 *
 * @param url 图片的完整地址（已拼接 baseUrl）
 * @param loader 实际的加载逻辑，仅在缓存未命中且无并发时执行
 */
export const loadBlobUrlOnce = (url: string, loader: () => Promise<string>): Promise<string> => {
  const cached = getCachedBlobUrl(url)
  if (cached) return Promise.resolve(cached)

  const pending = pendingLoads.get(url)
  if (pending) return pending

  const task = loader()
    .then((blobUrl) => {
      // 只有当当前缓存仍不是这个 blobUrl 时才写入，
      // 避免覆盖期间其他路径写入的更新值
      if (blobUrlCache.get(url) !== blobUrl) setCachedBlobUrl(url, blobUrl)
      return blobUrl
    })
    .finally(() => {
      pendingLoads.delete(url)
    })

  pendingLoads.set(url, task)
  return task
}