<template>
        <view class="section-head">
          <text class="section-title">经验列表</text>
          <text class="section-meta">{{ store.observations.length }} 条观察</text>
        </view>
        <view v-if="store.observations.length === 0" class="empty">还没有观察。先写一句具体经验。</view>
        <view v-for="item in store.observations" :key="item.id" class="record-item">
          <view class="record-top">
            <text class="badge">{{ item.category }}</text>
            <text class="time">{{ formatTime(item.createdAt) }}</text>
          </view>
          <text class="record-text">{{ item.text }}</text>
          <text class="record-summary">{{ item.summary }}</text>
          <view class="tag-row">
            <text v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</text>
          </view>
        </view>
</template>

<script setup lang="ts">
import { useExperienceStore } from '../../../stores/experience'
import { formatTime } from '../../../services/ruleLabels'
const store = useExperienceStore()
</script>
