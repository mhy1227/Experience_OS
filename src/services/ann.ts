/**
 * A5 近似最近邻(ANN)—— LSH:随机超平面哈希(Random Hyperplane LSH)
 *
 * 诚实边界:
 * - LSH 是**近似**最近邻,不保证返回的就是精确 top-k(精确解需全量余弦扫描)。
 *   它用"随机超平面把空间切成桶"的方式快速圈定一批候选,再在候选里精排,
 *   以"少量召回损失"换"亚线性的候选规模",数据量大时才划算。
 * - 本项目数据量小,直接全量余弦其实更简单也够用;按方案 A5 标注,这属"按需/过度工程",
 *   故本模块作为**独立工具**实现,**未接入** store / pages。
 * - 余弦相似度在本文件内自实现,不依赖其它文件。
 *
 * 算法要点:
 * - 每张哈希表持有 `numHyperplanes` 个随机法向量;某向量在某超平面的哪一侧
 *   (点积符号)给出 1 个比特,拼成该表的桶签名(bit string)。
 * - 余弦相似的向量大概率落同一(或邻近)桶,故同桶/邻桶成员是候选。
 * - 用 `numTables` 张表(各自独立的随机超平面)做"多探针",提高召回:
 *   只要在**任意一张表**同桶,就被纳入候选。
 *
 * 确定性:随机超平面**不用 Math.random**,而用可种子化 PRNG(mulberry32),
 * 由 `seed` 参数控制,默认固定种子 → 相同输入可复现。
 */

/** mulberry32:轻量可种子化 PRNG,返回 [0,1) 浮点。相同 seed 序列完全可复现。 */
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 用 PRNG 生成一个标准正态分布的样本(Box–Muller 变换)。
 * 随机超平面的法向量取标准正态分量 → 方向在单位球面上各向同性,符合 LSH 假设。
 */
