<!-- 应用 layout 壳:头部统计 + 设置 + 信任条 + 路由导航 + <router-view> + toast。
     各功能页是路由组件(见 src/router)。 -->
<template>
  <view class="screen">
    <view class="app-shell">
      <view class="topbar">
        <view>
          <text class="eyebrow">Experience OS</text>
          <text class="title">个人经验规则台</text>
        </view>
        <view class="stat-strip">
          <view>
            <text class="stat-value">{{ store.observations.length }}</text>
            <text class="stat-label">观察</text>
          </view>
          <view>
            <text class="stat-value">{{ store.stableRuleCount }}</text>
            <text class="stat-label">稳定规则</text>
          </view>
          <view>
            <text class="stat-value">{{ store.watchingRuleCount }}</text>
            <text class="stat-label">待观察</text>
          </view>
          <view>
            <text class="stat-value">{{ store.needsFixRuleCount }}</text>
            <text class="stat-label">待修正</text>
          </view>
          <view>
            <text class="stat-value">{{ store.conflictedRuleCount }}</text>
            <text class="stat-label">冲突规则</text>
          </view>
        </view>
        <button class="ghost-button small" @click="showSettings = !showSettings">
          {{ showSettings ? '关闭设置' : '⚙ 设置' }}
        </button>
      </view>

      <!-- 模型设置面板(可折叠) -->
      <view v-if="showSettings" class="settings-panel">
        <ModelConfigPanel />
      </view>

      <!-- Trust Banner:本地优先可见化 -->
      <div class="trust-banner">
        <span class="trust-icon">🔒</span>
        <span class="trust-text">数据只在本机 — 零云端上传，随时可导出或清空</span>
      </div>

      <!-- 路由导航:每个功能页一个 URL,可前进/后退/分享/刷新保持 -->
      <view class="tabs">
        <router-link
          v-for="r in navRoutes"
          :key="r.path"
          :to="r.path"
          class="tab"
          exact-active-class="active"
        >
          {{ r.label }}
        </router-link>
      </view>

      <view class="panel">
        <router-view />
      </view>
    </view>
    <!-- Toast 提示 -->
    <div v-if="toastMessage" class="toast-notification">{{ toastMessage }}</div>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useExperienceStore } from '../../stores/experience'
import ModelConfigPanel from '../../components/ModelConfigPanel.vue'
import { navRoutes } from '../../router'
import { useToast } from '../../composables/useToast'

const store = useExperienceStore()
const showSettings = ref(false)
const { message: toastMessage } = useToast()
</script>

<style lang="scss" src="./styles.scss"></style>
