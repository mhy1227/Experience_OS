<!-- 规律库 + 洞察 + 周期复盘(V2 规律发现面板)。自带 store 与展示 computed。 -->
<template>
        <view v-if="store.laws.length" class="law-library">
          <view class="section-head">
            <text class="section-title">规律库</text>
            <text class="section-meta">{{ activeLaws.length }} 条活跃规律</text>
          </view>
          <view v-for="law in activeLaws" :key="law.id" :class="['law-card', law.kind]">
            <view class="law-top">
              <text class="law-badge">{{ law.kind === 'caution' ? '🟥 避坑' : '🟩 成功' }}</text>
              <text class="law-recur">过去90天复发 {{ law.recurrence }} 次 {{ trendArrow(law.trend) }}</text>
              <text class="law-conf">{{ confLabel(law.confidence) }}</text>
            </view>
            <text class="law-theme">{{ law.theme }}</text>
            <text v-if="law.rootCause" class="law-line">根因:{{ law.rootCause }}</text>
            <text v-if="law.suggestion" class="law-line">建议:{{ law.suggestion }}</text>
            <text v-if="law.status === 'reviewed'" class="law-flag">已复盘{{ law.note ? '·' + law.note : '' }}</text>
            <view class="law-actions">
              <button class="law-btn" @click="store.markLaw(law.id, 'reviewed')">标记已复盘</button>
              <button class="law-btn" @click="store.markLaw(law.id, 'reviewed', '已针对它改进')">已针对它改进</button>
              <button class="law-btn" @click="store.markLaw(law.id, 'resolved')">标记已解决</button>
            </view>
          </view>
          <view v-if="resolvedLaws.length" class="law-resolved">
            <text class="law-resolved-title">已解决 {{ resolvedLaws.length }} 条</text>
            <view v-for="law in resolvedLaws" :key="law.id" class="law-resolved-item">
              <text>✓ {{ law.theme }}(复发 {{ law.recurrence }} 次)</text>
              <button class="law-btn" @click="store.markLaw(law.id, 'active')">重新激活</button>
            </view>
          </view>
        </view>

        <view class="section-head">
          <text class="section-title">规律发现</text>
          <text class="section-meta">{{ store.insights.length }} 条洞察</text>
        </view>

        <view v-if="store.insights.length === 0 && !store.isComputingInsights" class="empty">
          <text>点击「扫描我的 90 天」开始分析跨记录规律。</text>
          <text class="empty-hint">至少需要 3 条成功处理的观察。</text>
        </view>

        <view v-if="store.isComputingInsights" class="analyzing-hint">
          <text>正在扫描规律中…</text>
        </view>

        <InsightCard
          v-for="insight in store.insights"
          :key="insight.id"
          :insight="insight"
          :observations="store.observations"
        />

        <view class="review-block">
          <view class="section-head">
            <text class="section-title">周期复盘</text>
            <view class="review-tabs">
              <button :class="['review-tab', { active: reviewPeriod === 'week' }]" @click="reviewPeriod = 'week'">本周</button>
              <button :class="['review-tab', { active: reviewPeriod === 'month' }]" @click="reviewPeriod = 'month'">本月</button>
            </view>
          </view>
          <view class="review-card">
            <text class="review-total">{{ reviewPeriod === 'week' ? '本周' : '本月' }}记录 {{ review.totalCount }} 条</text>
            <view v-if="review.topProblems.length" class="review-row">
              <text class="review-label">高频问题</text>
              <text>{{ review.topProblems.map(p => `${p.label}×${p.count}`).join('、') }}</text>
            </view>
            <view v-if="review.topSuccesses.length" class="review-row">
              <text class="review-label">高频成功</text>
              <text>{{ review.topSuccesses.map(p => `${p.label}×${p.count}`).join('、') }}</text>
            </view>
            <text class="review-suggestion">{{ review.suggestion }}</text>
          </view>
        </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useExperienceStore } from '../../../stores/experience'
import InsightCard from './InsightCard.vue'

const store = useExperienceStore()
const reviewPeriod = ref<'week' | 'month'>('week')
const review = computed(() => store.periodicReview(reviewPeriod.value))
function rankConf(c: string): number { return c === 'high' ? 3 : c === 'medium' ? 2 : 1 }
const activeLaws = computed(() =>
  store.laws
    .filter((l) => l.status !== 'resolved')
    .slice()
    .sort((a, b) => {
      const s = rankConf(b.confidence) * b.recurrence - rankConf(a.confidence) * a.recurrence
      if (s !== 0) return s
      if (a.lastSeenAt !== b.lastSeenAt) return b.lastSeenAt.localeCompare(a.lastSeenAt)
      return a.id.localeCompare(b.id)
    }),
)
const resolvedLaws = computed(() => store.laws.filter((l) => l.status === 'resolved'))
function trendArrow(t: string): string { return t === 'rising' ? '↑' : t === 'falling' ? '↓' : '→' }
function confLabel(c: string): string { return c === 'high' ? '高置信' : c === 'medium' ? '中置信' : '低置信·参考' }
</script>
