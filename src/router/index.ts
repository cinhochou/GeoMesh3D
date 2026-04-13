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
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

let authInitialized = false

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  if (!authInitialized) {
    await authStore.initialize()
    authInitialized = true
  }

  const guestOnly = to.matched.some((record) => record.meta.guestOnly)

  if (guestOnly && authStore.isAuthenticated) {
    next({ name: 'editor' })
  } else {
    next()
  }
})

export default router
