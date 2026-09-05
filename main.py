import os
import json
import time
import uuid
from pathlib import Path
from typing import Optional

import requests

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

import dashscope


# =========================================================
# 环境变量
# =========================================================

load_dotenv()

api_key = os.getenv("DASHSCOPE_API_KEY")

# =========================================================
# 本地生成文件目录
# =========================================================
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
IMAGE_DIR = OUTPUT_DIR / "images"
VIDEO_DIR = OUTPUT_DIR / "videos"
AUDIO_DIR = OUTPUT_DIR / "audio"

for _directory in [
    OUTPUT_DIR,
    IMAGE_DIR / "characters",
    IMAGE_DIR / "scenes",
    IMAGE_DIR / "props",
    IMAGE_DIR / "shots",
    VIDEO_DIR / "shots",
    VIDEO_DIR / "final",
    AUDIO_DIR / "narrator",
    AUDIO_DIR / "characters",
    AUDIO_DIR / "music",
]:
    _directory.mkdir(parents=True, exist_ok=True)


def _download_file(url: str, target: Path, timeout: int = 180) -> None:
    """下载 AI 服务返回的临时文件到本地。"""
    target.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=timeout) as response:
        response.raise_for_status()
        with open(target, "wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)


def _local_url(path: Path) -> str:
    relative = path.relative_to(BASE_DIR).as_posix()
    return f"/{relative}"


def _save_source_metadata(local_file: Path, source_url: str) -> None:
    try:
        meta = local_file.with_suffix(local_file.suffix + ".source.json")
        meta.write_text(
            json.dumps({"source_url": source_url}, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        pass


def _resolve_remote_source(url: str) -> str:
    """如果前端传入本地 /outputs 地址，恢复对应的百炼临时源地址。"""
    if not url:
        return url

    if url.startswith("http://") or url.startswith("https://"):
        if "/outputs/" not in url:
            return url
        path_part = url.split("/outputs/", 1)[1].split("?", 1)[0]
        local_file = OUTPUT_DIR / Path(path_part)
    elif url.startswith("/outputs/"):
        local_file = OUTPUT_DIR / Path(url[len("/outputs/"):].split("?", 1)[0])
    else:
        return url

    meta = local_file.with_suffix(local_file.suffix + ".source.json")
    if meta.exists():
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
            return data.get("source_url") or url
        except Exception:
            pass

    return url


# =========================================================
# Qwen 文本模型
# =========================================================

client = OpenAI(
    api_key=api_key,
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)


# =========================================================
# 百炼工作空间
# =========================================================

WORKSPACE_ID = "ws-q0sgn6hbtr9ai85k"

dashscope.base_http_api_url = (
    f"https://{WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api/v1"
)


# =========================================================
# FastAPI
# =========================================================

app = FastAPI(
    title="AI Video Factory API",
    description="AI 一键短视频制作平台后端",
    version="6.0.0-local",
)

# 浏览器可直接访问本地生成的图片、视频、音频
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# 数据模型
# =========================================================

class ScriptRequest(BaseModel):
    prompt: str
    video_type: str = "AI漫剧"
    duration: str = "60秒"
    ratio: str = "9:16"


class ImageRequest(BaseModel):
    prompt: str
    size: str = "1536*2688"
    # 前端可传 character / scene / prop / shot，用于本地分类保存
    type: str = "shot"


# =========================================================
# 基础接口
# =========================================================

@app.get("/")
def root():
    return {
        "success": True,
        "message": "AI Video Factory API is running",
        "version": "5.0.0",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "AI Video Factory API",
        "text_model": "qwen-plus",
        "image_model": "wan2.7-image-pro",
    }


# =========================================================
# AI 剧本生成
# =========================================================

@app.post("/api/script/generate")
def generate_script(request: ScriptRequest):

    if not api_key:
        return {
            "success": False,
            "error": "没有找到 DASHSCOPE_API_KEY，请检查 backend/.env",
        }

    system_prompt = """
你是一名专业的AI短视频导演、编剧和分镜师。

你的任务是把用户的一个创意，转换成可以直接用于AI视频制作的完整项目方案。

必须考虑：

1. 故事完整性
2. 人物一致性
3. 场景一致性
4. 镜头连续性
5. AI绘图可执行性
6. AI视频生成可执行性
7. AI配音可执行性
8. 短视频节奏
9. 开头必须有吸引力
10. 中间必须有冲突
11. 结尾必须有悬念、反转或者强记忆点

请严格输出JSON。

不要输出Markdown。
不要输出```json。
不要在JSON前后添加任何解释。

JSON结构必须严格按照下面格式：

{
  "title": "项目标题",
  "summary": "故事概要",
  "style": "整体视觉风格",

  "characters": [
    {
      "id": "character_01",
      "name": "人物名称",
      "age": "年龄",
      "role": "人物身份",
      "appearance": "详细外貌",
      "clothing": "服装",
      "personality": "性格",
      "image_prompt": "用于AI生成该人物的详细提示词"
    }
  ],

  "scenes": [
    {
      "id": "scene_01",
      "name": "场景名称",
      "description": "场景描述",
      "image_prompt": "用于AI生成该场景的详细提示词"
    }
  ],

  "props": [
    {
      "id": "prop_01",
      "name": "道具名称",
      "description": "道具描述",
      "image_prompt": "用于AI生成该道具的提示词"
    }
  ],

  "shots": [
    {
      "id": "shot_01",
      "scene_id": "scene_01",
      "scene": 1,
      "duration": "0-6秒",
      "shot_type": "特写/近景/中景/远景",
      "camera": "镜头运动",
      "characters": ["character_01"],
      "description": "具体画面内容",
      "action": "人物动作",
      "dialogue": "对白或旁白",
      "image_prompt": "用于AI生成这一镜头画面的详细提示词",
      "video_prompt": "用于AI生成这一镜头视频的详细提示词"
    }
  ],

  "voice": {
    "narrator": {
      "enabled": true,
      "style": "旁白声音风格"
    },
    "characters": [
      {
        "character_id": "character_01",
        "voice_style": "角色声音风格"
      }
    ]
  },

  "music": {
    "style": "背景音乐风格",
    "mood": "音乐情绪"
  },

  "sound_effects": [
    "需要的音效1",
    "需要的音效2"
  ]
}

重要要求：

- 角色数量根据故事需要决定。
- 场景数量根据故事需要决定。
- 道具数量根据故事需要决定。
- 60秒视频建议生成8-12个镜头。
- 30秒视频建议生成5-8个镜头。
- 3分钟视频建议生成15-30个镜头。
- 5分钟视频建议生成25-45个镜头。
- 每个镜头必须有image_prompt。
- 每个镜头必须有video_prompt。
- 人物必须拥有固定的外貌和服装描述。
- 同一个人物在不同镜头中必须保持一致。
- image_prompt必须适合AI绘图模型。
- video_prompt必须适合AI视频生成模型。
- dialogue用于后续AI配音。
- 故事必须有明确的开始、发展、冲突和结尾。
"""

    user_prompt = f"""
请制作一个完整的 {request.duration} {request.video_type}。

画面比例：{request.ratio}

用户创意：

{request.prompt}

请根据以上要求生成完整AI视频制作方案。
"""

    try:

        response = client.chat.completions.create(
    model="qwen-plus",
    messages=[
        {
            "role": "system",
            "content": system_prompt,
        },
        {
            "role": "user",
            "content": user_prompt,
        },
    ],
    temperature=0.3,
    response_format={"type": "json_object"},
)

        content = response.choices[0].message.content

        if not content:
            return {
                "success": False,
                "error": "AI没有返回内容",
            }

        content = content.strip()

        # 清理 Markdown JSON
        if content.startswith("```json"):
            content = content[7:]

        elif content.startswith("```"):
            content = content[3:]

        if content.endswith("```"):
            content = content[:-3]

        content = content.strip()

        # =====================================================
        # JSON解析
        # =====================================================

        try:

            data = json.loads(content)

        except json.JSONDecodeError:

            start = content.find("{")
            end = content.rfind("}")

            if start == -1 or end == -1:

                return {
                    "success": False,
                    "error": "AI返回内容不是有效JSON",
                    "raw": content,
                }

            json_text = content[start:end + 1]

            try:

                data = json.loads(json_text)

            except json.JSONDecodeError as e:

                return {
                    "success": False,
                    "error": f"JSON解析失败：{str(e)}",
                    "raw": content,
                }

        # =====================================================
        # 确保数组字段存在
        # =====================================================

        if not isinstance(data.get("characters"), list):
            data["characters"] = []

        if not isinstance(data.get("scenes"), list):
            data["scenes"] = []

        if not isinstance(data.get("props"), list):
            data["props"] = []

        if not isinstance(data.get("shots"), list):
            data["shots"] = []

        # =====================================================
        # 返回
        # =====================================================

        return {
            "success": True,
            "project": {
                "title": data.get("title", "AI视频项目"),
                "video_type": request.video_type,
                "duration": request.duration,
                "ratio": request.ratio,
            },
            "script": data,
        }

    except Exception as e:

        return {
            "success": False,
            "error": str(e),
        }


# =========================================================
# AI 图片生成
# =========================================================

@app.post("/api/image/generate")
def generate_image(request: ImageRequest):

    if not api_key:

        return {
            "success": False,
            "error": "没有找到 DASHSCOPE_API_KEY，请检查 backend/.env",
        }

    if not request.prompt.strip():

        return {
            "success": False,
            "error": "图片提示词不能为空",
        }

    try:

        # 设置百炼 API Key
        dashscope.api_key = api_key

        # =====================================================
        # 根据前端传入尺寸生成图片
        # =====================================================

        response = dashscope.MultiModalConversation.call(

            model="wan2.7-image-pro",

            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "text": request.prompt
                        }
                    ]
                }
            ],

            stream=False,

            result_format="message",

            # Wan 2.7 图片模型的输出尺寸必须通过 parameters.size 传入。
            parameters={
                "size": request.size,
                "n": 1,
                "watermark": False,
            },
        )

        # =====================================================
        # 检查响应
        # =====================================================

        if not response:

            return {
                "success": False,
                "error": "百炼没有返回结果",
            }

        # =====================================================
        # 提取图片 URL
        # =====================================================

        image_url = None

        try:

            output = response.output

            choices = output.choices

            if choices:

                message = choices[0].message

                content = message.content

                if content:

                    for item in content:

                        # 字典形式
                        if isinstance(item, dict):

                            if item.get("image"):

                                image_url = item["image"]

                                break

                            if item.get("image_url"):

                                image_url = item["image_url"]

                                break

                        # 对象形式
                        else:

                            if hasattr(item, "image"):

                                image_url = item.image

                                break

                            if hasattr(item, "image_url"):

                                image_url = item.image_url

                                break

        except Exception:

            pass

        # =====================================================
        # 如果没有找到图片
        # =====================================================

        if not image_url:

            return {
                "success": False,
                "error": "百炼返回成功，但没有找到图片地址",
                "raw": str(response),
            }

        # =====================================================
        # 保存到本地
        # =====================================================

        type_dirs = {
            "character": IMAGE_DIR / "characters",
            "scene": IMAGE_DIR / "scenes",
            "prop": IMAGE_DIR / "props",
            "shot": IMAGE_DIR / "shots",
        }
        target_dir = type_dirs.get(request.type, IMAGE_DIR / "shots")
        target_file = target_dir / f"{request.type}_{uuid.uuid4().hex}.png"

        try:
            _download_file(image_url, target_file, timeout=120)
            _save_source_metadata(target_file, image_url)
            local_image_url = _local_url(target_file)
        except Exception as download_error:
            return {
                "success": False,
                "error": f"图片生成成功，但保存到本地失败：{download_error}",
                "image_url": image_url,
            }

        return {
            "success": True,
            "model": "wan2.7-image-pro",
            "image_url": image_url,
            "local_image_url": local_image_url,
            "prompt": request.prompt,
            "size": request.size,
        }

    except Exception as e:

        return {

            "success": False,

            "error": str(e),
        }
