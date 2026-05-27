# TestWindow Handoff Template

Use this template only when the control center needs `TestWindow` to run a
real-scenario test that total control cannot perform itself.
Copy the filled section into `docs/workspace/current/alembic-test-exchange.md`.

````text
### Test-<编号>：<测试名称>

状态：待确认 / 待启动 / 执行中 / 待验收 / 已完成 / 阻塞 / 暂停
创建日期：YYYY-MM-DD
总控来源：<关联总控计划或用户请求>
执行窗口：TestWindow
目标项目：<真实测试项目 / fixture / mock project>

#### 测试目标

- <要证明的真实闭环>

#### 总控自测排除理由

- 为什么总控不能自己完成验证：
- 需要的真实场景 / 真实项目 / cold-start / rescan / Dashboard 手动观察 / 运行时监控 / 跨仓库环境证据：
- 已由总控自行完成的最小验证：

#### 测试前边界与多条件判断

- 测试要回答的问题：
- 测试对象 / 目标窗口 / 线程 / 项目边界：
- 总控可自测项：
- 必须交给 `TestWindow` 的真实场景条件：
- 成功能推出的结论：
- 失败能推出的结论：
- 不能推出的结论：
- 停止或不开始条件：

#### 非目标

- <本次不做什么，避免扩大范围>

#### 前置条件

- <需要的上游提交、配置、用户确认、数据策略、服务状态>

#### 执行范围

- 触发入口：
- 允许操作：
- 禁止操作：
- 允许读取：
- 禁止修改：

#### 观察点

- API / job 状态：
- Dashboard 状态：
- 日志信号：
- 文件 / 候选产物：
- 真实项目 git 状态：

#### 验收标准

- <通过标准>
- <失败 / 取消 / timeout 分类标准>

#### 建议命令或脚本

```bash
# 仅限需要真实场景的部分由 TestWindow 窗口按自身仓库脚本执行；
# 不依赖真实场景的脚本测试 / 文档校验 / targeted probe 应由总控先完成。
```

#### 回填要求

- 测试结论：
- 边界命中情况：
- 执行范围：
- 使用配置：
- job id / session id：
- Dashboard URL 摘要：
- 状态变化：
- 候选 / 产物数量：
- 关键日志信号：
- 真实项目是否干净：
- 详细报告路径：
- 遗留风险：
- 下一步建议：
- 建议归属窗口：
````
