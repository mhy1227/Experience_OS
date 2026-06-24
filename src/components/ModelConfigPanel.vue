<template>
  <view class="model-config-panel">
    <view class="config-section-head">
      <text class="config-title">模型配置</text>
      <text class="config-sub">Key 仅存本地,不上传</text>
    </view>

    <view class="config-field">
      <text class="config-label">Provider</text>
      <select v-model="form.provider" class="config-select" @change="onProviderChange">
        <option value="deepseek">DeepSeek(内置演示默认)</option>
        <option value="openai">OpenAI 兼容端点</option>
      </select>
    </view>

    <view class="config-field">
      <text class="config-label">Model</text>
      <input v-model="form.model" class="config-input" placeholder="deepseek-chat" />
    </view>

    <view class="config-field">
      <text class="config-label">Base URL</text>
      <input v-model="form.baseUrl" class="config-input" placeholder="https://api.deepseek.com" />
    </view>

    <view class="config-field">
      <text class="config-label">API Key</text>
      <input
        v-model="form.apiKey"
        class="config-input"
        :type="showKey ? 'text' : 'password'"
        placeholder="sk-..."
        autocomplete="off"
      />
      <button class="ghost-button small" @click="showKey = !showKey">
        {{ showKey ? '隐藏' : '显示' }}
      </button>
    </view>

    <view class="config-actions">
      <button class="primary-button" @click="save">保存配置</button>
      <button class="ghost-button danger" @click="clear">清除配置</button>
    </view>

    <text v-if="savedMsg" class="config-saved-msg">{{ savedMsg }}</text>

    <view class="config-notice">
      <text class="config-notice-text">演示默认使用内置 DeepSeek Key(由环境变量注入),填写自己的 Key 后生效。Key 只存浏览器 localStorage,不提交、不上云。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ModelConfig } from '../services/modelClient'

const STORAGE_KEY = 'experience-os:model'

const defaultForm = (): ModelConfig => ({
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
})

const PROVIDER_DEFAULTS: Record<string, Partial<ModelConfig>> = {
  deepseek: { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
  openai: { model: 'gpt-4o', baseUrl: 'https://api.openai.com' },
}

const form = ref<ModelConfig>(defaultForm())
const showKey = ref(false)
const savedMsg = ref('')

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModelConfig>
      form.value = {
        provider: parsed.provider ?? 'deepseek',
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? 'deepseek-chat',
        baseUrl: parsed.baseUrl ?? 'https://api.deepseek.com',
      }
    }
  } catch {
    // 忽略解析错误
  }
})

function onProviderChange() {
  const defaults = PROVIDER_DEFAULTS[form.value.provider]
  if (defaults) {
    form.value.model = defaults.model ?? form.value.model
    form.value.baseUrl = defaults.baseUrl ?? form.value.baseUrl
  }
}

function save() {
  // 注意:存储时包含 apiKey(本地存储),但导出 JSON 时须排除 apiKey
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    provider: form.value.provider,
    apiKey: form.value.apiKey,
    model: form.value.model,
    baseUrl: form.value.baseUrl,
  }))
  savedMsg.value = '已保存,下次提交观察时生效'
  setTimeout(() => { savedMsg.value = '' }, 3000)
}

function clear() {
  localStorage.removeItem(STORAGE_KEY)
  form.value = defaultForm()
  savedMsg.value = '已清除,将回退演示默认配置'
  setTimeout(() => { savedMsg.value = '' }, 3000)
}
</script>

<style lang="scss" scoped>
.model-config-panel {
  padding: 16px;
  background: var(--surface-sunken);
  border-radius: var(--r-md);
  border: 1px solid var(--line);
}
.config-section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16px;
}
.config-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}
.config-sub {
  font-size: 11px;
  color: var(--ink-faint);
}
.config-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.config-label {
  font-size: 12px;
  color: var(--ink-soft);
  width: 72px;
  flex-shrink: 0;
}
.config-input,
.config-select {
  flex: 1;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  padding: 6px 10px;
  font-size: 13px;
  background: var(--surface);
  color: var(--ink);
  outline: none;
  &:focus { border-color: var(--brand); }
}
.config-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.config-saved-msg {
  display: block;
  font-size: 12px;
  color: var(--ok);
  margin-top: 8px;
}
.config-notice {
  margin-top: 12px;
  padding: 8px;
  background: var(--brand-wash);
  border-radius: var(--r-sm);
}
.config-notice-text {
  font-size: 11px;
  color: var(--brand-strong);
  line-height: 1.6;
}
.ghost-button.small {
  padding: 4px 8px;
  font-size: 11px;
}
</style>
