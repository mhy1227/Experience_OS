// hash 模式路由(零部署风险,无需 Vercel SPA rewrite)。
// 每个 tab → 一个路由,面板组件懒加载(按路由代码分割)。
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

export const navRoutes: Array<{ path: string; label: string }> = [
  { path: '/', label: '记录' },
  { path: '/experiences', label: '经验' },
  { path: '/rules', label: '规则库' },
  { path: '/map', label: '地图' },
  { path: '/timeline', label: '时间轴' },
  { path: '/insights', label: '规律发现' },
  { path: '/advanced', label: '高级' },
]

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'compose', component: () => import('../pages/index/components/ComposeView.vue') },
  { path: '/experiences', name: 'experiences', component: () => import('../pages/index/components/ExperienceList.vue') },
  { path: '/rules', name: 'rules', component: () => import('../pages/index/components/RuleLibrary.vue') },
  { path: '/map', name: 'map', component: () => import('../pages/index/components/ExperienceMap.vue') },
  { path: '/timeline', name: 'timeline', component: () => import('../pages/index/components/Timeline.vue') },
  { path: '/insights', name: 'insights', component: () => import('../pages/index/components/LawLibrary.vue') },
  { path: '/advanced', name: 'advanced', component: () => import('../pages/index/components/EvaluationWorkbench.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