function gaussian(rng: () => number): number {
  // u 避免取 0,防止 log(0) = -Infinity
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 点积。 */
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * 余弦相似度,范围约 [-1, 1]。任一向量为零向量时返回 0(无方向可言)。
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dim mismatch ${a.length} vs ${b.length}`);
  }
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface LshIndexOptions {
  /** 向量维度。 */
  dim: number;
  /** 每张表的超平面数(签名位数),默认 12。越大桶越细、候选越少、召回越低。 */
  numHyperplanes?: number;
  /** 哈希表张数(多探针),默认 4。越多召回越高、开销越大。 */
  numTables?: number;
  /** PRNG 种子,默认固定值以保证可复现。 */
  seed?: number;
}

export interface QueryResult {
  id: string;
  /** 余弦相似度(精排后的真实得分,非桶距离)。 */
  score: number;
}

interface StoredVector {
  id: string;
  vec: number[];
}

const DEFAULT_NUM_HYPERPLANES = 12;
const DEFAULT_NUM_TABLES = 4;
const DEFAULT_SEED = 0x9e3779b9; // 固定默认种子

/**
 * 随机超平面 LSH 索引(稠密向量 number[])。
 */
export class LshIndex {
  readonly dim: number;
  readonly numHyperplanes: number;
  readonly numTables: number;
  readonly seed: number;

  /** 每张表的超平面法向量:planes[t][h] 是一个长度 dim 的法向量。 */
  private readonly planes: number[][][];
  /** 每张表一个桶映射:bucket signature -> 落入该桶的向量索引列表。 */
  private readonly tables: Map<string, number[]>[];
  /** 全部存入的向量(精排与回退时用)。 */
  private readonly vectors: StoredVector[] = [];
  /** 去重:已存在的 id -> vectors 下标。 */
  private readonly idToIndex = new Map<string, number>();

  constructor(options: LshIndexOptions) {
    this.dim = options.dim;
    this.numHyperplanes = options.numHyperplanes ?? DEFAULT_NUM_HYPERPLANES;
    this.numTables = options.numTables ?? DEFAULT_NUM_TABLES;
    this.seed = options.seed ?? DEFAULT_SEED;

    if (this.dim <= 0) throw new Error('LshIndex: dim must be > 0');

    // 用单一 PRNG 流顺序生成所有超平面 → 同 seed 完全确定。
    const rng = mulberry32(this.seed);
    this.planes = [];
    for (let t = 0; t < this.numTables; t++) {
      const tablePlanes: number[][] = [];
      for (let h = 0; h < this.numHyperplanes; h++) {
        const normal: number[] = new Array(this.dim);
        for (let d = 0; d < this.dim; d++) normal[d] = gaussian(rng);
        tablePlanes.push(normal);
      }
      this.planes.push(tablePlanes);
    }

    this.tables = [];
    for (let t = 0; t < this.numTables; t++) this.tables.push(new Map());
  }

  /** 计算某向量在第 t 张表的桶签名(每个超平面贡献 1 个比特)。 */
  private signature(vec: number[], tableIdx: number): string {
    const tablePlanes = this.planes[tableIdx];
    let sig = '';
    for (let h = 0; h < tablePlanes.length; h++) {
      sig += dot(vec, tablePlanes[h]) >= 0 ? '1' : '0';
    }
    return sig;
  }

  /**
   * 加入一个向量。重复 id 视为更新(覆盖向量并重建其桶归属)。
   */
  add(id: string, vec: number[]): void {
    if (vec.length !== this.dim) {
      throw new Error(`LshIndex.add: dim mismatch ${vec.length} vs ${this.dim}`);
    }

    const existing = this.idToIndex.get(id);
    let index: number;
    if (existing !== undefined) {
      // 更新:先从旧桶里移除该索引,再重新插入。
      index = existing;
      this.removeFromTables(index, this.vectors[index].vec);
      this.vectors[index] = { id, vec: vec.slice() };
    } else {
      index = this.vectors.length;
      this.vectors.push({ id, vec: vec.slice() });
      this.idToIndex.set(id, index);
    }

    for (let t = 0; t < this.numTables; t++) {
      const sig = this.signature(vec, t);
      const bucket = this.tables[t].get(sig);
      if (bucket) bucket.push(index);
      else this.tables[t].set(sig, [index]);
    }
  }

  private removeFromTables(index: number, vec: number[]): void {
    for (let t = 0; t < this.numTables; t++) {
      const sig = this.signature(vec, t);
      const bucket = this.tables[t].get(sig);
      if (!bucket) continue;
      const pos = bucket.indexOf(index);
      if (pos !== -1) bucket.splice(pos, 1);
      if (bucket.length === 0) this.tables[t].delete(sig);
    }
  }

  /** 已存入的向量数量。 */
  get size(): number {
    return this.vectors.length;
  }

  /**
   * 近似最近邻查询:用同一组超平面对 query 取签名收集候选,再用余弦精排取 topK。
   *
   * 候选来源:每张表中与 query 同桶的成员(多表并集);并额外探查**邻桶**
   * (与 query 签名仅 1 比特之差的桶,Hamming 距离 1),提升召回。
   *
   * 回退:若候选过少(< topK),回退为全量扫描所有向量。
   *   —— 这是对 LSH **近似性质**的兜底:小数据/桶切得过细时,空桶/漏召回常见,
   *      全量回退保证"真正的最近邻一定在结果中",代价是退化为线性扫描。
   */
  query(vec: number[], topK = 5): QueryResult[] {
    if (vec.length !== this.dim) {
      throw new Error(`LshIndex.query: dim mismatch ${vec.length} vs ${this.dim}`);
    }
    if (this.vectors.length === 0) return []; // 空索引

    const candidateIdx = new Set<number>();
    for (let t = 0; t < this.numTables; t++) {
      const sig = this.signature(vec, t);
      this.collectBucket(t, sig, candidateIdx);
      // 邻桶:翻转每一位,探查 Hamming 距离 1 的桶。
      for (let b = 0; b < sig.length; b++) {
        const flipped = sig.slice(0, b) + (sig[b] === '1' ? '0' : '1') + sig.slice(b + 1);
        this.collectBucket(t, flipped, candidateIdx);
      }
    }

    // 候选不足(LSH 近似性质 → 可能漏召回):回退全量扫描,保证召回。
    if (candidateIdx.size < topK) {
      for (let i = 0; i < this.vectors.length; i++) candidateIdx.add(i);
    }

    const scored: QueryResult[] = [];
    for (const idx of candidateIdx) {
      const sv = this.vectors[idx];
      scored.push({ id: sv.id, score: cosineSimilarity(vec, sv.vec) });
    }

    // 余弦降序;并列时按 id 稳定排序,保证确定性。
    scored.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return scored.slice(0, topK);
  }

  private collectBucket(tableIdx: number, sig: string, out: Set<number>): void {
    const bucket = this.tables[tableIdx].get(sig);
    if (!bucket) return;
    for (const idx of bucket) out.add(idx);
  }
}
