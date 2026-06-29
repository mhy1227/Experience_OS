<template>
  <view v-if="hints.length > 0" class="decision-hint-area">
    <view class="decision-hint-header">
      <text class="decision-hint-title">历史规律提醒</text>
      <text class="decision-hint-meta">{{ hints.length }} 条相关经验</text>
    </view>
    <view v-for="hint in hints" :key="hint.ruleId" class="decision-hint-card">
      <view class="hint-card-head">
        <text class="hint-rule-title">{{ hint.ruleTitle }}</text>
        <button class="hint-dismiss" @click="$emit('dismiss', hint.ruleId)">×</button>
      </view>
      <text class="hint-conclusion">{{ hint.conclusion }}</text>
      <text class="hint-recommendation">建议:{{ hint.recommendation }}</text>
      <view v-if="hint.matchReasons.length > 0" class="hint-reasons">
        <text v-for="reason in hint.matchReasons" :key="reason" class="hint-reason-tag">{{ reason }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { DecisionHint } from '../services/decisionHints'

defineProps<{ hints: DecisionHint[] }>()
defineEmits<{ dismiss: [ruleId: string] }>()
</script>

<style lang="scss" scoped>
.decision-hint-area {
  margin: 12px 0;
  border: 1px solid var(--warn, #f0a500);
  border-radius: 8px;
  overflow: hidden;
}
.decision-hint-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--warn-wash, #fffbe6);
  border-bottom: 1px solid var(--warn, #f0a500);
}
.decision-hint-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft, #b45309);
}
.decision-hint-meta {
  font-size: 11px;
  color: var(--ink-faint, #92400e);
}
.decision-hint-card {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line, #fde68a);
  background: var(--surface, #fffdf0);
  &:last-child { border-bottom: none; }
}
.hint-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}
.hint-rule-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink, #1a1a1a);
  flex: 1;
}
.hint-dismiss {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--ink-faint, #999);
  padding: 0 4px;
  cursor: pointer;
  line-height: 1;
  &:hover { color: var(--ink, #333); }
}
.hint-conclusion {
  font-size: 12px;
  color: var(--ink-soft, #444);
  margin-bottom: 4px;
  display: block;
}
.hint-recommendation {
  font-size: 12px;
  color: var(--ok, #1d6a3e);
  display: block;
  margin-bottom: 6px;
}
.hint-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.hint-reason-tag {
  font-size: 11px;
  color: var(--ink-soft, #92400e);
  background: var(--warn-wash, #fde68a);
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
