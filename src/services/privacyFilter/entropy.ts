// 香农熵(bits/byte)。移植自 mhy1227/privacy-filter-ts;Buffer 换成浏览器原生 TextEncoder(UTF-8 字节)。
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0
  const bytes = new TextEncoder().encode(s)
  const freq = new Array<number>(256).fill(0)
  for (const b of bytes) freq[b]++
  const n = bytes.length
  let ent = 0
  for (const c of freq) {
    if (c > 0) {
      const p = c / n
      ent -= p * Math.log2(p)
    }
  }
  return ent
}
