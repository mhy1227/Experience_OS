<!-- 用户标签编辑器:展示已有标签 chip(可删)+ 输入新增(回车/失焦)+ 自动补全(datalist)。 -->
<template>
  <view class="tag-editor">
    <text class="tag-editor-label">标签</text>
    <text v-for="t in modelValue" :key="t" class="tag-chip">
      #{{ t }}<button class="tag-x" type="button" @click="remove(t)">×</button>
    </text>
    <input
      v-model="draft"
      class="tag-input"
      :list="listId"
      placeholder="+ 加标签"
      @keydown.enter.prevent="add"
      @blur="add"
    />
    <datalist :id="listId">
      <option v-for="s in suggestions" :key="s" :value="s" />
    </datalist>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { normalizeTagInput } from '../services/tagUtils'

const props = defineProps<{ modelValue: string[]; suggestions: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const draft = ref('')
const listId = `tag-sug-${Math.floor(Math.random() * 1e9)}`

function add() {
  const t = normalizeTagInput(draft.value)
  draft.value = ''
  if (!t || props.modelValue.includes(t)) return
  emit('update:modelValue', [...props.modelValue, t])
}
function remove(t: string) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== t))
}
</script>

<style scoped>
.tag-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
}
.tag-editor-label {
  font-size: 12px;
  color: var(--ink-faint);
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px 2px 9px;
  border-radius: 999px;
  background: var(--brand-wash);
  color: var(--brand-strong);
  font-size: 12px;
}
.tag-x {
  border: 0;
  background: transparent;
  color: var(--brand-strong);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  opacity: 0.7;
}
.tag-x:hover { opacity: 1; }
.tag-input {
  min-width: 80px;
  flex: 1;
  min-height: 28px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-sunken);
  padding: 0 8px;
  font-size: 12px;
  color: var(--ink);
}
</style>
