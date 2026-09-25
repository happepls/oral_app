# 已创建目标的场景编辑

## 范围与调用链复核

支持 active / paused 目标的场景标题、3 条子任务、删除、手动添加、AI 添加和
单场景重生成；不提供目标类型、语言、等级等元信息的编辑。

实际仓库与任务描述的差异：

- client 是 React 19 + CRA / react-app-rewired，现有测试使用 Jest，非 Vite / Vitest。
  本次沿用 Jest 与 Playwright，没有引入第二套前端测试运行器。
- `GoalSetting.js` 第 5 步确实在创建前编辑场景。当前创建调用是
  `/api/v1/ai/scenarios` → developer-api → AI `/generate-scenarios`，随后
  `/api/v1/goals` → developer-api 直接事务写入目标与任务。
  `/api/users/goals` → userController / User.createGoal 是另一条已有创建路径。
  两条路径及 10 场景 × 3 子任务的批量生成均保持原样。
- api-gateway 实际运行 Nginx，`server.js` 不在调用链中。
  Nginx 已将 `/api/v1/*` 路由至 developer-api，单场景代理在后者实现。
- `/goals` 原先通过 `/api/v1/goals?limit=100` 获取原始场景 JSONB，缺任务状态。
  现在使用已有 `/api/users/goals` 完整列表，获得 active / paused / archived
  目标及数据库叠加后的任务 ID、状态、分数、次数和代次。
  `/api/v1/goals/active` 的权威快照读取保持不变。
- User.getActiveGoal / getUserGoals 原各自叠加任务状态，现在和 PATCH 共用
  `models/goalScenarios.js::overlayGoalTasks`；缺任务或代次返回 null 代次，
  不把未知状态当作合法 generation=0。

## PATCH 协议

```http
PATCH /api/users/goals/7/scenarios
Content-Type: application/json
Cookie: accessToken=<httpOnly cookie>
```

同样支持 Bearer access token，经已有 `protect` 校验。路由显式挂 general 限流。
目标 owner 由登录身份确定，请求不能指定或覆盖 owner。

```json
{
  "scenarios": [
    {
      "title": "在餐厅点餐",
      "tasks": ["询问今日推荐菜", "说明主菜与熟度", "请求结账"],
      "image_url": "https://example.com/cover.png"
    }
  ]
}
```

场景 1–12 个；trim 后标题唯一且 1–100 字；每场景恰好 3 条不同的非空
子任务，每条 1–300 字。重复任务文本会产生身份歧义，因此同时拒绝。
可选 image_url 仅接受 HTTP(S)。沿用应用输入清洗，controller 白名单提取字段，
不信任客户端携带的 id/status/score/generation 等状态。

成功 200：`{ "success": true, "goal": <完整目标及任务叠加结果> }`。
前端以响应 goal 整体替换本地对象，不拼接旧任务状态。

| 状态 | 条件 | 错误信息 |
| --- | --- | --- |
| 400 | 数量、文本长度、唯一性或字段类型错误 | 中文 `data.errors: [{field,message}]` |
| 401 | 未登录或 token 无效 | 现有认证错误 |
| 404 | 目标不存在或非 owner | `goal_not_found` |
| 409 | 目标不是 active / paused | `goal_not_editable` |
| 409 | 修改/删除含 completed 的场景，或移除非 pending 任务 | `scenario_locked`，附 `locked_scenarios` |
| 409 | 评分正在持有任务锁 | `scenarios_busy`，稍后可重试 |
| 429 | 超过 general 限流 | 现有限流响应 |

### 事务对账

1. `BEGIN`；按 goal ID + owner 读取目标并 `FOR UPDATE`，检查状态。
2. 锁定该目标全部任务，使用 `FOR UPDATE NOWAIT`。评分现有顺序是先锁任务再
   更新目标；编辑持有目标锁时不能等待评分的任务锁，避免反向等待。
   `55P03` / `40P01` 回滚并转可重试 409。
3. 任一任务 completed 即锁定整个场景；标题和有序任务数组必须原样保留。
4. 以 `(scenario_title, task_description)` 对账：不变的行完整保留；被移除的
   pending 行删除；新组合插入默认 pending / score=0 的新行。
   选择删旧插新是为了用新 task ID 隔离旧评分窗口，无需修改世代规则。
5. 更新 JSONB、updated_at，并按既有 completed/total 公式重算目标完成度。
   未改场景的服务器 image_url 和其他元信息保留，防止旧编辑器覆盖新封面。
