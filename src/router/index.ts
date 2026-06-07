import { defineComponent, h } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import EditorView from '@/views/EditorView.vue'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import ProfileView from '@/views/ProfileView.vue'
import ProjectListView from '@/views/ProjectListView.vue'
import { useAuthStore } from '@/store/authStore'

const routes = [
  {
    path: '/',
    name: 'editor',
    component: EditorView,
    meta: { title: '编辑器' },
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { guestOnly: true, title: '登录' },
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: { guestOnly: true, title: '注册' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfileView,
    meta: { requiresAuth: true, title: '个人主页' },
  },
  {
    path: '/projects',
    name: 'projects',
    component: ProjectListView,
    meta: { requiresAuth: true, title: '项目列表' },
  },
  {
    path: '/logout',
    name: 'logout',
    component: defineComponent(() => () => h('div')),
    beforeEnter: async () => {
      const authStore = useAuthStore()
      await authStore.logout()
      return { name: 'login' }
    },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

let authInitialized = false

const isSafeRedirectPath = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  if (!authInitialized) {
    await authStore.initialize()
    authInitialized = true
  }

  const isAuthPage = ['login', 'register'].includes(String(to.name ?? ''))
  if (!isAuthPage && !authStore.isAuthenticated && authStore.hasSwitchSnapshot) {
    try {
      await authStore.cancelSwitchUser()
    } catch {
      authStore.clearSwitchSnapshot()
    }
  }

  const guestOnly = to.matched.some((record) => record.meta.guestOnly)
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)

  if (guestOnly && authStore.isAuthenticated) {
    const redirect = isSafeRedirectPath(to.query.redirect) ? to.query.redirect : '/'
    next(redirect)
  } else if (requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

router.afterEach((to) => {
  // 编辑器页面的标题由 EditorView 内部 watch(currentProjectName) 动态管理
  if (to.name === 'editor') return
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} - GeoMesh3D` : 'GeoMesh3D'
})

export default router
