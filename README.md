# quota-bot-public

公开发布版目录，只包含：
- `apps/quota-bot/`
- `docs/plans/` 中与 quota-bot 相关的设计/实现文档

## 发布建议

- 建议作为 **独立 GitHub 仓库** 发布
- 当前目录已经去掉：
  - `node_modules/`
  - `dist/`
  - `data/`
  - SQLite 运行数据文件

## 下一步

1. 在 GitHub 新建一个 **public** 仓库
2. 把仓库 URL 发给我
3. 我来帮你把这个目录初始化、接 remote、推送上去

## 注意

运行时仍需自己配置环境变量，例如：
- `QUOTA_BOT_TELEGRAM_BOT_TOKEN`
- `QUOTA_BOT_TELEGRAM_CHAT_ID`

这些敏感值不会进入仓库。