6. 同一事务内读取任务，调用共享叠加函数形成响应，然后 COMMIT。

并发 PATCH 在目标锁上串行化，最后一次成功保存的完整数组生效。
这里不提供乐观版本冲突合并；同时编辑者可能覆盖彼此未完成场景的修改。
completed 保护和 JSONB/任务表一致性始终由数据库事务强制。

任务评分阈值、窗口锁、generation、reset 与完成确认 API 未改。
不删除 MongoDB 会话、分析记录或历史评分记录；只删除替换掉的 pending 任务
以及外键级联清理的派生关键词缓存。无新增业务数据库迁移。

## 单场景生成

```http
POST /api/v1/ai/scenario
Idempotency-Key: <unique request key>
Content-Type: application/json
```

```json
{
  "target_language": "English",
  "target_level": "Intermediate",
  "type": "travel_survival",
  "interests": "Food, travel",
  "native_language": "Chinese",
  "exclude_titles": ["在机场办理登机", "在酒店入住"]
}
```

developer-api 沿用认证、`ai:generate` scope、限流与幂等机制，向 AI 服务
`POST /generate-scenario` 注入 `X-Guaji-Internal-Auth`。直接访问 AI 端点缺少
该服务密钥时为 401，防止利用 `/api/ai/*` 通配代理绕过用户认证。

AI 返回 `{"scenario":{"title":"…","tasks":["…","…","…"]}}`；
外层代理封装 `data`，前端 handleResponse 解包。仅生成建议，保存前不写数据库。
请求 exclude_titles 最多 12 个；使用目标信息和学生母语；JSON、字段、条数、
长度和重复任务强校验。模型提示禁止语义重复；服务端另拒绝标准化后同名和
高相似度标题，但没有宣称确定性的语义去重保证。

调用复用已白名单校验的 DashScope 地址、凭据、QWEN_TEXT_MODEL；模型调用
30 秒超时、代理 35 秒。输入错误 400，坏 JSON/不合规结果/上游失败 502，
内部配置缺失 503；失败可重试，不影响页面其他功能。生成与请求取消测试全部 stub，
未主动调用真实 DashScope。关闭编辑器中止浏览器等待，不保证供应商已开始的推理被取消。

## 编辑器与会话更新

- active / paused 卡片的「目标操作」菜单增加「编辑场景」。
- 复用 `AccessibleDialog` 的焦点限制、Escape、背景 inert 和焦点返回。
  标题、3 个子任务直接输入；每张未锁卡可删除或 AI 重生成。
- 完成场景整卡禁用并给出锁定原因。已有练习的场景提示修改风险；修改/删除
  有进度任务后显示具体警告，保存前再次确认。未变任务不清零。
- 手动/AI 添加最多 12 场景；重生成先确认。生成请求由一个 AbortController
  管理，同一时间最多一个。保存用同步 ref 防重复，失败保留输入及字段错误。
- 保存后发布带 user ID + goal ID 的同页事件和 storage 通知。
  同用户同目标的练习标签页先使旧回调失效、关闭 socket、清理重试与音频，
  再提示返回目标重新进入；不同目标和其他用户不受影响。
- 目标读取或 session 创建尚未完成时的通知也会保留，禁止迟到初始化在弹窗
  后再创建业务 socket。tour / daily_qa 不进入此监听流程。
- storage 通知限同源同浏览器。跨设备和禁用 storage 的其他标签页需重新进入；
  服务端新 task ID 仍保证旧评分无法写到替换任务。旧删除任务目前返回错误并
  冻结评分，不依赖原有 stale_generation / WS 4002 才保证安全。

## 文件与验证入口

- user-service：`routes/userRoutes.js`、`controllers/userController.js`、
  `middleware/goalScenarioValidation.js`、`models/user.js`、`models/goalScenarios.js`。
- AI：`app/main.py`、`app/scenario_generation.py`；代理：developer-api `src/app.js`。
- client：`Goals.js`、`GoalScenarioEditor.jsx`、`utils/goalScenarios.js`、
  `services/api.js`、`Conversation.js`、9 个 locale。
- 新测试：user-service `goalScenarios.test.js` / `goalScenarios.integration.test.js`；
  AI `test_single_scenario.py`；代理 `single-scenario.test.js`；client
  `goal-scenario-editor.test.js` / `goal-scenario-api.test.js` / Playwright 同名 spec。

