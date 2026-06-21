import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

seedDemoModelConfig()

createApp(App).use(createPinia()).mount('#app')

// 演示用:若用户尚未配置模型,则从构建期环境变量注入一份默认模型配置。
// Key 仅来自 gitignored 的 .env.local,不写死、不提交;用户在 UI 配置后不会被覆盖。
function seedDemoModelConfig() {
  const STORAGE_KEY = 'experience-os:model'
  if (localStorage.getItem(STORAGE_KEY)) return

  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
  if (!apiKey) return

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      provider: 'deepseek',
      apiKey,
      model: import.meta.env.VITE_DEEPSEEK_MODEL ?? 'deepseek-chat',
      baseUrl: import.meta.env.VITE_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    }),
  )
}
