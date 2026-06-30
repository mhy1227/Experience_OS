# 仓库迁移指南

> 日期：2026-06-30
> 用途：当需要将项目从当前仓库迁移到新仓库时的操作指南
> 核心原则：敏感文件永不提交，配置同步保持一致

---

## 一、迁移前准备

### 1.1 确认需要迁移的内容

| 内容 | 是否迁移 | 说明 |
|------|:--:|------|
| **源代码** | ✅ | 全部迁移 |
| **配置文件** | ✅ | `.gitignore`、`.env.example` 等 |
| **文档** | ⚠️ 按需 | PRD、分析文档等可选择性迁移 |
| **敏感文件** | ❌ 绝对不 | API Key、数据库密码等 |
| **node_modules** | ❌ | 重新安装 |
| **dist/** | ❌ | 重新构建 |

### 1.2 敏感文件清单（必须排除）

```text
private-doc/deepseek/api-key-local.txt  # API Key
private-doc/sql-hub/bank-local.txt      # 数据库密码  
private-doc/vercel/local.env.txt        # Vercel 环境变量
.env.local                              # 本地环境变量
.mcp.json                               # MCP 配置（含密码）
.codex/config.toml                      # Codex 配置（含密码）
```

---

## 二、迁移步骤

### 方法一：保留历史记录迁移（推荐）

适用于需要保留完整提交历史的场景。

```bash
# 1. 在新仓库创建空仓库（不初始化 README）

# 2. 在本地项目目录中
cd experience_os

# 3. 查看当前远程仓库
git remote -v

# 4. 添加新远程仓库
git remote add new-origin <新仓库地址>

# 5. 推送所有分支到新仓库
git push new-origin master

# 6. 切换默认远程仓库（可选）
git remote remove origin
git remote rename new-origin origin

# 7. 在新仓库验证
# - 检查 .gitignore 是否存在
# - 确认敏感文件未被提交
# - 检查 Vercel 配置是否正确
```

### 方法二：仅迁移最新代码（轻量）

适用于不需要历史记录，只需要当前状态的场景。

```bash
# 1. 创建新目录
mkdir experience_os_new
cd experience_os_new

# 2. 初始化空仓库
git init

# 3. 添加 .gitignore（必须先添加！）
# 从旧仓库复制 .gitignore 内容

# 4. 从旧仓库复制所有文件
cp -r ../experience_os/* .

# 5. 验证敏感文件已被排除
git status
# 确认没有敏感文件出现在 "Untracked files" 中

# 6. 添加并提交
git add .
git commit -m "init: 迁移项目到新仓库"

# 7. 推送到新远程仓库
git remote add origin <新仓库地址>
git push -u origin master
```

---

## 三、迁移后验证清单

### ✅ 必须验证

| 检查项 | 验证方法 |
|--------|---------|
| `.gitignore` 存在 | `ls -la .gitignore` |
| 敏感文件未提交 | `git log --all -- private-doc/deepseek/api-key-local.txt` |
| 构建成功 | `npm run build:h5` |
| 类型检查通过 | `npm run typecheck` |
| 测试通过 | `npm run test:evaluation` |

### ✅ 可选验证

| 检查项 | 验证方法 |
|--------|---------|
| Vercel 自动部署 | 查看 Vercel Dashboard |
| 演示数据可用 | 导入 `docs/demo-data-1-0630.md` |
| 模型配置正常 | 检查 `.env.example` |

---

## 四、文档清理策略

如需清理公开文档，可按以下步骤操作：

### 4.1 临时清理（保留本地）

```bash
# 取消文档的暂存状态
git rm --cached docs/*.md
git rm --cached 001_PRD/
git rm --cached private-doc/

# 提交变更
git commit -m "docs: 清理公开文档"

# 推送
git push origin master
```

### 4.2 永久清理（本地和远程）

```bash
# 删除文件（本地也会删除）
rm -rf docs/*.md
rm -rf 001_PRD/
rm -rf private-doc/

# 提交变更
git add .
git commit -m "docs: 永久删除公开文档"
git push origin master
```

### 4.3 清理后恢复

如需恢复文档，从旧仓库拉取：

```bash
# 添加旧仓库作为远程
git remote add old-origin <旧仓库地址>
git fetch old-origin

# 拉取指定文件
git checkout old-origin/master -- docs/
git checkout old-origin/master -- 001_PRD/
git checkout old-origin/master -- private-doc/

# 删除旧远程
git remote remove old-origin
```

---

## 五、环境变量迁移

### 5.1 本地环境变量

```bash
# 复制 .env.local 到新仓库目录
cp ../experience_os/.env.local .

# 验证 .env.local 在 .gitignore 中
grep ".env.local" .gitignore
```

### 5.2 Vercel 环境变量

在 Vercel Dashboard 中手动配置：

1. 进入新项目的 Settings → Environment Variables
2. 从旧项目复制以下变量：
   - `VITE_DEEPSEEK_API_KEY`
   - `VITE_DEEPSEEK_BASE_URL`
   - `VITE_DEEPSEEK_MODEL`
3. 保存并重新部署

---

## 六、常见问题

### Q1：迁移后构建失败？

**原因**：`node_modules` 未安装

**解决**：
```bash
npm install
npm run build:h5
```

### Q2：敏感文件被误提交了？

**原因**：`.gitignore` 未正确配置或添加顺序错误

**解决**：
```bash
# 从 Git 历史中彻底删除
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch private-doc/deepseek/api-key-local.txt' \
  --prune-empty -- --all

# 强制推送
git push origin master --force
```

### Q3：Vercel 部署后模型不可用？

**原因**：环境变量未配置

**解决**：在 Vercel Dashboard 添加环境变量并重新部署

---

## 七、迁移后建议

1. **备份旧仓库**：迁移完成后，建议保留旧仓库一段时间
2. **通知协作方**：如有其他开发者，通知他们更新远程仓库地址
3. **更新文档链接**：更新项目文档中的仓库链接引用
4. **验证完整流程**：从导入数据到规律发现，完整测试一遍
5. **设置保护分支**：在新仓库设置主分支保护，防止误操作

---

## 八、总结

迁移的核心原则：
1. **`.gitignore` 优先**：迁移前确保 `.gitignore` 已正确配置
2. **敏感文件零容忍**：绝对不提交任何包含密钥的文件
3. **验证再推送**：本地验证构建和测试通过后再推送
4. **文档按需处理**：根据仓库性质决定是否保留公开文档