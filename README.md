# 🍽️ dayoff-scheduler — 餐飲排休管理系統

## 快速部署（照著做就好）

### 第 1 步：在 GitHub 建立 Repository

1. 打開 https://github.com/new
2. Repository name 輸入：`dayoff-scheduler`
3. **不要勾選**任何 checkbox
4. 點 Create repository

### 第 2 步：推送到 GitHub

在終端機中，**進入這個資料夾後**，逐行執行：

```bash
git init
git add .
git commit -m "init: 餐飲排休管理系統"
git branch -M main
git remote add origin https://github.com/你的帳號/dayoff-scheduler.git
git push -u origin main
```

> 密碼要用 GitHub Personal Access Token，不是登入密碼
> 建立方式：https://github.com/settings/tokens → Generate new token (classic) → 勾 repo → 複製 ghp_ 開頭的 token

### 第 3 步：Netlify 部署

1. 登入 https://www.netlify.com/
2. Add new site → Import an existing project → 選 GitHub
3. 選 `dayoff-scheduler`
4. Build command: `npm run build`
5. Publish directory: `dist`
6. 點 Deploy site

### 第 4 步：啟用 Neon 資料庫

1. 在 Netlify 網站 Dashboard → 左側 **Extensions**
2. 搜尋 **Neon database** → **Install**
3. 回到你的網站 → Extensions → Neon → **Add database**
4. 點 **Claim database**（連結 Neon 帳號，避免 7 天過期）

### 第 5 步：重新部署

Netlify Dashboard → Deploys → **Trigger deploy** → Deploy site

### 完成！

開啟你的網址，標題旁看到綠色「已連線」就代表成功了。
多台裝置同時開啟，排休資料會每 3 秒自動同步。
