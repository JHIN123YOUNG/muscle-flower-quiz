# 健肌传花：迁移到你的 GitHub Pages

这个文件包是网页的完整静态版本，含 60 道双语题目、固定左右答题布局，以及“返回开始”按钮。无需安装程序、配置服务器或填写 API 密钥。

## 第一步：新建自己的仓库

1. 在电脑浏览器登录 GitHub。
2. 点击右上角“＋” → **New repository**。
3. 仓库名可填 **sarcopenia-quiz**。
4. 选择 **Public**，开启 **Add README**，然后点击 **Create repository**。

Public 表示仓库里的代码和题目可被别人查看。GitHub Free 支持公开仓库的 Pages；如果你想用私有仓库，先核对自己套餐和组织的限制。[GitHub Pages 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 第二步：上传解压后的文件

先在电脑上解压 ZIP。打开刚建好的仓库，选择 **Add file → Upload files**，上传下面这 7 个文件：

- index.html
- app.js
- game.js
- styles.css
- questions.json
- flower.svg
- README.zh-CN.md

上传的是这些文件本身，不是 ZIP，也不是外面包着它们的文件夹。完成后，仓库首页应直接看见 **index.html**。不要把文件放进 dist 或其他子文件夹。

填写一个提交说明，例如“Add quiz website”，选择提交到 **main**，再点击 **Commit changes**。若你的仓库要求通过 Pull request 提交，需先将更改合并进 main。[GitHub 上传文件说明](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

## 第三步：开启网页网址

在仓库中打开 **Settings → Pages**，然后设置：

- **Source**：Deploy from a branch
- **Branch**：main
- **Folder**：/(root)

点击 **Save**，等发布完成。使用 Pages 页面显示的实际网址或 **Visit site** 按钮打开网站。项目网址通常采用“https://你的用户名.github.io/仓库名/”的形式；这只是格式示例。[GitHub Pages 发布设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 第四步：检查迁移是否成功

1. 确认左边浅黄、右边浅蓝，两道题始终左右并排。
2. 每轮先选择左右难度；按“开始答题”后，同时显示两题并开始 20 秒计时，再按“有人举手・暂停”。
3. 分别确认两人的答案，最后按“显示答案”。
4. 点击“返回开始”并确认，检查下一次开始答题从第一轮开始。
5. 把 Pages 网址发给另一部设备打开，确认可直接使用。

手机屏幕较窄时建议横向使用；题目卡内可以上下滚动。不要用双击本地 index.html 的方式判断是否成功，因为游戏通过网页请求载入题库，需要用网站网址打开。

## 如果没有正常显示

- **出现 404**：确认已上传并提交到 main；Pages 选的是 main 与 /(root)，而且仓库根目录直接有 index.html。查看仓库的 Actions 页面是否仍在发布或报错。
- **题目未载入**：确认 questions.json、app.js、game.js 与 index.html 在同一级，文件名大小写没有改变。
- **修改后仍看到旧内容**：等待本次发布完成，再重新整理网页。必要时使用浏览器的强制重新整理。
- **找不到 Pages 设置或不能保存**：核对自己是否有仓库管理权限，以及套餐、组织策略是否允许 Pages。

## 迁移后的边界

- 原来的网址不会因此自动删除或改动；这会建立一个独立的 GitHub Pages 网站。
- 进度只保存在当前浏览器。新网址与原网址的来源不同，旧网址的回合和抽题历史不会自动迁移；新网址从新游戏开始。
- 每部设备独立游玩，没有实时同步。
- 文件包没有音乐或音频素材。
- questions.json 包含题目、正确答案和解说。它原本就是公开网页需要下载的数据；迁移后仍可被查看，不适合用作保密考试题库。
- 这是健康教育游戏，不能代替医疗评估。

更新版本：2026-10-16，每轮可选难度；点击开始后才揭题及计时。
