## 风险卡

- 用户可感知的目标
- 级别（主干 / 枝干 / 叶子）及真实调用链、数据或事件消费者
- 最危险的失败方式及验证场景
- Diff 链接

<!-- sdlc-pr-evidence:start -->
- Base SHA `填目标分支的完整 SHA`
- Merge base SHA `填 git merge-base BaseSHA HeadSHA 的完整输出`
- Head SHA `填 PR 分支的完整 SHA`

| 验证命令 | 退出码 | 日志或 CI 工件 |
| --- | --- | --- |
|  | 待填 | [脱敏证据](https://) |
<!-- sdlc-pr-evidence:end -->

用反引号包裹实际执行的命令，填写数字退出码及 HTTPS 证据链接。

## 评审与合并

- 最高风险负向场景的结果，必要的版本兼容结果
- UI 截图或录屏及桌面、移动端结果（涉及 UI 时）
- 独立评审链接，主干额外复核链接，未关闭 findings 与 `unknown`
- 责任人核对的 Head、必需检查和审批链接

## 发布验收

- 发布顺序、实际部署 SHA、探针与观察窗口
- 适用的服务端开关、灰度判定、回滚步骤及结果链接

填写审查规则中和本 PR 有关的项目。未能验证的结果写 `unknown`。证据只附脱敏摘要和合成账号产物。[审查规则](https://github.com/happepls/oral_app/blob/master/REVIEW.md)
