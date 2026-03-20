# Quota Bot Ops Checklist

## Preflight

- [ ] `npm run check`
- [ ] `npm test`
- [ ] 确认 `QUOTA_BOT_DB_PATH` 可写
- [ ] 确认 `QUOTA_BOT_RETENTION_DAYS` 合理
- [ ] 确认 `QUOTA_BOT_PUSH_ENABLED` 与阈值配置符合预期
- [ ] 确认 `QUOTA_BOT_TELEGRAM_BOT_TOKEN` 已设置
- [ ] 确认 `QUOTA_BOT_TELEGRAM_CHAT_ID` 已设置

## Manual smoke test

- [ ] 准备 fixture 或真实 adapter 数据源
- [ ] 运行 `QUOTA_BOT_RUN_ONCE=1 npm start`
- [ ] 验证首次启动完成一次采集
- [ ] 再运行一次，确认会生成至少一条 recent usage event
- [ ] 验证一次合并推送文本
- [ ] 模拟低 quota 或高 context，验证即时告警文本

## Query smoke checklist

- [ ] `总览`
- [ ] `会话列表`
- [ ] `最近消耗`
- [ ] `查看 <会话>`
- [ ] `订阅状态`

## Runtime watchpoints

- [ ] 快照量增长是否符合 retention 预期
- [ ] 推送是否被正确标记为 pushed
- [ ] 结束/缺失会话是否被标记 inactive
- [ ] quota 缺失时是否回退为 `暂无数据`

## Privacy boundary

- [ ] 未读取 message body
- [ ] 未存 message body
- [ ] 日志仅包含 session metadata
