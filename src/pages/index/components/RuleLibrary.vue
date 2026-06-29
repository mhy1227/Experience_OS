<!-- 「规则库」路由:搜索/分类筛选 + 规则卡列表 -->
<template>
  <view>
    <view class="section-head">
      <text class="section-title">规则库</text>
      <text class="section-meta">
        {{ filteredRules.length }} / {{ store.rules.length }} 条规则<template v-if="unprovenCount > 0"> · {{ unprovenCount }} 条待验证</template>
      </text>
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
    <details v-if="store.allTags.length > 0" class="category-fold" :open="selectedTags.length > 0">
      <summary class="category-summary">
        {{ selectedTags.length === 0 ? `按标签筛选（${store.allTags.length} 个）` : `标签：${selectedTags.map((t) => '#' + t).join(' ')}` }}
      </summary>
      <view class="tag-filter-row">
        <button
          v-for="t in store.allTags"
          :key="t"
          class="tag-filter"
          :class="{ selected: selectedTags.includes(t) }"
          @click="toggleTag(t)"
        >#{{ t }}</button>
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
      editable-tags
      :tag-suggestions="store.allTags"
      @feedback="store.setFeedback"
      @evaluate="store.addEvaluation"
      @apply-revision="(id) => store.applyRevisionDraft(id)"
      @set-tags="store.setRuleTags"
    />
    <Pager
      v-model:page="page"
      v-model:page-size="pageSize"
      :total-pages="totalPages"
      :total="total"
      :page-size-options="pageSizeOptions"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useExperienceStore } from '../../../stores/experience'
import RuleCard from '../../../components/RuleCard.vue'
import Pager from '../../../components/Pager.vue'
import { usePagination } from '../../../composables/usePagination'
import { verificationRank } from '../../../services/ruleLabels'
import { ruleMatchesTags } from '../../../services/tagUtils'
import type { ExperienceCategory, ExperienceRule, Observation } from '../../../types/experience'

const store = useExperienceStore()
const ruleQuery = ref('')
const selectedCategory = ref<ExperienceCategory | '全部'>('全部')
const selectedTags = ref<string[]>([])

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
    return matchCategory && matchKeyword && ruleMatchesTags(rule, selectedTags.value)
  })
})

function toggleTag(tag: string) {
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter((t) => t !== tag)
    : [...selectedTags.value, tag]
}

// V3:待验证(0)→谨慎(1)→可信(2)稳定排序,把"该验的"排前(Array.sort 在 Node20 稳定)
const sortedRules = computed(() =>
  filteredRules.value.slice().sort((a, b) => verificationRank(a) - verificationRank(b)),
)
const unprovenCount = computed(() => filteredRules.value.filter((r) => verificationRank(r) === 0).length)

const { page, pageSize, pageSizeOptions, totalPages, total, paged: pagedRules, reset } = usePagination(sortedRules)

// 搜索/分类/标签切换时回到第 1 页
watch([ruleQuery, selectedCategory, selectedTags], reset)

function toggleCategory(category: ExperienceCategory) {
  selectedCategory.value = selectedCategory.value === category ? '全部' : category
}
function resetFilters() {
  selectedCategory.value = '全部'
  ruleQuery.value = ''
  selectedTags.value = []
}
function ruleEvidence(rule: ExperienceRule) {
  return rule.evidenceIds.map((id) => store.observations.find((o) => o.id === id)).filter((o): o is Observation => Boolean(o))
}
</script>

<style scoped>
.category-fold {
  margin: 8px 0;
  border: 1px dashed var(--line, #c8d2cb);
  border-radius: 8px;
  padding: 8px 12px;
}
.category-summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft, #5a6b62);
}
.category-fold[open] .category-summary { margin-bottom: 8px; }
.tag-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-filter {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-sunken);
  color: var(--ink-soft);
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.tag-filter:hover { border-color: var(--brand); }
.tag-filter.selected {
  background: var(--brand-wash);
  border-color: var(--brand);
  color: var(--brand-strong);
  font-weight: 600;
}
</style>
