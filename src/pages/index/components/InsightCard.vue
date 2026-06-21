<template>
  <view class="insight-card" :class="`confidence-${insight.confidence}`">
    <!-- 头部:维度标签 + 置信度 -->
    <view class="insight-header">
      <text class="dimension-badge">{{ dimensionLabel }}</text>
      <text class="confidence-badge" :class="`conf-${insight.confidence}`">
        {{ confidenceLabel }}
      </text>
      <text class="generated-by">{{ generatedByLabel }}</text>
    </view>

    <!-- 大字百分比 -->
    <view class="insight-hero">
      <text class="percentage-big">{{ percentageDisplay }}</text>
      <text class="percentage-label">的观察与此模式相关</text>
    </view>

    <!-- 标题 -->
    <text class="insight-title">{{ insight.title }}</text>

    <!-- 根因(仅模型增强且有根因时展示) -->
    <view v-if="insight.rootCause && insight.generatedBy === 'model_enhanced'" class="root-cause">
      <text class="root-cause-label">根因归因</text>
      <text class="root-cause-text">{{ insight.rootCause }}</text>
    </view>

    <!-- 摘要 -->
    <text class="insight-summary">{{ insight.summary }}</text>

    <!-- 证据时间线 -->
    <view v-if="evidenceTimeline.length > 0" class="evidence-timeline">
      <text class="timeline-label">证据时间线({{ evidenceTimeline.length }} 条)</text>
      <view class="timeline-dots">
        <view
          v-for="(item, idx) in evidenceTimeline"
          :key="idx"
          class="timeline-item"
        >
          <view class="timeline-dot" />
          <text class="timeline-time">{{ item.time }}</text>
          <text class="timeline-text">{{ item.text }}</text>
        </view>
      </view>
    </view>

    <!-- 决策建议 -->
    <view class="suggestion-box">
      <text class="suggestion-label">决策建议</text>
      <text class="suggestion-text">{{ insight.suggestion }}</text>
    </view>

    <!-- 低置信度免责声明 -->
    <view v-if="insight.confidence === 'low'" class="low-confidence-notice">
      <text class="notice-text">样本量不足,以上为初步观察,建议继续积累数据后再做决策。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Insight, Observation } from '../../../types/experience'

interface Props {
  insight: Insight
  /** 传入 observations 用于渲染证据时间线;可为空 */
  observations?: Observation[]
}

const props = withDefaults(defineProps<Props>(), {
  observations: () => [],
})

const percentageDisplay = computed(() => {
  return `${Math.round(props.insight.percentage * 100)}%`
})

const dimensionLabel = computed(() => {
  const map: Record<string, string> = {
    category: '分类模式',
    tag: '标签模式',
    sentiment: '情绪模式',
    rootCause: '根因模式',
  }
  return map[props.insight.dimension] ?? props.insight.dimension
})

const confidenceLabel = computed(() => {
  const map: Record<string, string> = {
    high: '高置信',
    medium: '中置信',
    low: '低置信·仅供参考',
  }
  return map[props.insight.confidence] ?? props.insight.confidence
})

const generatedByLabel = computed(() => {
  return props.insight.generatedBy === 'model_enhanced' ? 'AI 归因增强' : '统计归因'
})

interface TimelineItem {
  time: string
  text: string
}

const evidenceTimeline = computed((): TimelineItem[] => {
  if (!props.observations || props.observations.length === 0) return []

  const evidenceSet = new Set(props.insight.evidenceObservationIds)
  return props.observations
    .filter((o) => evidenceSet.has(o.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 5) // 最多展示 5 条证据
    .map((o) => ({
      time: formatTime(o.createdAt),
      text: o.text.slice(0, 40) + (o.text.length > 40 ? '…' : ''),
    }))
})

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style lang="scss" scoped>
.insight-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  border-left: 4px solid #94a3b8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);

  &.confidence-high {
    border-left-color: #10b981;
  }

  &.confidence-medium {
    border-left-color: #f59e0b;
  }

  &.confidence-low {
    border-left-color: #94a3b8;
    opacity: 0.85;
  }
}

.insight-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.dimension-badge {
  font-size: 11px;
  background: #f1f5f9;
  color: #64748b;
  padding: 2px 8px;
  border-radius: 20px;
}

.confidence-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 20px;

  &.conf-high { background: #d1fae5; color: #065f46; }
  &.conf-medium { background: #fef3c7; color: #92400e; }
  &.conf-low { background: #f1f5f9; color: #64748b; }
}

.generated-by {
  font-size: 11px;
  color: #94a3b8;
  margin-left: auto;
}

.insight-hero {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.percentage-big {
  font-size: 48px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1;
}

.percentage-label {
  font-size: 14px;
  color: #64748b;
}

.insight-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  display: block;
  margin-bottom: 8px;
}

.root-cause {
  background: #f0fdf4;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.root-cause-label {
  font-size: 11px;
  color: #16a34a;
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.root-cause-text {
  font-size: 14px;
  color: #166534;
}

.insight-summary {
  font-size: 13px;
  color: #475569;
  display: block;
  line-height: 1.6;
  margin-bottom: 12px;
}

.evidence-timeline {
  margin-bottom: 12px;
}

.timeline-label {
  font-size: 11px;
  color: #94a3b8;
  display: block;
  margin-bottom: 8px;
}

.timeline-dots {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.timeline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #cbd5e1;
  margin-top: 5px;
  flex-shrink: 0;
}

.timeline-time {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
  width: 36px;
}

.timeline-text {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.suggestion-box {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.suggestion-label {
  font-size: 11px;
  color: #94a3b8;
  display: block;
  margin-bottom: 4px;
}

.suggestion-text {
  font-size: 14px;
  color: #334155;
  font-weight: 500;
  line-height: 1.5;
}

.low-confidence-notice {
  background: #f8fafc;
  border-radius: 6px;
  padding: 8px 10px;
  border: 1px dashed #e2e8f0;
}

.notice-text {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.5;
}
</style>
