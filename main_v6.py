import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Dict, List, Optional

import requests
from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from main import app, api_key, WORKSPACE_ID


# ============================================================
# AI 音乐 + 最终 MP4 合成扩展
#
# 启动方式：
#   uvicorn main_v6:app --reload --port 8000
#
# 原 main.py 不修改，避免影响已经正常工作的剧本/图片/视频接口。
# ============================================================

OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 让浏览器可以直接访问生成后的 MP3 / MP4。
try:
    from fastapi.staticfiles import StaticFiles
    if not any(getattr(route, "path", None) == "/outputs" for route in app.routes):
        app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")
except Exception:
    pass


class MusicRequest(BaseModel):
    style: str = "电影感背景音乐"
    mood: str = "温暖、紧张、富有情绪变化"
    duration: str = "60秒"
    title: str = "AI视频"
    sound_effects: List[str] = Field(default_factory=list)


class ExportShot(BaseModel):
    video_url: str
    duration: Optional[str] = None


class ExportRequest(BaseModel):
    title: str = "AI视频"
    ratio: str = "9:16"
    shots: List[ExportShot]
    narrator_audio_url: Optional[str] = None
    music_url: Optional[str] = None
    character_audio: Dict[str, str] = Field(default_factory=dict)


def _safe_name(value: str, fallback: str = "video") -> str:
    value = re.sub(r"[^\w\-\u4e00-\u9fff]+", "_", value or "")
    return value[:80] or fallback


def _duration_seconds(value: str) -> int:
    if not value:
        return 5
    numbers = re.findall(r"\d+(?:\.\d+)?", value)
    if not numbers:
        return 5
    try:
        if len(numbers) >= 2 and ("-" in value or "~" in value):
            return max(1, int(round(float(numbers[-1]) - float(numbers[0]))))
        return max(1, int(round(float(numbers[-1]))))
    except Exception:
        return 5


def _find_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if path:
        return path
    candidates = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    raise RuntimeError(
        "没有找到 FFmpeg。请先安装 FFmpeg，并确保 ffmpeg.exe 已加入 Windows PATH，"
        "然后重新启动后端。"
    )


def _download(url: str, target: Path, timeout: int = 120) -> None:
    if not url or not url.strip():
        raise RuntimeError("下载地址不能为空")
    response = requests.get(url, stream=True, timeout=timeout)
    response.raise_for_status()
    with target.open("wb") as file:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                file.write(chunk)


def _extract_audio_url(response):
    output = getattr(response, "output", None)
    audio = getattr(output, "audio", None) if output else None
    url = getattr(audio, "url", None) if audio else None
    audio_id = getattr(audio, "id", None) if audio else None
    expires_at = getattr(audio, "expires_at", None) if audio else None

    if not url and isinstance(response, dict):
        output = response.get("output") or {}
        audio = output.get("audio") or {}
        url = audio.get("url")
        audio_id = audio.get("id")
        expires_at = audio.get("expires_at")

    return url, audio_id, expires_at


@app.post("/api/music/generate")
def generate_music(request: MusicRequest):
    if not api_key:
        return {
            "success": False,
            "error": "没有找到 DASHSCOPE_API_KEY，请检查 backend/.env",
        }

    prompt_parts = [
        f"背景音乐风格：{request.style.strip()}",
        f"音乐情绪：{request.mood.strip()}",
        "用于AI短视频背景音乐，要求纯音乐、无歌词、适合持续铺底，不抢旁白。",
    ]
    if request.sound_effects:
        prompt_parts.append("需要兼顾的场景音效氛围：" + "、".join(request.sound_effects[:12]))
    prompt = "；".join(prompt_parts)

    if len(prompt) > 2000:
        prompt = prompt[:2000]

    try:
        endpoint = (
            f"https://{WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com"
            "/api/v1/services/audio/music/generation"
        )
        payload = {
            "model": "fun-music-v1",
            "input": {
                "prompt": prompt,
                "is_instrumental": True,
                "format": "mp3",
                "enable_aigc_watermark": False,
            },
        }
        response = requests.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=120,
        )

        try:
            data = response.json()
        except Exception:
            data = {}

        if response.status_code >= 400:
            message = data.get("message") or data.get("error") or response.text[:1000]
            return {
                "success": False,
                "error": f"Fun-Music 调用失败：{message}",
                "status_code": response.status_code,
            }

        output = data.get("output") or {}
        audio = output.get("audio") or {}
        music_url = audio.get("url")
        if not music_url:
            return {
                "success": False,
                "error": "音乐服务返回成功，但没有找到音频地址",
                "raw": data,
            }

        return {
            "success": True,
            "model": "fun-music-v1",
            "music_url": music_url,
            "audio_id": audio.get("id"),
            "expires_at": audio.get("expires_at"),
            "duration": (data.get("usage") or {}).get("duration"),
            "prompt": prompt,
        }

    except requests.exceptions.RequestException as exc:
        return {
            "success": False,
            "error": f"音乐服务连接失败：{exc}",
        }
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
        }


