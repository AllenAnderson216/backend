# AI短视频一键出片平台（本地版骨架）

自动完成：剧本 → 分镜拆解 → 资产清单 → 图片生成 → 配音 → 视频生成 → 合成，
一个接口触发，后台自动跑完整条流水线。

## 环境准备

1. 安装 Python 3.10+
2. 安装 FFmpeg，并确认命令行能直接运行 `ffmpeg -version`
   - Windows: 去 https://ffmpeg.org/download.html 下载，解压后把 `bin` 目录加到系统PATH
   - Mac: `brew install ffmpeg`
3. 安装依赖：
   ```
   pip install -r requirements.txt
   ```
4. 复制 `.env.example` 为 `.env`，先不填key也能跑（见下方"先跑通再接真实API"）

## 启动

```
uvicorn main:app --reload
```

启动后访问 http://127.0.0.1:8000/docs 就有一个可视化的接口测试页面（Swagger UI）。

## 先跑通流程，再接真实API

**这套骨架的关键设计**：`.env` 里 `IMAGE_API_KEY` 和 `TTS_API_KEY` 留空时，
图片生成会自动画占位图（把prompt文字印在色块上），配音会自动生成对应时长的静音音频，
视频生成在没配可灵key时会自动用"图片+缓慢放大"的方式（Ken Burns效果）拼出视频片段。

也就是说，**什么API key都不填，也能完整跑通一遍流程**，最后拿到一条"内容不对但结构完整"的视频，
用来验证整条流水线有没有问题。确认没问题后，再一步步把 `pipeline/` 目录下几个文件里标了 `TODO`
的地方替换成真实API调用：

- `pipeline/script.py`、`pipeline/storyboard.py`、`pipeline/assets.py`：已经接好通义千问，填了`QWEN_API_KEY`就能直接用
- `pipeline/image_gen.py`：`_call_wanxiang` / `_call_jimeng` 需要你对照官方最新文档补充（接口经常更新，没有把握写死）
- `pipeline/video_gen.py`：`_submit_kling_task` / `_poll_and_download` 同上，需要对照可灵官方文档补充JWT鉴权和轮询逻辑
- `pipeline/voiceover.py`：`_call_aliyun_tts` / `_call_tencent_tts` 建议直接用官方SDK，比手写HTTP请求省心

## 使用方式

1. 创建一个视频生成任务：
   ```
   POST /projects
   {"topic": "一个关于坚持晨跑的正能量故事"}
   ```
   返回 `project_id`，后台开始自动跑流水线

2. 查询进度：
   ```
   GET /projects/{project_id}
   ```
   `status` 字段会依次变化：created → script_done → storyboard_done → assets_done
   → images_done → audio_done → video_done → composed

3. 如果某一步报错，`error_message` 会有具体信息。修好问题（比如接口填对了、key补上了）后：
   ```
   POST /projects/{project_id}/retry
   ```
   会从上次成功完成的步骤继续，不用整条流程重跑

4. 下载成片：
   ```
   GET /projects/{project_id}/download
   ```

## 目录结构

```
ai_video_platform/
├── main.py              # FastAPI接口
├── config.py            # 读取.env配置
├── database.py          # SQLite连接
├── models.py            # 数据模型：Project/Scene/Asset
├── pipeline/
│   ├── script.py         # 剧本生成
│   ├── storyboard.py     # 分镜拆解
│   ├── assets.py         # 资产清单+定妆照
│   ├── image_gen.py      # 图片生成
│   ├── video_gen.py      # 视频生成（图生视频）
│   ├── voiceover.py      # 配音
│   ├── compose.py        # FFmpeg合成
│   └── runner.py         # 串联整条流水线，支持断点续跑
├── storage/              # 每个项目一个文件夹，存放中间产物和成片
├── app.db                # SQLite数据库文件（首次运行自动生成）
└── requirements.txt
```

## 后续可以加的东西

- 角色一致性：目前每个分镜出图时没有自动匹配用哪个资产的参考图，`runner.py` 里
  `_step_images` 函数留了注释说明怎么加（检测description提到哪个资产名，传对应reference_image_path）
- 简单的前端进度页面（现在只能用Swagger UI或者curl/Postman查状态）
- 字幕烧录（FFmpeg的drawtext或者ass字幕文件）
- 如果以后要跑得更快/更稳定，可以把BackgroundTasks换成Celery+Redis做真正的任务队列
