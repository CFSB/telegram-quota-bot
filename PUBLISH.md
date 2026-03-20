# Publish to GitHub

当你已经在 GitHub 上创建好一个 public 仓库后，在这个目录执行：

```bash
cd exports/quota-bot-public
git init
git add .
git commit -m "Initial public release of quota-bot"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 建议

- 仓库名建议：`quota-bot` 或 `openclaw-quota-bot`
- 首次推送前，再确认 `apps/quota-bot/.env.example` 里没有填入真实密钥
- 真实运行时请复制 `.env.example` 为你自己的本地环境文件，不要提交到仓库
