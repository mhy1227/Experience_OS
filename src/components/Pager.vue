<!-- 通用分页条:上一页/下一页 + 页码 + 每页条数下拉。配合 usePagination 使用。 -->
<template>
  <view v-if="total > 0" class="pager">
    <button class="pager-btn" :disabled="page === 1" @click="emit('update:page', page - 1)">上一页</button>
    <text class="pager-info">{{ page }} / {{ totalPages }}（共 {{ total }} 条）</text>
    <button class="pager-btn" :disabled="page === totalPages" @click="emit('update:page', page + 1)">下一页</button>
    <select
      class="pager-size"
      :value="pageSize"
      @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
    >
      <option v-for="n in pageSizeOptions" :key="n" :value="n">每页 {{ n }}</option>
    </select>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  page: number
  pageSize: number
  totalPages: number
  total: number
  pageSizeOptions: number[]
}>()
const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
}>()
</script>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 12px 0 4px;
  flex-wrap: wrap;
}
.pager-btn {
  padding: 6px 14px;
  background: var(--surface, #fff);
  border: 1px solid var(--line, #c8d2cb);
  border-radius: 8px;
  color: var(--ink, #3a4a42);
  font-size: 13px;
  cursor: pointer;
}
.pager-btn:disabled { opacity: 0.4; cursor: default; }
.pager-info { font-size: 13px; color: var(--ink-soft, #5a6b62); }
.pager-size {
  padding: 6px 8px;
  border: 1px solid var(--line, #c8d2cb);
  border-radius: 8px;
  background: var(--surface, #fff);
  color: var(--ink, #3a4a42);
  font-size: 13px;
  cursor: pointer;
}
</style>
