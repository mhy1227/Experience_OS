/**
 * 演示工作种子数据
 *
 * 数据设计原则:
 * - 共 35 条工作场景观察(2026-03~2026-06)
 * - 24 条埋同一共同根因 rootCauseTag='目标不一致'(不同表述/不同月份)
 * - 6 条干扰项(技术债/沟通/资源等其他问题)
 * - 5 条正向规律
 * - 负向观察中"目标不一致"占 80%(24/30),确保 Plan 3 聚类后该簇能被模型归因为共同根因
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
  // ─── 24 条:共同根因"目标不一致" ─────────────────────────────────────────
  // 这组条目表述各异但根因相同,供 Plan 3 聚类后归因为同一模式
  // 24/30 负向 = 80%,满足演示和彩排 T3.3(≥70%)以及 spec ≥80% 目标
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
  {
    text: '两个团队对"MVP"的定义不一样,一个认为是 Demo 级,一个认为要生产就绪,到集成才发现',
    date: '2026-03-08',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '项目范围蔓延没有走正式变更流程,每次会议都多了几个"小需求",最后比原计划多了 40%工作量',
    date: '2026-03-22',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '总部下发了新合规要求但没有明确优先级,研发部门自己排期,结果和业务部门的优先级完全相反',
    date: '2026-04-03',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '发布前一天产品说需要重新调整核心流程,因为之前理解的用户路径和实际用研结果不符',
    date: '2026-04-11',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '前端和后端对字段含义理解不同,上线后数据全部错乱,排查了两天才找到根本原因是接口文档没对齐',
    date: '2026-04-20',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '这次多方合作项目中途换了甲方对接人,新的人改了验收标准,之前做的评审全部作废',
    date: '2026-05-04',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '季度复盘才发现,这三个月做的功能有 60% 和年度目标不相关,资源全浪费了',
    date: '2026-05-18',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '用户故事写得太笼统,开发按自己理解做了实现,结果演示时产品和用户都不满意',
    date: '2026-05-30',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },
  {
    text: '同一个项目里前后出现了两个互相矛盾的需求文档版本,没人说清哪个是最新的,各自按不同版本实现',
    date: '2026-06-07',
    direction: 'negative',
    rootCauseTag: '目标不一致',
  },

  // ─── 6 条干扰项(其他工作问题) ──────────────────────────────────────────
  {
    text: '代码历史债太多,加一个新功能要改五处地方,容易漏',
    date: '2026-03-07',
    direction: 'negative',
    rootCauseTag: '技术债',
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
    text: '资源申请要走三级审批,急用的云资源两天才拿到,项目被卡住',
    date: '2026-04-22',
    direction: 'negative',
    rootCauseTag: '资源瓶颈',
  },
  {
    text: '监控告警没配好,线上出问题 20 分钟后才收到通知',
    date: '2026-05-19',
    direction: 'negative',
    rootCauseTag: '技术债',
  },
  {
    text: '临近发布才做安全审查,改动量大,风险高',
    date: '2026-06-16',
    direction: 'negative',
    rootCauseTag: '流程低效',
  },

  // ─── 5 条正向规律 ──────────────────────────────────────────────────────
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

/**
 * 跨品类演示数据(生活/运动/购物/出行/学习/健康/财务),为演示提供多样性。
 * 与 DEMO_WORK_DATA 并列载入(loadDemoWorkData);不参与工作集的"目标不一致"比例约束。
 * 含一组"半途而废"共同根因(学习/健身/计划)→ 便于演示跨场景规律发现。
 */
export const DEMO_VARIED_DATA: DemoWorkItem[] = [
  // 运动 / 健康 —— 低峰时段、健康习惯(正向策略)
  { text: '周末早上十点去健身房,人很少不用排队,器械随便用', date: '2026-05-10', direction: 'positive', rootCauseTag: '低峰时段' },
  { text: '晚上九点去公园跑步,人最少也最凉快', date: '2026-05-17', direction: 'positive', rootCauseTag: '低峰时段' },
  { text: '饭后散步十五分钟,当晚睡得明显更好', date: '2026-05-24', direction: 'positive', rootCauseTag: '健康习惯' },
  { text: '周末自己做饭,比天天点外卖省钱也清爽', date: '2026-05-31', direction: 'positive', rootCauseTag: '健康习惯' },
  // 购物 —— 计划消费 vs 冲动消费
  { text: '工作日晚上八点去超市,结账几乎不用排队', date: '2026-04-15', direction: 'positive', rootCauseTag: '低峰时段' },
  { text: '需要的东西先列清单再下单,这次没乱买', date: '2026-05-06', direction: 'positive', rootCauseTag: '计划消费' },
  { text: '618 一冲动买了一堆,最后大半没用上又后悔', date: '2026-06-02', direction: 'negative', rootCauseTag: '冲动消费' },
  // 出行 —— 错峰避堵
  { text: '下雨天走地铁比开车快很多,完全不堵', date: '2026-04-22', direction: 'positive', rootCauseTag: '错峰避堵' },
  { text: '比平时早出门半小时错开高峰,路上顺很多', date: '2026-05-13', direction: 'positive', rootCauseTag: '错峰避堵' },
  // 学习 / 自律 —— 共同根因"半途而废"(便于跨场景规律发现)
  { text: '又买了门高价课,看了三节就没再打开,完成率不到三成', date: '2026-03-20', direction: 'negative', rootCauseTag: '半途而废' },
  { text: '办了健身年卡,去了三次就再没去过', date: '2026-04-08', direction: 'negative', rootCauseTag: '半途而废' },
  { text: '立的每天读书计划,坚持一周就放弃了', date: '2026-04-28', direction: 'negative', rootCauseTag: '半途而废' },
  { text: '报名的线上训练营,前两天很积极后面就掉队了', date: '2026-05-20', direction: 'negative', rootCauseTag: '半途而废' },
  // 财务 —— 记录 / 计划
  { text: '一直到月底才记账,钱花哪了完全想不起来', date: '2026-04-30', direction: 'negative', rootCauseTag: '缺乏记录' },
  { text: '工资到账先转一部分进存款,剩下的才花,月底不慌', date: '2026-05-08', direction: 'positive', rootCauseTag: '计划消费' },
  // 家庭 / 生活 —— 提前准备
  { text: '前一晚把第二天要带的东西收拾好,早上出门不慌不忘', date: '2026-05-15', direction: 'positive', rootCauseTag: '提前准备' },
  { text: '重要的事设个提醒,再也没忘过缴费和约会', date: '2026-05-27', direction: 'positive', rootCauseTag: '提前准备' },
  // 健康 —— 作息
  { text: '熬夜赶完第二天一整天没精神,得不偿失', date: '2026-04-12', direction: 'negative', rootCauseTag: '作息紊乱' },
  { text: '连续几天不运动,整个人就开始犯懒提不起劲', date: '2026-06-01', direction: 'negative', rootCauseTag: '作息紊乱' },
]
