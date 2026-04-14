import { defineComponent, h } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import EditorView from '@/views/EditorView.vue'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import { useAuthStore } from '@/store/authStore'

const routes = [
  {
    path: '/',
    name: 'editor',
    component: EditorView,
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: { guestOnly: true },
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

  if (guestOnly && authStore.isAuthenticated) {
    const redirect = isSafeRedirectPath(to.query.redirect) ? to.query.redirect : '/'
    next(redirect)
  } else {
    next()
  }
})

export default router