# =========================================================
# AI 视频生成 - Wan 2.7 图生视频
# =========================================================

from typing import Optional
import time
import requests


class VideoRequest(BaseModel):
    image_url: str
    prompt: str
    duration: int = 5
    ratio: str = "9:16"
    resolution: str = "720P"
    watermark: bool = False


@app.post("/api/video/generate")
def generate_video(request: VideoRequest):

    if not api_key:
        return {
            "success": False,
            "error": "没有找到 DASHSCOPE_API_KEY，请检查 backend/.env",
        }

    if not request.image_url.strip():
        return {
            "success": False,
            "error": "image_url 不能为空",
        }

    if not request.prompt.strip():
        return {
            "success": False,
            "error": "视频提示词不能为空",
        }

    # Wan 2.7 支持的时长范围
    if request.duration < 2 or request.duration > 15:
        return {
            "success": False,
            "error": "视频时长必须在 2-15 秒之间",
        }

    try:

        # =====================================================
        # Wan 2.7 图生视频接口
        # =====================================================

        source_image_url = _resolve_remote_source(request.image_url)

        video_api_url = (
            f"https://{WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com"
            "/api/v1/services/aigc/video-generation/video-synthesis"
        )

        headers = {
            "X-DashScope-Async": "enable",
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": "wan2.7-i2v-2026-04-25",
            "input": {
                "prompt": request.prompt,
                "media": [
                    {
                        "type": "first_frame",
                        "url": source_image_url,
                    }
                ],
            },
            "parameters": {
                "resolution": request.resolution,
                "ratio": request.ratio,
                "duration": request.duration,
                "prompt_extend": True,
                "watermark": request.watermark,
            },
        }

        # =====================================================
        # 创建视频任务
        # =====================================================

        response = requests.post(
            video_api_url,
            headers=headers,
            json=payload,
            timeout=60,
        )

        try:
            result = response.json()
        except Exception:
            return {
                "success": False,
                "error": "视频接口返回的不是有效 JSON",
                "status_code": response.status_code,
                "raw": response.text[:2000],
            }

        if response.status_code != 200:
            return {
                "success": False,
                "error": result.get("message", "视频任务创建失败"),
                "code": result.get("code"),
                "status_code": response.status_code,
                "raw": result,
            }

        # =====================================================
        # 获取 task_id
        # =====================================================

        output = result.get("output") or {}
        task_id = output.get("task_id")

        if not task_id:
            return {
                "success": False,
                "error": "视频任务创建成功，但没有返回 task_id",
                "raw": result,
            }

        # =====================================================
        # 自动轮询任务
        # =====================================================

        task_url = (
            f"https://{WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com"
            f"/api/v1/tasks/{task_id}"
        )

        max_attempts = 120

        for attempt in range(max_attempts):

            time.sleep(5)

            status_response = requests.get(
                task_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                },
                timeout=30,
            )

            try:
                status_result = status_response.json()
            except Exception:
                continue

            status_output = status_result.get("output") or {}

            task_status = status_output.get("task_status")

            # =================================================
            # 成功
            # =================================================

            if task_status == "SUCCEEDED":

                video_url = status_output.get("video_url")

                if not video_url:
                    return {
                        "success": False,
                        "error": "视频生成成功，但没有返回 video_url",
                        "task_id": task_id,
                        "raw": status_result,
                    }

                target_file = VIDEO_DIR / "shots" / f"shot_{uuid.uuid4().hex}.mp4"
                try:
                    _download_file(video_url, target_file, timeout=300)
                except Exception as download_error:
                    return {
                        "success": False,
                        "task_id": task_id,
                        "task_status": "SUCCEEDED",
                        "error": f"视频生成成功，但保存到本地失败：{download_error}",
                        "video_url": video_url,
                    }

                local_video_url = _local_url(target_file)
                return {
                    "success": True,
                    "task_id": task_id,
                    "task_status": "SUCCEEDED",
                    "video_url": local_video_url,
                    "remote_video_url": video_url,
                    "model": "wan2.7-i2v-2026-04-25",
                    "duration": request.duration,
                    "ratio": request.ratio,
                    "resolution": request.resolution,
                }

            # =================================================
            # 失败
            # =================================================

            if task_status == "FAILED":

                return {
                    "success": False,
                    "task_id": task_id,
                    "task_status": "FAILED",
                    "error": (
                        status_result.get("message")
                        or status_output.get("message")
                        or "Wan 2.7 视频生成失败"
                    ),
                    "raw": status_result,
                }

            # =================================================
            # 取消
            # =================================================

            if task_status == "CANCELED":

                return {
                    "success": False,
                    "task_id": task_id,
                    "task_status": "CANCELED",
                    "error": "视频任务已取消",
                }

        # =====================================================
        # 超时
        # =====================================================

        return {
            "success": False,
            "task_id": task_id,
            "task_status": "TIMEOUT",
            "error": "视频生成等待超时，请稍后使用 task_id 查询任务",
        }

    except requests.exceptions.Timeout:

        return {
            "success": False,
            "error": "连接 Wan 2.7 视频服务超时",
        }

    except Exception as e:

        return {
            "success": False,
            "error": str(e),
        }

