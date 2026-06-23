<!-- 「规则库」路由:搜索/分类筛选 + 规则卡列表 -->
<template>
  <view>
    <view class="section-head">
      <text class="section-title">规则库</text>
      <text class="section-meta">{{ filteredRules.length }} / {{ store.rules.length }} 条规则</text>
    </view>
    <view class="filter-bar">
      <input v-model="ruleQuery" class="search-input" placeholder="搜索规则、地点、行动建议" />
      <button class="ghost-button" @click="resetFilters">重置</button>
    </view>
    <details v-if="categoryTiles.length > 0" class="category-fold" :open="selectedCategory !== '全部'">
      <summary class="category-summary">
        {{ selectedCategory === '全部' ? `按分类筛选（${categoryTiles.length} 类）` : `分类：${selectedCategory}` }}
      </summary>
      <view class="category-grid">
        <button
          v-for="{ category, count } in categoryTiles"
          :key="category"
          class="category-tile"
          :class="{ selected: selectedCategory === category }"
          @click="toggleCategory(category)"
        >
          <text class="category-name">{{ category }}</text>
          <text class="category-count">{{ count }}</text>
        </button>
      </view>
    </details>
    <view v-if="store.rules.length === 0" class="empty">策略卡会自动沉淀到这里。</view>
    <view v-else-if="filteredRules.length === 0" class="empty">没有匹配的规则，换个关键词或分类。</view>
    <RuleCard
      v-for="rule in pagedRules"
      :key="rule.id"
      :rule="rule"
      :evidence="ruleEvidence(rule)"
      compact
      @feedback="store.setFeedback"
      @evaluate="store.addEvaluation"
      @apply-revision="(id) => store.applyRevisionDraft(id)"
    />
    <view v-if="totalPages > 1" class="pager">
      <button class="pager-btn" :disabled="page === 1" @click="page--">上一页</button>
      <text class="pager-info">{{ page }} / {{ totalPages }}（共 {{ filteredRules.length }} 条）</text>
      <button class="pager-btn" :disabled="page === totalPages" @click="page++">下一页</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useExperienceStore } from '../../../stores/experience'
import RuleCard from '../../../components/RuleCard.vue'
import type { ExperienceCategory, ExperienceRule, Observation } from '../../../types/experience'

const store = useExperienceStore()
const ruleQuery = ref('')
const selectedCategory = ref<ExperienceCategory | '全部'>('全部')
const PAGE_SIZE = 8
const page = ref(1)

const categoryTiles = computed(() =>
  Object.entries(store.rulesByCategory).map(([category, count]) => ({ category: category as ExperienceCategory, count })),
)

const filteredRules = computed(() => {
  const keyword = ruleQuery.value.trim().toLowerCase()
  return store.rules.filter((rule) => {
    const matchCategory = selectedCategory.value === '全部' || rule.category === selectedCategory.value
    const haystack = [
      rule.title,
      rule.category,
      rule.conclusion,
      rule.recommendation,
      rule.location ?? '',
      ...rule.conditions,
      ...rule.warnings,
    ]
      .join(' ')
      .toLowerCase()
    const matchKeyword = !keyword || haystack.includes(keyword)
    return matchCategory && matchKeyword
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRules.value.length / PAGE_SIZE)))
const pagedRules = computed(() => filteredRules.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

// 筛选变化时回到第 1 页；删规则导致页数缩减时夹紧当前页
watch([ruleQuery, selectedCategory], () => { page.value = 1 })
watch(totalPages, (n) => { if (page.value > n) page.value = n })

function toggleCategory(category: ExperienceCategory) {
  selectedCategory.value = selectedCategory.value === category ? '全部' : category
}
function resetFilters() {
  selectedCategory.value = '全部'
  ruleQuery.value = ''
}
function ruleEvidence(rule: ExperienceRule) {
  return rule.evidenceIds.map((id) => store.observations.find((o) => o.id === id)).filter((o): o is Observation => Boolean(o))
}
</script>

<style scoped>
.category-fold {
  margin: 8px 0;
  border: 1px dashed #c8d2cb;
  border-radius: 8px;
  padding: 8px 12px;
}
.category-summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #5a6b62;
}
.category-fold[open] .category-summary { margin-bottom: 8px; }
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 12px 0 4px;
}
.pager-btn {
  padding: 6px 14px;
  background: #fff;
  border: 1px solid #c8d2cb;
  border-radius: 8px;
  color: #3a4a42;
  font-size: 13px;
  cursor: pointer;
}
.pager-btn:disabled { opacity: 0.4; cursor: default; }
.pager-info { font-size: 13px; color: #5a6b62; }
</style>
