// 原生 RegExp 薄壳:替换参考实现里的 re2(原生 Node 模块,浏览器跑不了)。
// 复刻 re2 封装的 API(compile/compileTest/findAllIndex/findAllSubmatch/test)。
//
// 仅需处理「开头 (?i)」内联标志 —— 本模块内置正则至多用到这个;
// 不引入 222 条 gitleaks 规则,故无 mid-pattern (?i) 等原生 RegExp 不兼容语法。
// 'd' 标志(hasIndices)取捕获组偏移,Node 16+ / 现代浏览器原生支持。
export type RE2 = RegExp
export type Range = [number, number]

function withFlags(pattern: string, base: string): RegExp {
  let source = pattern
  let flags = base
  if (source.startsWith('(?i)')) {
    source = source.slice(4)
    if (!flags.includes('i')) flags += 'i'
  }
  return new RegExp(source, flags)
}

// compile 用 'g'(FindAll 需要);indices 时附加 'd'(拿捕获组偏移)。
export function compile(pattern: string, opts: { indices?: boolean } = {}): RegExp {
  return withFlags(pattern, opts.indices ? 'gd' : 'g')
}

// compileTest 编译只用于 .test() 的正则(无 'g',避免 lastIndex 状态)。
export function compileTest(pattern: string): RegExp {
  return withFlags(pattern, '')
}

export function test(re: RegExp, text: string): boolean {
  re.lastIndex = 0
  const ok = re.test(text)
  re.lastIndex = 0
  return ok
}

// findAllIndex ≈ Go regexp.FindAllStringIndex:所有整体匹配的 [start,end]。
export function findAllIndex(re: RegExp, text: string): Range[] {
  re.lastIndex = 0
  const out: Range[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push([m.index, m.index + m[0].length])
    if (m[0] === '') re.lastIndex++ // 防空匹配死循环
  }
  re.lastIndex = 0
  return out
}

// findAllSubmatch ≈ Go regexp.FindAllStringSubmatchIndex:每个匹配返回 indices 数组,
// [0]=整体,[g]=第 g 组 [start,end](未匹配为 undefined)。需 compile(...,{indices:true})。
export function findAllSubmatch(re: RegExp, text: string): Array<Array<Range | undefined>> {
  re.lastIndex = 0
  const out: Array<Array<Range | undefined>> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const idx = (m as RegExpExecArray & { indices?: Array<Range | undefined> }).indices
    out.push(idx ?? [[m.index, m.index + m[0].length]])
    if (m[0] === '') re.lastIndex++
  }
  re.lastIndex = 0
  return out
}
