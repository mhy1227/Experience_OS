import assert from 'node:assert/strict'
import { redact, shannonEntropy, Filter } from '../src/services/privacyFilter'

// ---------------------------------------------------------------------------
// A6 隐私脱敏(浏览器端,移植自 mhy1227/privacy-filter)。
// 对拍参考实现关键用例:PII(Luhn)、密钥(builtin/上下文/熵)、误报抑制、编排、幂等。
// ---------------------------------------------------------------------------

function red(t: string) {
  return redact(t).redacted
}

// PII:邮箱
{
  const r = redact('联系 zhang.san@example.com 报名')
  assert.ok(r.hit)
  assert.ok(r.redacted.includes('[邮箱]'))
  assert.ok(!r.redacted.includes('zhang.san@example.com'))
}

// PII:手机(裸号命中)
{
  assert.ok(red('打 13800138000 给我').includes('[电话]'))
}

// PII:身份证
{
  assert.ok(red('身份证 11010519900307743X 备案').includes('[身份证]'))
}

// PII:IPv4
{
  assert.ok(red('服务器 192.168.1.100 挂了').includes('[IP]'))
}

// PII:银行卡 —— Luhn 合法命中,改一位(非法)不命中
{
  assert.ok(red('卡号 4111111111111111 充值').includes('[银行卡]'), '合法卡号应打码')
  assert.ok(!red('编号 4111111111111112 仅供参考').includes('[银行卡]'), '非 Luhn 数字不应误判为卡号')
}

// 密钥:builtin 规则(OpenAI sk- key)
{
  const r = redact('我的 key 是 sk-proj-abcdefghijklmnopqrstuvwxyz0123456789')
  assert.ok(r.redacted.includes('[密钥]'))
  assert.ok(!r.redacted.includes('sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'))
}

// 密钥:上下文口令
{
  assert.ok(red('数据库密码是 X9k2Lm8Qz5Rv3Tw').includes('[密钥]'))
}

// 误报抑制:UUID 不打码
{
  const r = redact('订单 550e8400-e29b-41d4-a716-446655440000 已创建')
  assert.ok(!r.redacted.includes('[密钥]'), 'UUID 不应被当密钥')
}

// 误报抑制:正常中文句子零命中
{
  const r = redact('周末十点健身房人少,器械不用排队')
  assert.equal(r.hit, false)
  assert.equal(r.count, 0)
}

// 编排:多类型混合 → 都打码、重建正确
{
  const r = redact('邮箱 a@b.com 电话 13800138000')
  assert.ok(r.redacted.includes('[邮箱]'))
  assert.ok(r.redacted.includes('[电话]'))
  assert.equal(r.count, 2)
}

// 幂等:对已脱敏文本再脱敏不应再产生命中
{
  const once = redact('邮箱 a@b.com').redacted
  const twice = redact(once)
  assert.equal(twice.hit, false, '占位符不应再触发规则')
}

// 香农熵:空串=0、重复串低、随机串高
{
  assert.equal(shannonEntropy(''), 0)
  assert.ok(shannonEntropy('aaaaaaaa') < 1)
  assert.ok(shannonEntropy('Ax9Kf2Lm8Qz5Rv3Tw7Yb') > 3.5)
}

// 空串 / 纯标点
{
  assert.equal(redact('').hit, false)
  assert.equal(redact('。。。!!!').hit, false)
}

// gitleaks 规则已加载(编译通过的 + 内置兜底),少数 RE2 专属语法被跳过
{
  const s = Filter.create().stats()
  assert.ok(s.rules >= 150, `gitleaks 规则应已加载,实际 ${s.rules}`)
  assert.ok(s.skipped > 0 && s.skipped < 60, `RE2 专属语法规则应被跳过,实际 ${s.skipped}`)
}

// gitleaks 专有模式(非内置):npm token / gitlab token
{
  assert.ok(redact('token npm_abcdefghijklmnopqrstuvwxyz0123456789').redacted.includes('[密钥]'), 'npm token 应命中')
  assert.ok(redact('glpat-abcdefghijklmnopqrst').redacted.includes('[密钥]'), 'gitlab token 应命中')
}

console.log('privacyFilter tests passed')
