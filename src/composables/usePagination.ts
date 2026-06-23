import { computed, ref, watch, type Ref } from 'vue'

// 列表分页:默认每页 8 条,可自定义。
// page/pageSize 变化或源缩短时自动夹紧;切换每页条数回第 1 页。
export function usePagination<T>(source: Ref<T[]>, defaultSize = 8, sizeOptions: number[] = [8, 16, 32]) {
  const pageSize = ref(defaultSize)
  const page = ref(1)
  const totalPages = computed(() => Math.max(1, Math.ceil(source.value.length / pageSize.value)))
  const paged = computed(() => source.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

  watch(pageSize, () => { page.value = 1 })
  watch(totalPages, (n) => { if (page.value > n) page.value = n })

  function reset() { page.value = 1 }

  return { page, pageSize, pageSizeOptions: sizeOptions, totalPages, total: computed(() => source.value.length), paged, reset }
}
