<template>
        <view class="section-head">
          <text class="section-title">时间轴</text>
          <text class="section-meta">经验演化</text>
        </view>
        <view class="boundary-note">展示观察如何变成规则，不是日记或流水账。</view>
        <view v-if="store.timelineItems.length === 0" class="empty">提交观察后会形成时间线。</view>
        <view v-for="item in store.timelineItems" :key="item.observation.id" class="timeline-item">
          <view class="timeline-dot" />
          <view class="timeline-content">
            <text class="time">{{ formatTime(item.observation.createdAt) }}</text>
            <text class="record-text">{{ item.observation.text }}</text>
            <text v-if="item.rule" class="record-summary">形成规则：{{ item.rule.title }}</text>
            <text v-if="item.rule" class="record-summary">规则证据数：{{ item.rule.evidenceIds.length }}</text>
            <text v-if="item.rule" class="record-summary">当前反馈：{{ feedbackLabel(item.rule.feedback) }}</text>
          </view>
        </view>
</template>

<script setup lang="ts">
import { useExperienceStore } from '../../../stores/experience'
import { formatTime, feedbackLabel } from '../../../services/ruleLabels'
const store = useExperienceStore()
</script>
