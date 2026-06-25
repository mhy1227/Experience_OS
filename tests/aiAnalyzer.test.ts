import assert from 'node:assert/strict'
import { analyzeObservation } from '../src/services/aiAnalyzer'

async function testSimpleGymOffpeakObservationCreatesRule() {
  const result = await analyzeObservation('周末10点健身房人少，器械不用排队')

  assert.equal(result.category, '运动')
  assert.equal(result.title, '周末低峰训练策略')
  assert.equal(result.reusability, 'high')
  assert.ok(result.recommendation.includes('9:45-10:30'))
}

async function testSimpleCrowdedGymObservationStaysWatch() {
  const result = await analyzeObservation('周日十点钟去健身房，人很多')

  assert.equal(result.category, '运动')
  assert.equal(result.title, '待观察经验')
  assert.equal(result.reusability, 'watch')
  assert.ok(result.summary.includes('结构化保存'))
  assert.ok(result.recommendation.includes('补充时间、地点、对象和结果'))
}

async function testContradictedTemplateObservationsStayWatch() {
  const cases = [
    {
      text: '工作日晚上8点去小区超市，结账排队很长',
      category: '购物',
    },
    {
      text: '下雨天走B口到公司更远，还要绕路',
      category: '出行',
    },
    {
      text: '午休后散步10分钟，下午开会还是犯困',
      category: '生活',
    },
    {
      text: '上午10点写方案容易卡住，下午3点反而更顺',
      category: '工作',
    },
    {
      text: '浅口猫碗不适合，猫吃不干净',
      category: '购物',
    },
    {
      text: '报了Python网课，每天学习一小时感觉还行',
      category: '学习成长',
    },
    {
      text: '这个月记账后发现预算又超了，得攒钱',
      category: '理财',
    },
  ] as const

  for (const item of cases) {
    const result = await analyzeObservation(item.text)
    assert.equal(result.category, item.category)
    assert.equal(result.title, '待观察经验', item.text)
    assert.equal(result.reusability, 'watch', item.text)
    assert.ok(result.recommendation.includes('补充时间、地点、对象和结果'), item.text)
  }
}

// 新分类(学习成长/理财)的关键词推断:覆盖演示数据里的真实文本,
// 并确认「买基金」走理财、不被购物抢走(关键词前置顺序的回归保护)。
async function testNewCategoryInference() {
  const cases = [
    { text: '每天通勤地铁上背单词,一个月下来词汇量明显涨了', category: '学习成长' },
    { text: '把网课拆成每天二十分钟,这次终于把课程刷完了', category: '学习成长' },
    { text: '考证复习全堆到考前一周,结果没复习完只能裸考', category: '学习成长' },
    { text: '工资到账当天先把房租和定投扣掉,剩下的随便花也不超支', category: '理财' },
    { text: '开始每天记账后,才发现外卖和打车才是花钱大头', category: '理财' },
    { text: '看同事买基金赚钱跟着冲,没做预算结果一买就套牢', category: '理财' },
  ] as const

  for (const item of cases) {
    const result = await analyzeObservation(item.text)
    assert.equal(result.category, item.category, item.text)
  }
}

async function run() {
  await testSimpleGymOffpeakObservationCreatesRule()
  await testSimpleCrowdedGymObservationStaysWatch()
  await testContradictedTemplateObservationsStayWatch()
  await testNewCategoryInference()
  console.log('aiAnalyzer tests passed')
}

void run()
