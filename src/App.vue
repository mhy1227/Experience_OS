<template>
  <IndexPage />
</template>

<script setup lang="ts">
import IndexPage from './pages/index/index.vue'
</script>

<style lang="scss">
@import './styles/theme.scss';

page {
  min-height: 100%;
  background: #f5f6f1;
  color: #252923;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei',
    sans-serif;
}

view,
text,
button,
input,
textarea {
  box-sizing: border-box;
}

view {
  display: block;
}

text {
  display: inline;
}

button {
  margin: 0;
  padding: 0;
  border: 0;
  line-height: 1;
  background: transparent;
}

button::after {
  display: none;
}
</style>
