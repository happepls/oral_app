# TTS、场景权限与每日问答翻译修复

## 授权与工件状态

来源：2026-10-11 用户提供的《修复生产 TTS、场景权限与每日问答翻译》计划，
并明确要求实施和验证。该请求批准本次实施，不批准合并或生产发布。

基线：`cb6b353cac49f68aa74303f33323ac93320bb3e3`（获取后的 `origin/master`）。
分支：`fix/production-tts-access-translation`。开始时工作区无未提交改动。

根目录六工件仍属于 `ai-native-sdlc-bootstrap`，PR #51 已合并，
但 `maintenance.md` 仍 pending；GitHub 当前无打开的 PR。
依 `docs/ai-sdlc.md`，缺少实际发布和观察证据时不能伪造旧循环完成或替换根工件。
因此保留原工件，将本次实现作为可审查的 draft PR；本文件不替代根工件，
也不将旧工件批准视为本次批准。转为 ready 前须由维护者协调单活跃工件状态。

## 已复核与未知项

- 用户提供的生产证据：部署标记 `cb6b353`，实际 Developer API 容器仍缺少 TTS
  身份头与权威权限快照；本轮未重新访问真实账号或生产容器。
- 最新合并源码已经具备 `identityHeaders(req)` 和 user-service `/internal/users/:id/access`
  转发，不能通过重复实现或读取前端订阅字段解决运行代码不一致。
- GitHub deployment 元数据最新记录仍标记 `cb6b353`；这不能证明容器实际代码。
- 旧代码进入 Zeabur 镜像的具体原因尚未证实：本轮无 Zeabur 构建日志、镜像清单、
  容器只读访问。不得将缓存、Root Directory 或热补丁任一假设写成根因。
- 当前前端恢复用户时直接读取 localStorage，不刷新服务器资料；翻译结果按数组下标
  写回，未绑定语言。已用真实组件及浏览器中的合成账号复现对应风险。

## 实现

- 保留服务端授权：Developer API 拒绝不完整的旧权限响应；Discovery 验证会员与
  每个场景的 allowed 字段，失败显示加载错误与重试，首次失败不渲染锁定卡片。
- 登录恢复先完成旧 token 的 Cookie 迁移，再读取服务器资料；Cookie 有效而缓存丢失
  也能恢复。取消/过期/失败均不把旧缓存当成认证成功。GET/PATCH profile 补齐
  `stripe_subscription_status`、`billing_source`、`prepaid_expires_at`，保留现有到期计时。
- 翻译绑定消息身份、原文和最新母语；消息/语言/页面变化取消请求并拒绝迟到响应。
  未标注语言的旧译文不复用。界面语言不参与目标语言选择。翻译失败提供重试。
- TTS 错误保留 HTTP 状态、错误码、请求 ID；上游 401 不清空主登录态。
  选中播放失败保留选中文字与重试入口。跟读 Recall 已有失败反馈与试听重试，沿用。
- Docker 构建生成源码摘要清单，启动时验证镜像文件与清单一致；`/health` 返回源码摘要。
  `buildIdentity.js --compare` 比较预期 checkout 与运行服务，旧健康接口也会失败。
- 发布验收脚本先比对运行代码，再使用专用测试账号真实登录获取 Cookie，检查资料、
  权威场景/评分快照、TTS 音频和同幂等键重放。脚本只输出布尔值/场景数，
  不保存凭据、Cookie、用户消息、译文或音频。

## 验证记录

实际执行：

- `npm run verify`：最终应用实现返回 `decision=pass`、score 100；client 648 tests，
  Developer API 27 tests，AI 401 passed/10 skipped，workflow 211 passed。
  client production build 成功。预付费字段补充后的完整验证已重跑。
- `npm --prefix services/developer-api-service test` 与 `npm run lint`：
  发布探针反例补充后 27 tests passed，lint 无 errors（既有 warnings 保留）。
- `CI=true npm --prefix client test -- --watchAll=false --runInBand profile-restore i18n`：
  20 tests passed，含服务器资料替换旧缓存与预付费会员到期。
- `.venv/bin/python -m pytest services/ai-omni-service/tests/test_scene_access.py -q`：
  28 passed、10 skipped；真实 AI HTTP middleware 执行，供应商/授权依赖为 mock。
  缺 Redis 的 settlement 用例未执行，不能计为 passed。
