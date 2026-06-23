<!-- 「记录」路由:录入模块 + 最新策略卡 + 状态条 -->
<template>
  <view>
    <InputModule />
    <view v-if="store.latestRule" class="hero-rule">
      <view class="section-head">
        <text class="section-title">最新策略卡</text>
        <text class="section-meta">下次可用</text>
      </view>
      <RuleCard
        :rule="store.latestRule"
        :evidence="ruleEvidence(store.latestRule)"
        @feedback="store.setFeedback"
        @evaluate="store.addEvaluation"
        @apply-revision="(id) => store.applyRevisionDraft(id)"
      />
    </view>
    <view class="ops-board">
      <view class="ops-item"><text class="ops-label">分析模式</text><text class="ops-value">结构化引擎 v1</text></view>
      <view class="ops-item"><text class="ops-label">评估次数</text><text class="ops-value">{{ store.evaluationStats.total }}</text></view>
      <view class="ops-item"><text class="ops-label">闭环状态</text><text class="ops-value">{{ store.repeatEvaluatedRuleCount }} 条重复评估</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useExperienceStore } from '../../../stores/experience'
import RuleCard from '../../../components/RuleCard.vue'
import InputModule from './InputModule.vue'
import type { ExperienceRule, Observation } from '../../../types/experience'

const store = useExperienceStore()
function ruleEvidence(rule: ExperienceRule) {
  return rule.evidenceIds.map((id) => store.observations.find((o) => o.id === id)).filter((o): o is Observation => Boolean(o))
}
</script>