@app.post("/api/export/generate")
def export_video(request: ExportRequest):
    if not request.shots:
        return {"success": False, "error": "没有可合成的视频片段"}

    ffmpeg = _find_ffmpeg()
    work_dir = Path(tempfile.mkdtemp(prefix="ai_video_export_", dir=str(OUTPUT_DIR)))

    try:
        # 1. 下载并统一所有视频片段。
        normalized: List[Path] = []
        for index, shot in enumerate(request.shots):
            if not shot.video_url:
                raise RuntimeError(f"第 {index + 1} 个视频片段地址为空")
            source = work_dir / f"source_{index:03d}.mp4"
            normalized_file = work_dir / f"normalized_{index:03d}.mp4"
            _download(shot.video_url, source)

            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-i", str(source),
                    "-map", "0:v:0",
                    "-an",
                    "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",
                    "-r", "25",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    str(normalized_file),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=300,
            )
            normalized.append(normalized_file)

        # 2. concat 视频。
        concat_file = work_dir / "concat.txt"
        with concat_file.open("w", encoding="utf-8") as file:
            for path in normalized:
                file.write("file '" + path.as_posix().replace("'", "'\\''") + "'\n")

        silent_video = work_dir / "silent.mp4"
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_file),
                "-c", "copy",
                "-movflags", "+faststart",
                str(silent_video),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=300,
        )

        # 3. 下载旁白/音乐（如果有）。
        narrator_file = None
        music_file = None
        if request.narrator_audio_url:
            narrator_file = work_dir / "narrator.mp3"
            _download(request.narrator_audio_url, narrator_file)
        if request.music_url:
            music_file = work_dir / "music.mp3"
            _download(request.music_url, music_file)

        # 4. 混音。
        final_name = f"{_safe_name(request.title, 'AI视频')}_{uuid.uuid4().hex[:8]}.mp4"
        final_path = OUTPUT_DIR / final_name

        if narrator_file and music_file:
            filter_complex = (
                "[1:a]aresample=48000,volume=1.0[narr];"
                "[2:a]aresample=48000,volume=0.22,aloop=loop=-1:size=2e+09[mus];"
                "[mus][narr]sidechaincompress=threshold=0.08:ratio=5:attack=20:release=250[duck];"
                "[duck][narr]amix=inputs=2:duration=first:dropout_transition=2[aout]"
            )
            command = [
                ffmpeg, "-y",
                "-i", str(silent_video),
                "-i", str(narrator_file),
                "-i", str(music_file),
                "-filter_complex", filter_complex,
                "-map", "0:v:0",
                "-map", "[aout]",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                "-movflags", "+faststart",
                str(final_path),
            ]
        elif narrator_file:
            command = [
                ffmpeg, "-y",
                "-i", str(silent_video),
                "-i", str(narrator_file),
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                "-movflags", "+faststart",
                str(final_path),
            ]
        elif music_file:
            command = [
                ffmpeg, "-y",
                "-i", str(silent_video),
                "-stream_loop", "-1",
                "-i", str(music_file),
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-filter:a", "volume=0.22",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                "-movflags", "+faststart",
                str(final_path),
            ]
        else:
            shutil.copy2(silent_video, final_path)
            command = None

        if command:
            subprocess.run(
                command,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=600,
            )

        # 角色音频目前先保留在请求结构中，不强行错误叠加到整条时间线；
        # 后续根据每个镜头的角色/时间轴再做精准混音。
        return {
            "success": True,
            "video_url": f"http://127.0.0.1:8000/outputs/{final_name}",
            "file_name": final_name,
            "title": request.title,
            "ratio": request.ratio,
            "shots": len(request.shots),
            "audio": {
                "narrator": bool(narrator_file),
                "music": bool(music_file),
                "character_audio_received": len(request.character_audio),
            },
        }

    except subprocess.CalledProcessError as exc:
        details = ""
        if exc.stderr:
            try:
                details = exc.stderr.decode("utf-8", errors="ignore")[-3000:]
            except Exception:
                details = str(exc.stderr)[-3000:]
        return {
            "success": False,
            "error": "FFmpeg 合成失败。",
            "details": details,
        }
    except requests.exceptions.RequestException as exc:
        return {
            "success": False,
            "error": f"下载素材失败：{exc}",
        }
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
        }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.get("/api/export/file/{file_name}")
def export_file(file_name: str):
    safe_name = os.path.basename(file_name)
    path = OUTPUT_DIR / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件不存在或已被清理")
    return FileResponse(path, media_type="video/mp4", filename=safe_name)