- `npm --prefix client run test:e2e -- --project=chromium-390 scene-recovery.spec.js scene-access.spec.js`：
  场景恢复 13 passed、1 skipped；含 generation=3、迟到消息、部分重置、票据重试和单业务 WS。
  同轮权限测试 2 passed、1 断言失败（匹配到两个 alert）；修正唯一定位后单独重跑
  `scene-access.spec.js`，3 passed。
- `npm --prefix client run test:e2e -- --project=chromium-390 daily-qa-translation.spec.js`：
  1 passed；服务器母语中文、目标日语、缓存日语、界面英语，开场白与后续回复都请求中文译文。
- `docker build -t oral-app-developer-api:tts-access-review services/developer-api-service`：
  最终镜像构建成功，ID `ca5b22661da8`，依赖从宿主复制。
  用临时本地容器和空 DB adapter 启动实际 `createApp`，执行
  `node services/developer-api-service/src/buildIdentity.js --compare http://127.0.0.1:32775/health`：
  exit 0，输出 `Running source matches expected checkout`；容器随后停止删除。
  这验证镜像代码/健康接口，不是数据库启动迁移或生产 TTS。
- `python3 scripts/sdlc.py validate` 与 `git diff --check`：exit 0。
  SDLC validate 仅验证原 bootstrap 工件，不能当成本次生命周期完成。

首次完整验证因新增 i18n keys 未覆盖所有 locale 失败，补齐九种语言后通过。
所有供应商音频、浏览器与发布探针自动测试均为合成数据；本轮未运行真实发布探针。
生产验收保持 pending，本地 mock 不代表生产修复。

独立 fresh-context review 找到的两项 P2 均已修复并补测试：恢复资料时丢失预付费
到期字段；发布探针仅验证免费账号 unlocked_count 而未逐项核对 allowed。
无已知未解决 high/critical；根工件协调和生产访问缺口仍阻止 release-ready。

额外 UI 检查：Discovery 截图、权限对话框、完成横幅和失败恢复 4 用例通过。
欢迎页 `chromium-390/welcome.png` 期望 387×338，实际 390×844，截图检查失败。
在 `/tmp/oral-app-tts-baseline-check` 的原始 `cb6b353` checkout 使用同一依赖、
端口 3100 单独运行 `ui-audit.spec.js --grep 'welcome has'`，同样 exit 1、相同尺寸错误。
当时保留基线、未扩大截图阈值；后续按用户明确要求恢复历史原图。
后续用户明确要求恢复裁剪前基线：定位到 `903af38` 仅将
`quality/baselines/ui/chromium-390/welcome.png` 从 390×844 意外裁为 387×338。
已从 `903af38^` 恢复原有 PNG（不是重新生成候选图），不改变欢迎页、其他基线或阈值。
文件 blob 为 `30f20d56d23f244122dfd6825262334a4b02a140`，与历史原图一致。
公共页 Cookie 恢复会收到测试桩明确返回的匿名 profile 401；UI 审计仅排除该 URL
对应的预期浏览器资源错误，继续检查其他控制台错误。
恢复后独立执行 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npm --prefix client run test:e2e -- --project=chromium-390 ui-audit.spec.js --grep 'welcome has'`：
1 passed，exit 0；截图、布局、可访问性及控制台审计通过。
首次并行浏览器命令在用例结束后 teardown 未退出，人工中断（exit 130），
不将该命令记为通过；后续独立浏览器命令单独记录。
使用显式 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101` 独立重跑
`goal-scenario-editor.spec.js conversion-fixes.spec.js daily-qa-translation.spec.js scene-access.spec.js`：
10 用例全部通过，但 teardown 再次不退出，最终中断为 exit 130。
浏览器进程收尾验证为 blocked；不继续无依据地重试，不声称完整 UI 命令通过。
单独权限与翻译命令 exit 0、完整仓库 verifier exit 0 的记录仍有效。

## 2026-10-11 本地容器复测

按用户要求在本地 Compose 环境重建 Developer API、user-service、ai-omni 镜像并重建容器。
前端重新 production build，重建 client 容器以解除旧验收目录挂载，使用当前 `client/build`。
Developer API 运行源码摘要与 checkout 相同；AI main.py 哈希与 checkout 相同。
前端 `main.4d7f7281.js` 的 host、容器、HTTP SHA-256 均为
`f90be5e9c8747a21fcd69dc25963f2af5900e92f830084e807fcb960deacfae8`。