```bash
npm --prefix services/user-service test -- --runInBand
# 真实 PostgreSQL 并发测试，专用 URL 通过环境注入；自动创建/删除随机测试 schema
GOAL_SCENARIOS_TEST_DATABASE_URL=<local-test-db-url> npm --prefix services/user-service test -- --runInBand
.venv/bin/python -m pytest services/ai-omni-service/tests -q
npm --prefix services/developer-api-service test
CI=true npm --prefix client test -- --watchAll=false --runInBand
npm --prefix client run lint
npm --prefix client run build
PLAYWRIGHT_BASE_URL=http://localhost:5001 npm --prefix client run test:e2e -- goal-scenario-editor.spec.js --project=chromium-390 --project=chromium-desktop
```

本地证据：`quality/artifacts/goal-scenario-editor/`（忽略提交）。验证结果在本次
交付中列明；截图仅使用测试数据，无用户对话或凭据。

### 本次运行结果（2026-09-25）

| 检查 | 结果 |
| --- | --- |
| user-service 基线 / 最终 | 178 / 213 passed；3 个既有监控集成跳过 |
| 新增真实 PostgreSQL 集成 | 14 项通过；随机 schema 隔离并清理 |
| AI pytest 基线 / 最终 | 287 / 312 passed，全离线 stub |
| developer-api 基线 / 最终 | 18 / 22 passed |
| client Jest 基线 / 最终 | 580 / 597 passed，53 suites |
| 新编辑器 Playwright | 8 passed，390×844 与 1440×900 |
| 原会话恢复 / 表达建议兼容回归 | 7 passed，390×844，退出码 0 |
| client 构建 / lint | 构建通过；0 errors、168 个既有 warnings |
| user-service / developer 新改代码 lint | 0 errors，原文件既有 warnings |
| 仓库 npm run verify | pass，100 分 |
| 独立复审 | 三项发现已修复；未解决 high/critical = 0，代码审查 ready |

独立复审补齐了三个原本容易被 mock 掩盖的问题：初始化请求延迟后重开旧 WS、
原列表仅返回 JSONB、任务查询失败被伪装成零分 pending。当前全部有对应回归；
列表任务查询失败直接返回 500，前端显示错误，不使用伪造的任务状态。

兼容回归首次 7 个断言完成后执行器停在清理阶段，已中断该次执行。
随后使用 `--workers=1 --reporter=line --trace=off --global-timeout=120000`
补验正常结束，7 passed / 1.2 分钟；保留首次及补验日志，不把中断执行计为通过。

本地已构建并启动 user / developer-api / AI，前端重新构建后 host、容器、HTTP
返回的 `main.f31dc6d9.js` 内容一致。实际 HTTP 检查：目标列表 200 且任务字段齐全；
未认证 PATCH 401、未知目标 PATCH 404、非法数组 400、非法生成 400、绕过代理直连
生成 401。这些请求未修改现有目标，也未触发真实模型。

手机与桌面截图已人工查看：无横向溢出，完成场景禁用提示、风险提示、固定保存栏
正常。参考目录 `figma_app_template/src/` / `html_template/` 在当前检出不存在，
使用仓库已有 AccessibleDialog 与 Goals 样式。未调用外部设计服务；专用技能的
通用静态 UI 扫描未运行，由组件交互测试、浏览器与截图验证覆盖本次界面。

新增 `qa_ui.*` 共 31 个键，en/zh 对应翻译，其余 7 个语言文件使用英文补位：

```text
edit_scenarios
scenario_close scenario_editor_help scenario_number scenario_edit_locked
scenario_title_label scenario_task_label scenario_regenerate scenario_regenerate_confirm
scenario_delete scenario_add_manual scenario_add_ai scenario_generating scenario_generate_failed
scenario_progress_help scenario_progress_warning scenario_progress_confirm
scenario_cancel scenario_save scenario_saving scenario_save_failed scenario_saved
scenario_count_error scenario_title_error scenario_duplicate_title
scenario_tasks_error scenario_task_error scenario_duplicate_task
scenario_session_changed_title scenario_session_changed scenario_return_goals
```

## 回滚

可先下线编辑入口及新 PATCH / 单场景生成路由，再回退对应服务版本；无需回滚
数据库结构，已有创建和练习主链路保持可用。已经保存的场景与新任务是正常数据，
旧版本仍可读取。回滚代码不会找回已被用户确认替换的 pending 进度；如需恢复，
必须使用保存前备份并单独核对，不能将旧窗口重挂到新 task ID。
