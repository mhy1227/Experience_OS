// 全局轻量 toast(模块级单例)。路由化后各路由组件不再能向 layout emit,
// 改用此 composable:任意组件调 useToast().show(msg),layout 读 toast.message 渲染。
import { ref } from 'vue'

const message = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

export function useToast() {
  function show(msg: string, durationMs = 3000) {
    message.value = msg
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      message.value = ''
    }, durationMs)
  }
  return { message, show }
}
