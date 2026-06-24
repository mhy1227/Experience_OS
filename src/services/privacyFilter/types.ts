// A6 隐私脱敏 · 类型。移植自 mhy1227/privacy-filter-ts(用户自有),浏览器原生化。
// Entity 是一个被脱敏的命中项。start/end 为 UTF-16 码元偏移。
export interface Entity {
  type: string
  start: number
  end: number
  text: string
}

// Result 是一次脱敏的结果。
export interface Result {
  redacted: string
  hit: boolean
  count: number
  entities: Entity[]
}

// Span 是各检测层内部产出的区间。
export interface Span {
  start: number
  end: number
  label: string
}
