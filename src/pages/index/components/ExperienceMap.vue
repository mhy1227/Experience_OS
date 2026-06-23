<template>
        <view class="section-head">
          <text class="section-title">经验地图</text>
          <text class="section-meta">地点经验视图</text>
        </view>
        <view class="boundary-note">按地点聚合经验，不做导航，也不依赖真实地图。</view>
        <view v-if="store.locationGroups.length === 0" class="empty">带地点的规则会在这里聚合。</view>
        <view v-for="group in store.locationGroups" :key="group.location" class="location-card">
          <view class="location-top">
            <text class="location-name">{{ group.location }}</text>
            <text class="section-meta">{{ group.rules.length }} 条规则 / {{ group.observations.length }} 条证据</text>
          </view>
          <text v-for="rule in group.rules.slice(0, 2)" :key="rule.id" class="location-rule">
            {{ rule.recommendation }}（{{ rule.evidenceIds.length }} 条证据）
          </text>
        </view>
</template>

<script setup lang="ts">
import { useExperienceStore } from '../../../stores/experience'
const store = useExperienceStore()
</script>