实际测试账号由用户提供，未修改其语言、会员、目标或任务。登录签发 Cookie 成功；
当前账号为中文母语、英语目标、免费会员，权威快照为 10 场景/3 解锁，评分字段完整。
匿名 TTS 返回 401；最终容器复测认证 TTS 返回 200 audio/x-wav，61484 bytes，幂等重放一致。
这不能替代生产验收，也不代表本地已验证 Pro 真实账号或日语目标的真实会话。

真实翻译最初返回 500：宿主 7890 无代理监听，容器 trust_env=True 为 ConnectError，
同一 DashScope 域名直连可达。仅本地 Compose 的 AI NO_PROXY 增加公共中国域名，
重建容器后日语文本→Chinese 翻译返回 200，并包含中文译文。
8081 首页最初 502，因网关 root proxy 使用内部 Host 被 client host guard 拒绝；
root location 保留 `$host`，nginx 配置检查及 reload 成功，首页和欢迎页均返回 200。

当前 production bundle 上浏览器测试：`daily-qa-translation.spec.js scene-access.spec.js`
在 localhost:5001、chromium-390、workers=1 下 4 passed，exit 0；使用请求桩覆盖
日语目标/中文母语/英语 UI、免费/Pro/缺失权限状态。
欢迎页在 localhost:8081 上独立审计 1 passed，exit 0。
数据库容器未重建，未修改真实生产环境；日志/交接未保存密码、Cookie 或译文正文。

## 发布步骤（待人工批准）

1. 核对 Zeabur 的项目/环境/服务 ID、Git repo、branch、Root Directory 和 Dockerfile，
   读取构建日志，明确构建来源。记录部署 ID、镜像 ID/digest 和所选 Git 提交。
   Developer API Root Directory 应为 `services/developer-api-service`；Node 依赖在宿主准备。
2. 按最终合并提交构建、部署后端，先验证 user-service 权威快照和 AI 鉴权，
   再验证 Developer API 转发。不得仅凭 Git SHA 或 RUNNING 放行。
3. 从预期合并提交 checkout 计算摘要，比较容器内实际清单与运行健康接口：
   `node services/developer-api-service/src/buildIdentity.js --compare <private-health-url>`。
   容器内执行 `node src/buildIdentity.js` 应与 checkout 一致；不要输出环境变量或密钥。
4. 在可访问私有健康接口的受控环境，通过环境变量提供发布验收输入：
   `RELEASE_BASE_URL`、`RELEASE_DEVELOPER_HEALTH_URL`、`RELEASE_TEST_EMAIL`、
   `RELEASE_TEST_PASSWORD`、`RELEASE_EXPECT_MEMBERSHIP`（active/free）、
   `RELEASE_EXPECT_NATIVE_LANGUAGE`、`RELEASE_EXPECT_TARGET_LANGUAGE`、
   `RELEASE_EXPECT_SCENARIOS`、`RELEASE_EXPECT_UNLOCKED`。
   运行 `node scripts/release/verify-tts-access.mjs`。使用预先准备好的专用测试账号，
   Pro 的 10 场景期望 10 解锁；免费、过期和预付费账号期望沿用服务器规则。
   此步骤会真实登录并调用付费 TTS，不能冒用受影响真实用户或用 mock 代替结果。
5. 后端契约通过后才发布 client。比较 host build、容器与 HTTP 返回的 `main.*.js`
   文件摘要；在浏览器验收选中播放、跟读试听、场景进入，以及中文母语/日语目标语言
   下的开场白和后续回复译文。检查失败重试、切题迟到响应和业务 WS 数量为 1。
6. 保留所有必需 CI checks、人工 PR review 和发布批准。无数据库迁移。
   回滚本 PR 的代码与客户端 bundle，保留现有服务端授权；不得回退到无鉴权 AI。

## 尚未完成的验收

- Zeabur 旧代码构建来源诊断、最终容器与 HTTP bundle 对比。
- 部署后使用专用测试账号的真实 Cookie→Developer API→AI→供应商音频链路。
- 生产 Pro 10 场景、免费/过期/预付费场景规则、翻译与试听的人工浏览器验收。
- 旧 SDLC 工件的实际发布/维护证据协调；不能用本次本地验证代替。
