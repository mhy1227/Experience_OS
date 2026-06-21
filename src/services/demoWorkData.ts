/**
 * 演示工作种子数据
 *
 * 数据设计原则:
 * - 共 35 条工作场景观察(2026-03~2026-06)
 * - 13 条埋同一共同根因 rootCauseTag='目标不一致'(不同表述/不同月份)
 * - ~15 条干扰项(技术债/沟通/资源等其他问题)
 * - ~5 条正向规律
 * - 负向观察中"目标不一致"占多数,确保 Plan 3 聚类后该簇能被模型归因为共同根因
 *
 * 字段说明:
 *   text         — 原始观察文本(中文口语化,模拟真实录入)
 *   date         — 观察日期(ISO 8601)
 *   direction    — 'positive' | 'negative' | 'neutral'
 *   rootCauseTag — 验证用标签,不写入 Observation 类型,仅用于测试断言
 */

export type DemoWorkItem = {
  text: string
  date: string
  direction: 'positive' | 'negative' | 'neutral'
  rootCauseTag: string
}

export const DEMO_WORK_DATA: DemoWorkItem[] = [
  // ─── 13 条:共同根因"目标不一致" ─────────────────────────────────────────
  // 这组条目表述各异但根因相同,供 Plan 3 聚类后归因为同一模式
  {
    text: '这个功能开发到一半,产品说方向变了,前两周全白做了',
    date: '2026-03-05',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '项目启动时没开对齐会,每个人理解的交付物不一样,最后汇总时才发现分歧',
    date: '2026-03-12',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '领导在中途改了优先级,但没通知到执行层,我们还在按旧优先级排期',
    date: '2026-03-19',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '客户评审时才说这不是他们要的功能,但需求文档从没更新过',
    date: '2026-04-02',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '设计和研发对"完成标准"理解不一样,测试阶段才暴露,返工了一周',
    date: '2026-04-09',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '这次迭代目标在过程中被悄悄改了两次,没人更新工单,最后交付的不是最新版本',
    date: '2026-04-17',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '老板临时插了一个"高优"需求进来,把原来的计划全打乱了,也没评估影响',
    date: '2026-04-24',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '跨部门协作的项目,大家各做各的,到联调阶段才发现接口约定对不上',
    date: '2026-05-06',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '需求评审没到场的同学后来做了不同假设,导致两套实现方案冲突',
    date: '2026-05-13',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '项目目标在 OKR 里写着,但日常执行没人对齐,做了很多和目标无关的事',
    date: '2026-05-20',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '这个版本砍掉了好几个功能,但截止日期没变,质量明显下降,根源是目标本来就没谈清楚',
    date: '2026-05-27',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '上线后发现几个核心指标没有定义,不知道怎么衡量成功,说明立项时根本没对齐目标',
    date: '2026-06-03',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '中途换了一个 PM,新 PM 对项目理解和老 PM 不一样,团队重新磨合花了两周',
    date: '2026-06-10',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '甲方临时变更了项目范围,合同都没改,团队直接加班赶新需求',
    date: '2026-06-12',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '内部战略调整没有同步到项目组,做了三个月的方案和新战略完全冲突',
    date: '2026-06-14',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },

  // ─── ~15 条干扰项(其他工作问题) ──────────────────────────────────────
  {
    text: '代码历史债太多,加一个新功能要改五处地方,容易漏',
    date: '2026-03-07',
    direction: 'negative',
    rootCauseTag: '技术债',
  },
  {
    text: '每次 code review 反馈太晚了,到合并前一天才提意见,很被动',
    date: '2026-03-14',
    direction: 'negative',
    rootCauseTag: '流程低效',
  },
  {
    text: '会议太多,一天有 5 个会,根本没时间深度工作',
    date: '2026-03-21',
    direction: 'negative',
    rootCauseTag: '时间管理',
  },
  {
    text: '测试环境经常不稳定,排查问题搞不清是代码 bug 还是环境问题',
    date: '2026-04-01',
    direction: 'negative',
    rootCauseTag: '基础设施',
  },
  {
    text: '新人上手文档太少,每次入职都要老人手把手带,耗时间',
    date: '2026-04-08',
    direction: 'negative',
    rootCauseTag: '知识传递',
  },
  {
    text: '周报格式每周都在变,花时间在整理格式上而不是内容',
    date: '2026-04-15',
    direction: 'negative',
    rootCauseTag: '流程低效',
  },
  {
    text: '资源申请要走三级审批,急用的云资源两天才拿到,项目被卡住',
    date: '2026-04-22',
    direction: 'negative',
    rootCauseTag: '资源瓶颈',
  },
  {
    text: '跨时区同步靠异步文档,但文档没人维护,信息严重滞后',
    date: '2026-05-05',
    direction: 'negative',
    rootCauseTag: '沟通效率',
  },
  {
    text: '需求文档写得很模糊,研发自己猜了实现,上线后才发现猜错了',
    date: '2026-05-12',
    direction: 'negative',
    rootCauseTag: '文档质量',
  },
  {
    text: '监控告警没配好,线上出问题 20 分钟后才收到通知',
    date: '2026-05-19',
    direction: 'negative',
    rootCauseTag: '技术债',
  },
  {
    text: '压力大的时候容易只顾眼前 deadline,忽略了下游依赖方',
    date: '2026-05-26',
    direction: 'negative',
    rootCauseTag: '沟通效率',
  },
  {
    text: '演示环境和生产环境配置差异大,演示通过但生产上线后出 bug',
    date: '2026-06-02',
    direction: 'negative',
    rootCauseTag: '基础设施',
  },
  {
    text: '外包人员对业务背景不了解,接口设计反复修改,浪费评审时间',
    date: '2026-06-09',
    direction: 'negative',
    rootCauseTag: '知识传递',
  },
  {
    text: '临近发布才做安全审查,改动量大,风险高',
    date: '2026-06-16',
    direction: 'negative',
    rootCauseTag: '流程低效',
  },
  {
    text: '数据库字段命名不统一,每次查询都要翻文档对照',
    date: '2026-06-18',
    direction: 'negative',
    rootCauseTag: '技术债',
  },

  // ─── ~5 条正向规律 ──────────────────────────────────────────────────────
  {
    text: '这次在项目启动时开了目标对齐会,把成功标准写进文档,全程没有方向性返工',
    date: '2026-03-25',
    direction: 'positive',
    rootCauseTag: '目标对齐实践',
  },
  {
    text: '每周迭代开始前花 15 分钟对齐本周优先级,减少了临时插入需求的情况',
    date: '2026-04-28',
    direction: 'positive',
    rootCauseTag: '目标对齐实践',
  },
  {
    text: '用 ADR(架构决策记录)记录关键决策,两个月后回顾时大家能快速理解当时的选择理由',
    date: '2026-05-08',
    direction: 'positive',
    rootCauseTag: '知识沉淀',
  },
  {
    text: '小步迭代每 3 天 demo 一次,提前发现方向偏差,总工作量反而减少',
    date: '2026-05-22',
    direction: 'positive',
    rootCauseTag: '迭代节奏',
  },
  {
    text: '给下游团队提前两周发"变更预告",联调期间几乎没有因接口变更引起的阻塞',
    date: '2026-06-05',
    direction: 'positive',
    rootCauseTag: '协作协议',
  },
]
