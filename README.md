# CineNotion

一个去 AI、去批量的 TMDB 到 Notion 同步工具。它会从 TMDB 获取电影/剧集元数据，你手动填写资源参数，然后同步到你的 Notion 数据库。

## 对应你的 Notion 字段

截图里的字段会这样写入：

| Notion 字段 | 来源 |
| --- | --- |
| 标题 | 可编辑，默认 `原名 年份` |
| 发行年份 | TMDB 自动获取，可编辑 |
| 封面 | TMDB 海报，可切换 |
| 导演 | TMDB 自动获取，可编辑 |
| 演员 | TMDB 前 10 位演员，可编辑 |
| 画质 | 手动选择 |
| 分辨率 | 手动选择 |
| 大小 | 手动输入 |
| 字幕 | 手动选择 |
| 115链接 | 手动输入 |
| 标签 | TMDB 类型标签，可编辑 |
| 点评 | 手动输入，可留空 |

同步时会先用标题查重：同名页面存在就更新，不存在就新建。

## 准备 Notion

1. 在 Notion 创建 Integration，并复制 Token。
2. 打开你的数据库页面，右上角选择 `Add connections`，把这个 Integration 添加进去。
3. 复制数据库 ID。你提供的链接里这个 ID 可以先试：

```text
29cd8ec3828880b98ce1c64d35c259c2
```

如果同步时报 404，通常说明这个 ID 不是实际数据库 ID，或者 Integration 还没有被添加到数据库。

## 本地运行

复制 `.env.example` 为 `.env`，填入：

```text
TMDB_API_KEY=你的 TMDB API Key
NOTION_TOKEN=你的 Notion Integration Token
NOTION_DATABASE_ID=你的 Notion 数据库 ID
PORT=8787
```

安装并启动：

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:5173
```

## 生产运行

```bash
npm run build
npm start
```

生产服务默认使用 `PORT`，并托管打包后的前端页面。