# =========================================================
# AI 旁白 / 角色配音 - Qwen3-TTS
# =========================================================

class VoiceRequest(BaseModel):
    text: str
    voice: str = "Cherry"
    language_type: str = "Chinese"
    instructions: Optional[str] = None
    optimize_instructions: bool = False


@app.post("/api/voice/generate")
def generate_voice(request: VoiceRequest):

    if not api_key:
        return {
            "success": False,
            "error": "没有找到 DASHSCOPE_API_KEY，请检查 backend/.env",
        }

    text = request.text.strip()

    if not text:
        return {
            "success": False,
            "error": "配音文本不能为空",
        }

    # Qwen3-TTS-Flash 单次文本长度有限，避免发送明显超限内容
    if len(text) > 600:
        return {
            "success": False,
            "error": "单次配音文本不能超过600个字符，请拆分后生成",
        }

    allowed_languages = {
        "Chinese",
        "English",
        "German",
        "Italian",
        "Portuguese",
        "Spanish",
        "Japanese",
        "Korean",
        "French",
        "Russian",
        "Auto",
    }

    language_type = request.language_type
    if language_type not in allowed_languages:
        language_type = "Chinese"

    try:
        # 使用当前项目已经配置好的百炼工作空间地址
        dashscope.base_http_api_url = (
            f"https://{WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api/v1"
        )

        kwargs = {
            "model": "qwen3-tts-flash",
            "api_key": api_key,
            "text": text,
            "voice": request.voice or "Cherry",
            "language_type": language_type,
        }

        # 指令控制仅在需要时传递
        if request.instructions and request.instructions.strip():
            kwargs["instructions"] = request.instructions.strip()
            kwargs["optimize_instructions"] = request.optimize_instructions

        response = dashscope.MultiModalConversation.call(**kwargs)

        if not response:
            return {
                "success": False,
                "error": "语音服务没有返回结果",
            }

        # 统一读取 DashScope 响应
        output = getattr(response, "output", None)
        audio = getattr(output, "audio", None) if output else None
        audio_url = getattr(audio, "url", None) if audio else None
        audio_id = getattr(audio, "id", None) if audio else None
        expires_at = getattr(audio, "expires_at", None) if audio else None

        # 某些 SDK 版本可能返回字典对象
        if not audio_url and isinstance(response, dict):
            output = response.get("output") or {}
            audio = output.get("audio") or {}
            audio_url = audio.get("url")
            audio_id = audio.get("id")
            expires_at = audio.get("expires_at")

        if not audio_url:
            return {
                "success": False,
                "error": "语音生成成功，但没有找到 audio_url",
                "raw": str(response)[:3000],
            }

        voice_dir = AUDIO_DIR / "characters"
        target_file = voice_dir / f"voice_{uuid.uuid4().hex}.mp3"
        try:
            _download_file(audio_url, target_file, timeout=180)
            local_audio_url = _local_url(target_file)
        except Exception as download_error:
            return {
                "success": False,
                "error": f"语音生成成功，但保存到本地失败：{download_error}",
                "audio_url": audio_url,
            }

        return {
            "success": True,
            "model": "qwen3-tts-flash",
            "voice": request.voice or "Cherry",
            "language_type": language_type,
            "text": text,
            "audio_url": local_audio_url,
            "remote_audio_url": audio_url,
            "audio_id": audio_id,
            "expires_at": expires_at,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }

