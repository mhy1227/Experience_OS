import assert from 'node:assert/strict';
import { LshIndex, cosineSimilarity } from '../src/services/ann';

// ---------------------------------------------------------------------------
// 测试数据:两个明显分组的簇(高维,LSH 才有意义)。
//   簇 A 接近 [1,0,...,0];簇 B 接近 [0,1,0,...,0]。
//   每个成员加一点确定的小扰动(不靠 Math.random,保证测试可复现)。
// ---------------------------------------------------------------------------
const DIM = 16;

function makeVec(base: number[], jitterSeed: number): number[] {
  // 确定性扰动:基于 index 和 seed 的简单可复现噪声。
  const v = base.slice();
  for (let i = 0; i < v.length; i++) {
    const n = ((Math.sin(jitterSeed * 12.9898 + i * 78.233) * 43758.5453) % 1 + 1) % 1;
    v[i] += (n - 0.5) * 0.1; // 小扰动,不改变所属簇
  }
  return v;
}

function baseA(): number[] {
  const v = new Array(DIM).fill(0);
  v[0] = 1;
  return v;
}
function baseB(): number[] {
  const v = new Array(DIM).fill(0);
  v[1] = 1;
  return v;
}

const clusterA = ['a1', 'a2', 'a3', 'a4'].map((id, i) => ({ id, vec: makeVec(baseA(), i + 1) }));
const clusterB = ['b1', 'b2', 'b3', 'b4'].map((id, i) => ({ id, vec: makeVec(baseB(), i + 100) }));
const allMembers = [...clusterA, ...clusterB];

function buildIndex(seed?: number): LshIndex {
  const idx = new LshIndex({ dim: DIM, numHyperplanes: 8, numTables: 4, seed });
  for (const m of allMembers) idx.add(m.id, m.vec);
  return idx;
}

// ---------------------------------------------------------------------------
// 余弦自检(sanity):同向≈1,正交≈0。
// ---------------------------------------------------------------------------
{
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0])) < 1e-9);
  // 零向量 → 0(无方向)
  assert.equal(cosineSimilarity([0, 0, 0], [1, 1, 1]), 0);
}

// ---------------------------------------------------------------------------
// ① 查询接近簇 A 的向量 → 结果里应包含簇 A 的成员(真正最近邻出现在 topK 候选中)。
//    LSH 是近似,这里不要求精确排序第一,只要求最近的那批确实被召回。
// ---------------------------------------------------------------------------
{
  const idx = buildIndex();
  const queryNearA = baseA(); // 纯 [1,0,...]
  const res = idx.query(queryNearA, 4);

  assert.ok(res.length > 0, 'should return results');
  const ids = res.map((r) => r.id);
  const aMembers = ids.filter((id) => id.startsWith('a'));
  assert.ok(aMembers.length > 0, `topK should contain cluster-A members, got ${JSON.stringify(ids)}`);

  // 最近邻(余弦最高)应属于簇 A —— 全量回退/正常召回都应满足。
  assert.ok(res[0].id.startsWith('a'), `nearest neighbour should be from cluster A, got ${res[0].id}`);

  // 对称:查询接近簇 B → 含簇 B 成员。
  const resB = idx.query(baseB(), 4);
  assert.ok(resB.map((r) => r.id).some((id) => id.startsWith('b')), 'topK should contain cluster-B members');
  assert.ok(resB[0].id.startsWith('b'), 'nearest neighbour should be from cluster B');
}

// ---------------------------------------------------------------------------
// ② 确定性:固定 seed 两次构建 + 查询,结果完全一致。
// ---------------------------------------------------------------------------
{
  const SEED = 12345;
  const idx1 = buildIndex(SEED);
  const idx2 = buildIndex(SEED);

  const q = makeVec(baseA(), 999);
  const r1 = idx1.query(q, 5);
  const r2 = idx2.query(q, 5);

  assert.deepEqual(r1, r2, 'same seed must yield identical results');

  // 默认种子也应确定。
  const d1 = buildIndex().query(q, 5);
  const d2 = buildIndex().query(q, 5);
  assert.deepEqual(d1, d2, 'default seed must be deterministic too');
}

// ---------------------------------------------------------------------------
// ③ 空索引查询 → []
// ---------------------------------------------------------------------------
{
  const empty = new LshIndex({ dim: DIM });
  assert.deepEqual(empty.query(baseA(), 5), [], 'empty index returns []');
  assert.equal(empty.size, 0);
}

// ---------------------------------------------------------------------------
// ④ topK 生效:返回数量不超过 topK,且不超过索引内向量总数。
// ---------------------------------------------------------------------------
{
  const idx = buildIndex();
  assert.equal(idx.size, allMembers.length);

  const top2 = idx.query(baseA(), 2);
  assert.equal(top2.length, 2, 'topK=2 should cap results at 2');

  const top3 = idx.query(baseA(), 3);
  assert.equal(top3.length, 3, 'topK=3 should cap results at 3');

  // topK 大于总量时,最多返回全部。
  const topBig = idx.query(baseA(), 999);
  assert.equal(topBig.length, allMembers.length, 'topK > size returns all');

  // 结果按余弦降序。
  for (let i = 1; i < topBig.length; i++) {
    assert.ok(topBig[i - 1].score >= topBig[i].score, 'results sorted by score desc');
  }
}

// ---------------------------------------------------------------------------
// 额外:add 同 id 视为更新(不重复计数)。
// ---------------------------------------------------------------------------
{
  const idx = new LshIndex({ dim: DIM, seed: 7 });
  idx.add('x', baseA());
  idx.add('x', baseB()); // 更新为簇 B 方向
  assert.equal(idx.size, 1, 're-adding same id updates, not duplicates');
  const res = idx.query(baseB(), 1);
  assert.equal(res[0].id, 'x');
  assert.ok(res[0].score > 0.9, 'updated vector should match new direction');
}

console.log('ann tests passed');
