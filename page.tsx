"use client";

import { useState, type ReactNode } from "react";

type Character = {
  id?: string;
  name: string;
  age?: string;
  role?: string;
  appearance?: string;
  clothing?: string;
  personality?: string;
  description?: string;
  image_prompt?: string;
  image_url?: string;
};

type Scene = {
  id?: string;
  name?: string;
  description?: string;
  image_prompt?: string;
  image_url?: string;
};

type Prop = {
  id?: string;
  name?: string;
  description?: string;
  image_prompt?: string;
  image_url?: string;
};

type Shot = {
  id?: string;
  scene_id?: string;
  scene: number;
  duration: string;
  shot_type?: string;
  camera?: string;
  characters?: string[];
  description: string;
  action?: string;
  dialogue?: string;
  image_prompt?: string;
  video_prompt?: string;
  image_url?: string;
  video_url?: string;
};

type VoiceCharacter = {
  character_id: string;
  voice_style: string;
  audio_url?: string;
};

type ScriptData = {
  title: string;
  summary: string;
  narrator_audio_url?: string;
  music_url?: string;
  final_video_url?: string;
  style?: string;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  shots: Shot[];
  voice?: {
    narrator?: {
      enabled: boolean;
      style: string;
    };
    characters?: VoiceCharacter[];
  };
  music?: {
    style: string;
    mood: string;
  };
  sound_effects?: string[];
};

type ApiResult = {
  success: boolean;
  project?: {
    title: string;
    video_type: string;
    duration: string;
    ratio: string;
  };
  script?: ScriptData;
  script_raw?: string;
  error?: string;
};

type ImageType = "character" | "scene" | "prop" | "shot";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [videoType, setVideoType] = useState("AI漫剧");
  const [duration, setDuration] = useState("60秒");
  const [ratio, setRatio] = useState("9:16");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ScriptData | null>(null);
  const [project, setProject] =
    useState<ApiResult["project"]>(undefined);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("overview");

  const [imageGenerating, setImageGenerating] =
    useState<string | null>(null);

  const [batchImageGenerating, setBatchImageGenerating] =
    useState(false);
  const [videoGenerating, setVideoGenerating] =
    useState<string | null>(null);
  const [voiceGenerating, setVoiceGenerating] = useState<string | null>(null);
  const [musicGenerating, setMusicGenerating] = useState(false);
  const [fullVideoGenerating, setFullVideoGenerating] = useState(false);
  const [exportGenerating, setExportGenerating] = useState(false);

  const [batchImageProgress, setBatchImageProgress] = useState({
    current: 0,
    total: 0,
  });

  // ============================================================
  // 生成剧本
  // ============================================================

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert("请先输入你想制作的视频内容");
      return;
    }

    setGenerating(true);
    setResult(null);
    setProject(undefined);
    setError("");
    setActiveTab("overview");

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/api/script/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: `${prompt.trim()}\n\n【输出语言要求】请使用简体中文生成整个视频制作方案。人物、场景、道具、分镜描述、对白、旁白、AI绘图提示词、AI视频提示词等所有文本内容必须使用简体中文；不要输出英文提示词，不要中英混排。`,
            language: "zh-CN",
            video_type: videoType,
            duration,
            ratio,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`服务器错误：${response.status}`);
      }

      const data: ApiResult = await response.json();

      if (!data.success) {
        throw new Error(data.error || "AI生成失败");
      }

      if (data.project) {
        setProject(data.project);
      }

      if (data.script) {
        setResult(data.script);
        return;
      }

      if (!data.script_raw) {
        throw new Error("AI没有返回剧本内容");
      }

      let raw = data.script_raw.trim();

      raw = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      let scriptData: ScriptData;

      try {
        scriptData = JSON.parse(raw);
      } catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");

        if (start === -1 || end === -1) {
          throw new Error("AI返回内容不是有效JSON");
        }

        scriptData = JSON.parse(
          raw.substring(start, end + 1)
        );
      }

      setResult(scriptData);
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          "连接 AI 服务失败，请检查 FastAPI 是否正常运行。"
        );
      }
    } finally {
      setGenerating(false);
    }
  };

  // ============================================================
  // AI 图片生成
  // ============================================================

  const handleGenerateImage = async (
    type: ImageType,
    index: number,
    promptText: string
  ): Promise<string | false> => {
    if (!promptText.trim()) {
      alert("没有可用的AI绘图提示词");
      return false;
    }

    const key = `${type}-${index}`;

    setImageGenerating(key);
    setError("");

    let imageSize = "1536*2688";

    if (ratio === "16:9") {
      imageSize = "2688*1536";
    }

    if (ratio === "1:1") {
      imageSize = "2048*2048";
    }

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/api/image/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: `请根据以下中文提示词生成图片，不要自行翻译成英文：\n${promptText.trim()}`,
            language: "zh-CN",
            size: imageSize,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `图片服务器错误：${response.status}`
        );
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.error || "图片生成失败"
        );
      }

      const imageUrl =
        data.image_url ||
        data.images?.[0];

      if (!imageUrl) {
        throw new Error(
          "AI生成成功，但没有返回图片地址"
        );
      }

      setResult((current) => {
        if (!current) {
          return current;
        }

        const newResult: ScriptData = {
          ...current,
          characters: [...(current.characters || [])],
          scenes: [...(current.scenes || [])],
          props: [...(current.props || [])],
          shots: [...(current.shots || [])],
        };

        if (
          type === "character" &&
          newResult.characters[index]
        ) {
          newResult.characters[index] = {
            ...newResult.characters[index],
            image_url: imageUrl,
          };
        }

        if (
          type === "scene" &&
          newResult.scenes[index]
        ) {
          newResult.scenes[index] = {
            ...newResult.scenes[index],
            image_url: imageUrl,
          };
        }

        if (
          type === "prop" &&
          newResult.props[index]
        ) {
          newResult.props[index] = {
            ...newResult.props[index],
            image_url: imageUrl,
          };
        }

        if (
          type === "shot" &&
          newResult.shots[index]
        ) {
          newResult.shots[index] = {
            ...newResult.shots[index],
            image_url: imageUrl,
          };
        }

        return newResult;
      });

      return imageUrl;
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        alert(`图片生成失败：${err.message}`);
      } else {
        alert("图片生成失败");
      }

      return false;
    } finally {
      setImageGenerating(null);
    }
  };

  const handleGenerateVideo = async (
    index: number,
    imageUrl: string,
    prompt: string
  ): Promise<string | undefined> => {
    if (!imageUrl.trim()) {
      alert("请先生成该镜头图片，再生成视频");
      return;
    }

    if (!prompt.trim()) {
      alert("该镜头没有可用的视频提示词");
      return;
    }

    const key = `video-${index}`;
    const shotDuration = result?.shots?.[index]?.duration;
    const parsedDuration = Number.parseFloat(
      String(shotDuration ?? "").replace(/[^0-9.]/g, "")
    );
    const duration =
      Number.isFinite(parsedDuration) && parsedDuration > 0
        ? parsedDuration
        : 5;

    setVideoGenerating(key);
    setError("");

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/api/video/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url: imageUrl.trim(),
            prompt: `请严格按照以下中文视频提示词生成视频，不要自行改写成英文：\n${prompt.trim()}`,
            language: "zh-CN",
            duration,
            ratio,
            resolution: "720P",
          }),
        }
      );

      let data: {
        success?: boolean;
        video_url?: string;
        error?: string;
      };

      try {
        data = await response.json();
      } catch {
        throw new Error(
          `视频服务器返回了无效响应（HTTP ${response.status}）`
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || `视频生成失败（HTTP ${response.status}）`
        );
      }

      if (!data.video_url) {
        throw new Error(
          "视频生成成功，但服务器没有返回视频地址"
        );
      }

      setResult((current) => {
        if (!current) {
          return current;
        }

        const newResult: ScriptData = {
          ...current,
          characters: [...(current.characters || [])],
          scenes: [...(current.scenes || [])],
          props: [...(current.props || [])],
          shots: [...(current.shots || [])],
        };

        if (newResult.shots[index]) {
          newResult.shots[index] = {
            ...newResult.shots[index],
            video_url: data.video_url,
          };
        }

        return newResult;
      });

      return data.video_url;
    } catch (err) {
      console.error(err);

      alert(
        err instanceof Error
          ? `视频生成失败：${err.message}`
          : "视频生成失败，请检查后端服务"
      );
    } finally {
      setVideoGenerating(null);
    }
  };

  // ============================================================
  // AI旁白 / 角色声音 / 背景音乐 / 最终成片
  // ============================================================

  const readJsonResponse = async (response: Response) => {
    let data: any = {};
    try {
      data = await response.json();
    } catch {
      throw new Error(`服务器返回了无效响应（HTTP ${response.status}）`);
    }
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || `请求失败（HTTP ${response.status}）`);
    }
    return data;
  };

  const handleGenerateNarrator = async () => {
    if (!result?.voice?.narrator) {
      alert("当前剧本没有旁白配置");
      return;
    }
    const key = "narrator";
    setVoiceGenerating(key);
    try {
      const response = await fetch("http://127.0.0.1:8000/api/voice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "narrator",
          text: result.shots?.map((shot) => shot.dialogue || shot.description || "").filter(Boolean).join("\n"),
          style: result.voice.narrator.style,
          title: result.title,
        }),
      });
      const data = await readJsonResponse(response);
      const audioUrl = data.audio_url || data.voice_url || data.url;
      if (!audioUrl) throw new Error("旁白生成成功，但服务器没有返回音频地址");
      setResult((current) => current ? { ...current, narrator_audio_url: audioUrl } : current);
      return audioUrl;
    } catch (err) {
      alert(err instanceof Error ? `旁白生成失败：${err.message}` : "旁白生成失败");
    } finally {
      setVoiceGenerating(null);
    }
  };

  const handleGenerateCharacterVoice = async (characterId: string, voiceStyle: string) => {
    if (!result) return;
    const key = `character-${characterId}`;
    setVoiceGenerating(key);
    try {
      const dialogue = result.shots?.filter((shot) => shot.dialogue && shot.characters?.some((name) => name === characterId)).map((shot) => shot.dialogue).join("\n") ||
        result.shots?.filter((shot) => shot.dialogue).map((shot) => shot.dialogue).join("\n") || "";
      if (!dialogue.trim()) throw new Error("没有找到该角色可配音的台词");
      const response = await fetch("http://127.0.0.1:8000/api/voice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "character",
          character_id: characterId,
          text: dialogue,
          style: voiceStyle,
          title: result.title,
        }),
      });
      const data = await readJsonResponse(response);
      const audioUrl = data.audio_url || data.voice_url || data.url;
      if (!audioUrl) throw new Error("角色声音生成成功，但服务器没有返回音频地址");
      setResult((current) => {
        if (!current) return current;
        return {
          ...current,
          voice: {
            ...current.voice,
            characters: (current.voice?.characters || []).map((voice) =>
              voice.character_id === characterId ? { ...voice, audio_url: audioUrl } : voice
            ),
          },
        };
      });
      return audioUrl;
    } catch (err) {
      alert(err instanceof Error ? `角色声音生成失败：${err.message}` : "角色声音生成失败");
    } finally {
      setVoiceGenerating(null);
    }
  };

  const handleGenerateMusic = async () => {
    if (!result?.music) {
      alert("当前剧本没有背景音乐配置");
      return;
    }
    setMusicGenerating(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/api/music/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style: result.music.style,
          mood: result.music.mood,
          duration: project?.duration || duration,
          title: result.title,
          sound_effects: result.sound_effects || [],
        }),
      });
      const data = await readJsonResponse(response);
      const musicUrl = data.music_url || data.audio_url || data.url;
      if (!musicUrl) throw new Error("背景音乐生成成功，但服务器没有返回音频地址");
      setResult((current) => current ? { ...current, music_url: musicUrl } : current);
      return musicUrl;
    } catch (err) {
      alert(err instanceof Error ? `背景音乐生成失败：${err.message}` : "背景音乐生成失败");
    } finally {
      setMusicGenerating(false);
    }
  };

  const handleExportVideo = async () => {
    if (!result) return;
    const missingVideos = result.shots?.filter((shot) => !shot.video_url).length || 0;
    if (missingVideos > 0) {
      alert(`还有 ${missingVideos} 个分镜没有视频片段，请先生成全部视频。`);
      setActiveTab("video");
      return;
    }
    setExportGenerating(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/api/export/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          ratio,
          shots: result.shots?.map((shot) => ({ video_url: shot.video_url, duration: shot.duration })),
          narrator_audio_url: result.narrator_audio_url || null,
          music_url: result.music_url || null,
        }),
      });
      const data = await readJsonResponse(response);
      const videoUrl = data.video_url || data.output_url || data.download_url || data.url;
      if (!videoUrl) throw new Error("合成成功，但服务器没有返回MP4地址");
      setResult((current) => current ? { ...current, final_video_url: videoUrl } : current);
      setActiveTab("export");
    } catch (err) {
      alert(err instanceof Error ? `最终MP4合成失败：${err.message}` : "最终MP4合成失败");
    } finally {
      setExportGenerating(false);
    }
  };

  const handleOneClickGenerate = async () => {
    if (!result || fullVideoGenerating) return;
    setFullVideoGenerating(true);
    setError("");
    try {
      // 1. 视觉资产：逐项生成，记录分镜图片地址，避免依赖异步 state 刷新。
      const imageItems: { type: ImageType; index: number; prompt: string }[] = [];
      result.characters?.forEach((item, index) => { if (!item.image_url && (item.image_prompt || item.description)) imageItems.push({ type: "character", index, prompt: item.image_prompt || item.description || "" }); });
      result.scenes?.forEach((item, index) => { if (!item.image_url && (item.image_prompt || item.description)) imageItems.push({ type: "scene", index, prompt: item.image_prompt || item.description || "" }); });
      result.props?.forEach((item, index) => { if (!item.image_url && (item.image_prompt || item.description)) imageItems.push({ type: "prop", index, prompt: item.image_prompt || item.description || "" }); });
      result.shots?.forEach((item, index) => { if (!item.image_url && (item.image_prompt || item.description)) imageItems.push({ type: "shot", index, prompt: item.image_prompt || item.description || "" }); });

      const shotImages = (result.shots || []).map((shot) => shot.image_url || "");
      for (const item of imageItems) {
        const imageUrl = await handleGenerateImage(item.type, item.index, item.prompt);
        if (item.type === "shot" && imageUrl) shotImages[item.index] = imageUrl;
      }

      // 2. 视频片段：逐镜头生成，已经有视频的自动跳过。
      const shotVideos = (result.shots || []).map((shot) => shot.video_url || "");
      for (let i = 0; i < (result.shots || []).length; i++) {
        const shot = result.shots[i];
        const imageUrl = shotImages[i];
        if (!shotVideos[i] && imageUrl) {
          const videoUrl = await handleGenerateVideo(i, imageUrl, shot.video_prompt || shot.description || "");
          if (videoUrl) shotVideos[i] = videoUrl;
        }
      }

      // 3. 音频轨道。接口未配置时会明确提示，不会伪装成成功。
      let narratorUrl = result.narrator_audio_url;
      if (result.voice?.narrator && !narratorUrl) narratorUrl = await handleGenerateNarrator();
      const characterAudio: Record<string, string> = {};
      for (const voice of result.voice?.characters || []) {
        if (voice.audio_url) characterAudio[voice.character_id] = voice.audio_url;
        else {
          const url = await handleGenerateCharacterVoice(voice.character_id, voice.voice_style);
          if (url) characterAudio[voice.character_id] = url;
        }
      }
      let musicUrl = result.music_url;
      if (result.music && !musicUrl) musicUrl = await handleGenerateMusic();

      // 4. 最终MP4：直接使用本地结果数组，避免等待 React state 刷新。
      const missingVideos = shotVideos.filter(Boolean).length !== shotVideos.length;
      if (missingVideos) throw new Error("部分视频片段没有生成成功，请检查失败镜头后重试");
      const exportResponse = await fetch("http://127.0.0.1:8000/api/export/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          ratio,
          shots: (result.shots || []).map((shot, index) => ({ video_url: shotVideos[index], duration: shot.duration })),
          narrator_audio_url: narratorUrl || null,
          music_url: musicUrl || null,
          character_audio: characterAudio,
        }),
      });
      const exportData = await readJsonResponse(exportResponse);
      const finalUrl = exportData.video_url || exportData.output_url || exportData.download_url || exportData.url;
      if (!finalUrl) throw new Error("最终合成成功，但服务器没有返回MP4地址");
      setResult((current) => current ? { ...current, final_video_url: finalUrl, narrator_audio_url: narratorUrl, music_url: musicUrl } : current);
      setActiveTab("export");
      alert("🎉 整部视频已经生成完成！现在可以在「最终成片」中预览并下载MP4。");
    } catch (err) {
      alert(err instanceof Error ? `一键制作失败：${err.message}` : "一键制作失败，请检查后端服务");
    } finally {
      setFullVideoGenerating(false);
    }
  };

  // ============================================================
  // 一键生成全部图片
  // ============================================================

  const handleGenerateAllImages = async () => {
    if (!result) {
      alert("请先生成AI视频制作方案");
      return;
    }

    if (batchImageGenerating) {
      return;
    }

    const items: {
      type: ImageType;
      index: number;
      prompt: string;
    }[] = [];

    // 人物
    result.characters?.forEach((item, index) => {
      if (!item.image_url) {
        const prompt =
          item.image_prompt ||
          item.description ||
          "";

        if (prompt.trim()) {
          items.push({
            type: "character",
            index,
            prompt,
          });
        }
      }
    });

    // 场景
    result.scenes?.forEach((item, index) => {
      if (!item.image_url) {
        const prompt =
          item.image_prompt ||
          item.description ||
          "";

        if (prompt.trim()) {
          items.push({
            type: "scene",
            index,
            prompt,
          });
        }
      }
    });

    // 道具
    result.props?.forEach((item, index) => {
      if (!item.image_url) {
        const prompt =
          item.image_prompt ||
          item.description ||
          "";

        if (prompt.trim()) {
          items.push({
            type: "prop",
            index,
            prompt,
          });
        }
      }
    });

    // 分镜
    result.shots?.forEach((item, index) => {
      if (!item.image_url) {
        const prompt =
          item.image_prompt ||
          item.description ||
          "";

        if (prompt.trim()) {
          items.push({
            type: "shot",
            index,
            prompt,
          });
        }
      }
    });

    if (items.length === 0) {
      alert("所有视觉资产图片都已经生成完成！");
      return;
    }

    const confirmed = window.confirm(
      `即将自动生成 ${items.length} 张图片。\n\n` +
        `人物、场景、道具和分镜将逐张生成。\n` +
        `已经生成过的图片会自动跳过。\n\n` +
        `是否开始？`
    );

    if (!confirmed) {
      return;
    }

    setBatchImageGenerating(true);

    setBatchImageProgress({
      current: 0,
      total: items.length,
    });

    setError("");

    let successCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        const success =
          await handleGenerateImage(
            item.type,
            item.index,
            item.prompt
          );

        if (success) {
          successCount++;
        } else {
          failedCount++;
        }

        setBatchImageProgress({
          current: i + 1,
          total: items.length,
        });
      }

      if (failedCount === 0) {
        alert(
          `🎉 全部图片生成完成！\n\n共生成 ${successCount} 张图片。`
        );
      } else {
        alert(
          `图片生成完成。\n\n` +
            `成功：${successCount} 张\n` +
            `失败：${failedCount} 张\n\n` +
            `失败的图片可以单独重新生成。`
        );
      }
    } catch (err) {
      console.error(err);
      alert(
        "批量图片生成过程中出现异常，请检查后端服务。"
      );
    } finally {
      setBatchImageGenerating(false);
      setImageGenerating(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-gray-900">
      <div className="flex min-h-screen">

        {/* ================================================== */}
        {/* Sidebar */}
        {/* ================================================== */}

        <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white md:block">
          <div className="sticky top-0 p-5">

            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-lg text-white">
                ✦
              </div>

              <div>
                <h1 className="font-bold">
                  AI Video
                </h1>

                <p className="text-xs text-gray-400">
                  视频创作工厂
                </p>
              </div>
            </div>

            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              创作
            </p>

            <nav className="space-y-1">

              <SidebarItem
                icon="⌂"
                text="项目概览"
                active={activeTab === "overview"}
                onClick={() =>
                  setActiveTab("overview")
                }
              />

              <SidebarItem
                icon="✎"
                text="剧本"
                active={activeTab === "script"}
                onClick={() =>
                  setActiveTab("script")
                }
              />

              <SidebarItem
                icon="♟"
                text="人物资产"
                active={activeTab === "characters"}
                onClick={() =>
                  setActiveTab("characters")
                }
              />

              <SidebarItem
                icon="▣"
                text="场景资产"
                active={activeTab === "scenes"}
                onClick={() =>
                  setActiveTab("scenes")
                }
              />

              <SidebarItem
                icon="◆"
                text="道具资产"
                active={activeTab === "props"}
                onClick={() =>
                  setActiveTab("props")
                }
              />

              <SidebarItem
                icon="▤"
                text="智能分镜"
                active={activeTab === "shots"}
                onClick={() =>
                  setActiveTab("shots")
                }
              />

              <SidebarItem
                icon="🎨"
                text="AI图片"
                active={activeTab === "images"}
                onClick={() =>
                  setActiveTab("images")
                }
              />

              <SidebarItem
                icon="▶"
                text="AI视频"
                active={activeTab === "video"}
                onClick={() =>
                  setActiveTab("video")
                }
              />

              <SidebarItem
                icon="◉"
                text="AI配音"
                active={activeTab === "voice"}
                onClick={() =>
                  setActiveTab("voice")
                }
              />

              <SidebarItem
                icon="♫"
                text="音乐音效"
                active={activeTab === "music"}
                onClick={() =>
                  setActiveTab("music")
                }
              />

              <SidebarItem
                icon="□"
                text="最终成片"
                active={activeTab === "export"}
                onClick={() =>
                  setActiveTab("export")
                }
              />

            </nav>

            <div className="mt-10 rounded-2xl bg-gray-100 p-4">

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  AI创作额度
                </p>

                <span className="text-[10px] text-gray-400">
                  DEMO
                </span>
              </div>

              <div className="mt-2 flex items-end justify-between">
                <span className="text-2xl font-bold">
                  100
                </span>

                <span className="text-xs text-gray-400">
                  积分
                </span>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full w-2/3 rounded-full bg-black" />
              </div>

              <button className="mt-4 w-full rounded-xl bg-white px-3 py-2 text-xs font-medium shadow-sm">
                查看额度
              </button>

            </div>
          </div>
        </aside>

        {/* ================================================== */}
        {/* Main */}
        {/* ================================================== */}

        <section className="min-w-0 flex-1">

          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-5 backdrop-blur md:px-8">

            <div>
              <p className="text-sm font-medium">
                AI 视频工厂
              </p>

              <p className="hidden text-xs text-gray-400 sm:block">
                智能视频制作工作台
              </p>
            </div>

            <div className="flex items-center gap-3">

              <button className="hidden rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 sm:block">
                帮助
              </button>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
                A
              </div>

            </div>

          </header>

          <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">

            {!result && (
              <>
                <div className="mb-10 text-center">

                  <div className="mb-4 inline-flex rounded-full border border-gray-200 bg-white px-4 py-2 text-xs text-gray-500 shadow-sm">
                    ✨ AI 一键自动出片
                  </div>

                  <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
                    把一个想法
                    <br />
                    <span className="text-gray-400">
                      变成一条完整视频
                    </span>
                  </h2>

                  <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-gray-500 md:text-base">
                    AI 自动完成剧本、人物、场景、道具、分镜、图片、视频、配音、字幕和成片。
                  </p>

                </div>

                <CreatorCard
                  prompt={prompt}
                  setPrompt={setPrompt}
                  videoType={videoType}
                  setVideoType={setVideoType}
                  duration={duration}
                  setDuration={setDuration}
                  ratio={ratio}
                  setRatio={setRatio}
                  generating={generating}
                  handleGenerate={handleGenerate}
                  error={error}
                />

                <Workflow />
              </>
            )}

            {result && (
              <div>

                {/* Project header */}

                <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                    <div>

                      <div className="mb-2 flex items-center gap-2">

                        <span className="rounded-lg bg-black px-2.5 py-1 text-[10px] font-semibold text-white">
                          AI PROJECT
                        </span>

                        <span className="text-xs text-gray-400">
                          已完成AI策划
                        </span>

                      </div>

                      <h2 className="text-2xl font-bold md:text-3xl">
                        {result.title}
                      </h2>

                      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                        {result.summary}
                      </p>

                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">

                      <button
                        onClick={handleOneClickGenerate}
                        disabled={fullVideoGenerating}
                        className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Icon name="sparkles" size={15} />
                        {fullVideoGenerating ? "正在一键制作…" : "一键生成整部视频"}
                      </button>

                      {project && (
                        <>
                          <Tag text={project.video_type} />
                          <Tag text={project.duration} />
                          <Tag text={project.ratio} />
                        </>
                      )}

                    </div>

                  </div>

                  <div className="mt-6 border-t border-gray-100 pt-5">

                    <div className="mb-2 flex items-center justify-between text-xs">

                      <span className="text-gray-500">
                        项目制作流程
                      </span>

                      <span className="font-medium">
                        2 / 8
                      </span>

                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full w-[25%] rounded-full bg-black" />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-gray-400">

                      <span className="font-medium text-gray-900">
                        ✓ AI剧本
                      </span>

                      <span className="font-medium text-gray-900">
                        ✓ 资产
                      </span>

                      <span>○ 分镜</span>
                      <span>○ 图片</span>
                      <span>○ 视频</span>
                      <span>○ 配音</span>
                      <span>○ 音乐</span>
                      <span>○ 成片</span>

                    </div>

                  </div>

                </div>

                {/* Workspace navigation */}

                <div className="mb-6 overflow-x-auto">

                  <div className="flex min-w-max gap-2 rounded-2xl border border-gray-200 bg-white p-2">

                    <WorkspaceTab
                      active={activeTab === "overview"}
                      text="概览"
                      onClick={() =>
                        setActiveTab("overview")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "script"}
                      text="剧本"
                      onClick={() =>
                        setActiveTab("script")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "characters"}
                      text={`人物 ${
                        result.characters?.length || 0
                      }`}
                      onClick={() =>
                        setActiveTab("characters")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "scenes"}
                      text={`场景 ${
                        result.scenes?.length || 0
                      }`}
                      onClick={() =>
                        setActiveTab("scenes")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "props"}
                      text={`道具 ${
                        result.props?.length || 0
                      }`}
                      onClick={() =>
                        setActiveTab("props")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "shots"}
                      text={`分镜 ${
                        result.shots?.length || 0
                      }`}
                      onClick={() =>
                        setActiveTab("shots")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "images"}
                      text="AI图片"
                      onClick={() =>
                        setActiveTab("images")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "video"}
                      text="AI视频"
                      onClick={() =>
                        setActiveTab("video")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "voice"}
                      text="配音"
                      onClick={() =>
                        setActiveTab("voice")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "music"}
                      text="音乐"
                      onClick={() =>
                        setActiveTab("music")
                      }
                    />

                    <WorkspaceTab
                      active={activeTab === "export"}
                      text="成片"
                      onClick={() =>
                        setActiveTab("export")
                      }
                    />

                  </div>

                </div>

                {/* Content */}

                {activeTab === "overview" && (
                  <Overview
                    result={result}
                    setActiveTab={setActiveTab}
                  />
                )}

                {activeTab === "script" && (
                  <ScriptPanel result={result} />
                )}

                {activeTab === "characters" && (
                  <CharactersPanel
                    result={result}
                    imageGenerating={imageGenerating}
                    onGenerateImage={
                      handleGenerateImage
                    }
                  />
                )}

                {activeTab === "scenes" && (
                  <ScenesPanel
                    result={result}
                    imageGenerating={imageGenerating}
                    onGenerateImage={
                      handleGenerateImage
                    }
                  />
                )}

                {activeTab === "props" && (
                  <PropsPanel
                    result={result}
                    imageGenerating={imageGenerating}
                    onGenerateImage={
                      handleGenerateImage
                    }
                  />
                )}

                {activeTab === "shots" && (
                  <ShotsPanel
                    result={result}
                    imageGenerating={imageGenerating}
                    videoGenerating={videoGenerating}
                    onGenerateImage={handleGenerateImage}
                    onGenerateVideo={handleGenerateVideo}
                  />
                )}

                {activeTab === "images" && (
                  <ImagesPanel
                    result={result}
                    onGenerateAllImages={
                      handleGenerateAllImages
                    }
                    batchImageGenerating={
                      batchImageGenerating
                    }
                    batchImageProgress={
                      batchImageProgress
                    }
                  />
                )}

                {activeTab === "video" && (
                  <VideoPanel
                    result={result}
                    videoGenerating={videoGenerating}
                    onGenerateVideo={handleGenerateVideo}
                  />
                )}

                {activeTab === "voice" && (
                  <VoicePanel
                    result={result}
                    voiceGenerating={voiceGenerating}
                    onGenerateNarrator={handleGenerateNarrator}
                    onGenerateCharacterVoice={handleGenerateCharacterVoice}
                  />
                )}

                {activeTab === "music" && (
                  <MusicPanel
                    result={result}
                    musicGenerating={musicGenerating}
                    onGenerateMusic={handleGenerateMusic}
                  />
                )}

                {activeTab === "export" && (
                  <ExportPanel
                    result={result}
                    exportGenerating={exportGenerating}
                    fullVideoGenerating={fullVideoGenerating}
                    onOneClickGenerate={handleOneClickGenerate}
                    onExportVideo={handleExportVideo}
                  />
                )}

              </div>
            )}

          </div>
        </section>
      </div>
    </main>
  );
}

/* ============================================================
   Creator
============================================================ */

function CreatorCard({
  prompt,
  setPrompt,
  videoType,
  setVideoType,
  duration,
  setDuration,
  ratio,
  setRatio,
  generating,
  handleGenerate,
  error,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  videoType: string;
  setVideoType: (value: string) => void;
  duration: string;
  setDuration: (value: string) => void;
  ratio: string;
  setRatio: (value: string) => void;
  generating: boolean;
  handleGenerate: () => void;
  error: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">

      <div className="mb-4 flex items-center justify-between">

        <div>
          <h3 className="font-semibold">
            创建新视频
          </h3>

          <p className="mt-1 text-xs text-gray-400">
            描述你的想法，AI负责后面的制作规划
          </p>
        </div>

        <span className="hidden rounded-lg bg-gray-100 px-3 py-1.5 text-[10px] text-gray-500 sm:block">
          AI WORKFLOW
        </span>

      </div>

      <textarea
        value={prompt}
        onChange={(e) =>
          setPrompt(e.target.value)
        }
        placeholder="例如：一个普通少年意外穿越到三国时代，遇到了赵云。他发现自己知道历史，一场战役即将失败，他决定改变历史，但最后发现真正的幕后黑手竟然是自己最信任的人……"
        className="h-44 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm leading-7 outline-none transition focus:border-gray-400 focus:bg-white"
      />

      <div className="mt-6 grid gap-6 md:grid-cols-3">

        <OptionGroup
          title="视频类型"
          options={[
            "AI漫剧",
            "故事短片",
            "知识类",
            "产品宣传",
          ]}
          value={videoType}
          onChange={setVideoType}
        />

        <OptionGroup
          title="视频时长"
          options={[
            "30秒",
            "60秒",
            "3分钟",
            "5分钟",
          ]}
          value={duration}
          onChange={setDuration}
        />

        <OptionGroup
          title="画面比例"
          options={[
            "9:16",
            "16:9",
            "1:1",
          ]}
          value={ratio}
          onChange={setRatio}
        />

      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-600">
          {error}
        </div>
      )}

      <div className="mt-7 flex flex-col gap-4 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <p className="text-xs text-gray-400">
            {generating
              ? "AI正在分析故事并生成完整制作方案……"
              : "AI将自动生成剧本、人物、场景、道具、分镜和提示词"}
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-xl bg-black px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating
            ? "AI正在制作方案..."
            : "✨ 一键生成制作方案"}
        </button>

      </div>
    </div>
  );
}

/* ============================================================
   Overview
============================================================ */

function Overview({
  result,
  setActiveTab,
}: {
  result: ScriptData;
  setActiveTab: (tab: string) => void;
}) {
  return (
    <div className="space-y-6">

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <StatCard
          icon="♟"
          label="人物"
          value={result.characters?.length || 0}
          onClick={() =>
            setActiveTab("characters")
          }
        />

        <StatCard
          icon="▣"
          label="场景"
          value={result.scenes?.length || 0}
          onClick={() =>
            setActiveTab("scenes")
          }
        />

        <StatCard
          icon="◆"
          label="道具"
          value={result.props?.length || 0}
          onClick={() =>
            setActiveTab("props")
          }
        />

        <StatCard
          icon="▤"
          label="分镜"
          value={result.shots?.length || 0}
          onClick={() =>
            setActiveTab("shots")
          }
        />

      </div>

      <div className="grid gap-6 lg:grid-cols-3">

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">

          <SectionTitle
            icon="✎"
            title="故事概要"
            description="AI自动创作的故事"
          />

          <div className="mt-5 rounded-2xl bg-gray-50 p-5 text-sm leading-7 text-gray-600">
            {result.summary}
          </div>

          {result.style && (
            <div className="mt-5">

              <p className="mb-2 text-xs font-medium text-gray-400">
                视觉风格
              </p>

              <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-600">
                {result.style}
              </div>

            </div>
          )}

        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

          <SectionTitle
            icon="⚡"
            title="制作流程"
            description="AI自动规划"
          />

          <div className="mt-5 space-y-3">

            <MiniStep
              number="01"
              text="AI剧本"
              done
            />

            <MiniStep
              number="02"
              text="人物与场景资产"
              done
            />

            <MiniStep
              number="03"
              text="智能分镜"
            />

            <MiniStep
              number="04"
              text="AI图片"
            />

            <MiniStep
              number="05"
              text="AI视频"
            />

            <MiniStep
              number="06"
              text="AI配音"
            />

            <MiniStep
              number="07"
              text="音乐与音效"
            />

            <MiniStep
              number="08"
              text="自动合成MP4"
            />

          </div>

        </div>

      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex items-center justify-between">

          <SectionTitle
            icon="▤"
            title="分镜预览"
            description="AI自动规划的镜头"
          />

          <button
            onClick={() =>
              setActiveTab("shots")
            }
            className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium hover:bg-gray-200"
          >
            查看全部
          </button>

        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">

          {result.shots
            ?.slice(0, 6)
            .map((shot, index) => (

              <div
                key={`${shot.id || shot.scene}-${index}`}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
              >

                <div className="flex items-center justify-between">

                  <span className="rounded-lg bg-black px-2.5 py-1 text-[10px] font-semibold text-white">
                    镜头 {shot.scene}
                  </span>

                  <span className="text-[11px] text-gray-400">
                    {shot.duration}
                  </span>

                </div>

                <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-600">
                  {shot.description}
                </p>

              </div>

            ))}

        </div>

      </div>

    </div>
  );
}

/* ============================================================
   Script
============================================================ */

function ScriptPanel({
  result,
}: {
  result: ScriptData;
}) {
  return (
    <div className="space-y-6">

      <PanelHeader
        icon="✎"
        title="完整剧本"
        description="AI根据你的创意自动生成"
      />

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

        <h3 className="text-xl font-bold">
          {result.title}
        </h3>

        <div className="mt-5 rounded-2xl bg-gray-50 p-6 text-sm leading-8 text-gray-600">
          {result.summary}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">

          <InfoBox
            label="视觉风格"
            value={
              result.style ||
              "AI自动规划"
            }
          />

          <InfoBox
            label="镜头数量"
            value={`${result.shots?.length || 0} 个镜头`}
          />

        </div>

      </div>

    </div>
  );
}

/* ============================================================
   Characters
============================================================ */

function CharactersPanel({
  result,
  imageGenerating,
  onGenerateImage,
}: {
  result: ScriptData;
  imageGenerating: string | null;
  onGenerateImage: (
    type: ImageType,
    index: number,
    prompt: string
  ) => Promise<string | false>;
}) {
  return (
    <div className="space-y-6">

      <PanelHeader
        icon="♟"
        title="人物资产"
        description="保持角色在不同镜头中的视觉一致性"
      />

      <div className="grid gap-5 lg:grid-cols-2">

        {result.characters?.map(
          (character, index) => {

            const imageKey =
              `character-${index}`;

            const prompt =
              character.image_prompt ||
              character.description ||
              "";

            return (
              <div
                key={`${character.id || character.name}-${index}`}
                className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
              >

                {character.image_url && (
                  <div className="mb-5 overflow-hidden rounded-2xl bg-gray-100">
                    <img
                      src={character.image_url}
                      alt={character.name}
                      className="max-h-[500px] w-full object-cover"
                    />
                  </div>
                )}

                <div className="flex items-start justify-between">

                  <div>
                    <p className="text-xl font-bold">
                      {character.name}
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      {character.role ||
                        "主要角色"}
                    </p>
                  </div>

                  <span className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs text-gray-500">
                    {character.age || "—"}
                  </span>

                </div>

                <div className="mt-6 space-y-4">

                  <InfoBox
                    label="外貌"
                    value={
                      character.appearance ||
                      character.description ||
                      "暂无"
                    }
                  />

                  <InfoBox
                    label="服装"
                    value={
                      character.clothing ||
                      "暂无"
                    }
                  />

                  <InfoBox
                    label="性格"
                    value={
                      character.personality ||
                      "暂无"
                    }
                  />

                  <PromptBox
                    label="AI人物绘图提示词"
                    value={prompt}
                  />

                  <button
                    onClick={() =>
                      onGenerateImage(
                        "character",
                        index,
                        prompt
                      )
                    }
                    disabled={
                      imageGenerating === imageKey
                    }
                    className="w-full rounded-xl bg-black py-3 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {imageGenerating === imageKey
                      ? "🎨 正在生成人物图片..."
                      : character.image_url
                        ? "🔄 重新生成人物图片"
                        : "🎨 生成人物图片"}
                  </button>

                </div>

              </div>
            );
          }
        )}

      </div>
    </div>
  );
}

/* ============================================================
   Scenes
============================================================ */

function ScenesPanel({
  result,
  imageGenerating,
  onGenerateImage,
}: {
  result: ScriptData;
  imageGenerating: string | null;
  onGenerateImage: (
    type: ImageType,
    index: number,
    prompt: string
  ) => Promise<string | false>;
}) {
  return (
    <div className="space-y-6">

      <PanelHeader
        icon="▣"
        title="场景资产"
        description="AI自动识别并规划所有场景"
      />

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

        {result.scenes?.map(
          (scene, index) => {

            const name =
              scene.name ||
              `场景 ${index + 1}`;

            const description =
              scene.description || "";

            const prompt =
              scene.image_prompt ||
              description;

            const imageKey =
              `scene-${index}`;

            return (
              <div
                key={`${name}-${index}`}
                className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
              >

                {scene.image_url ? (
                  <img
                    src={scene.image_url}
                    alt={name}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-gray-100 text-4xl">
                    🏞️
                  </div>
                )}

                <div className="p-6">

                  <h3 className="font-semibold">
                    {name}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    {description}
                  </p>

                  <PromptBox
                    label="AI绘图提示词"
                    value={prompt}
                  />

                  <button
                    className="mt-4 w-full rounded-xl bg-black py-3 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      imageGenerating === imageKey
                    }
                    onClick={() =>
                      onGenerateImage(
                        "scene",
                        index,
                        prompt
                      )
                    }
                  >
                    {imageGenerating === imageKey
                      ? "🎨 正在生成场景图片..."
                      : scene.image_url
                        ? "🔄 重新生成场景图片"
                        : "🎨 生成场景图片"}
                  </button>

                </div>
              </div>
            );
          }
        )}

      </div>
    </div>
  );
}

/* ============================================================
   Props
============================================================ */

function PropsPanel({
  result,
  imageGenerating,
  onGenerateImage,
}: {
  result: ScriptData;
  imageGenerating: string | null;
  onGenerateImage: (
    type: ImageType,
    index: number,
    prompt: string
  ) => Promise<string | false>;
}) {
  return (
    <div className="space-y-6">

      <PanelHeader
        icon="◆"
        title="道具资产"
        description="AI自动识别故事所需道具"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

        {result.props?.map(
          (prop, index) => {

            const name =
              prop.name ||
              `道具 ${index + 1}`;

            const description =
              prop.description || "";

            const prompt =
              prop.image_prompt ||
              description;

            const imageKey =
              `prop-${index}`;

            return (
              <div
                key={`${name}-${index}`}
                className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
              >

                {prop.image_url ? (
                  <img
                    src={prop.image_url}
                    alt={name}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-gray-100 text-3xl">
                    ◆
                  </div>
                )}

                <div className="p-5">

                  <div>
                    <p className="font-semibold">
                      {name}
                    </p>

                    <p className="text-xs text-gray-400">
                      道具资产
                    </p>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-gray-500">
                    {description}
                  </p>

                  <PromptBox
                    label="AI绘图提示词"
                    value={prompt}
                  />

                  <button
                    onClick={() =>
                      onGenerateImage(
                        "prop",
                        index,
                        prompt
                      )
                    }
                    disabled={
                      imageGenerating === imageKey
                    }
                    className="mt-4 w-full rounded-xl bg-black py-3 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {imageGenerating === imageKey
                      ? "🎨 正在生成道具图片..."
                      : prop.image_url
                        ? "🔄 重新生成道具图片"
                        : "🎨 生成道具图片"}
                  </button>

                </div>

              </div>
            );
          }
        )}

      </div>
    </div>
  );
}

/* ============================================================
   Shots
============================================================ */

function ShotsPanel({
  result,
  imageGenerating,
  videoGenerating,
  onGenerateImage,
  onGenerateVideo,
}: {
  result: ScriptData;
  imageGenerating: string | null;
  videoGenerating: string | null;
  onGenerateImage: (
    type: ImageType,
    index: number,
    prompt: string
  ) => Promise<string | false>;
  onGenerateVideo: (
    index: number,
    imageUrl: string,
    prompt: string
  ) => Promise<string | undefined>;
}) {
  return (
    <div className="space-y-6">

      <PanelHeader
        icon="▤"
        title="智能分镜"
        description="AI自动规划镜头语言和生成提示词"
      />

      <div className="space-y-5">

        {result.shots?.map(
          (shot, index) => {

            const imageKey =
              `shot-${index}`;

            const imagePrompt =
              shot.image_prompt ||
              shot.description ||
              "";

            return (
              <div
                key={`${shot.id || shot.scene}-${index}`}
                className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
              >

                <div className="flex flex-col gap-4 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between">

                  <div className="flex items-center gap-3">

                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-xs font-bold text-white">
                      {String(index + 1).padStart(
                        2,
                        "0"
                      )}
                    </span>

                    <div>

                      <p className="font-semibold">
                        镜头 {shot.scene}
                      </p>

                      <p className="text-xs text-gray-400">
                        {shot.duration}
                      </p>

                    </div>

                  </div>

                  <div className="flex flex-wrap gap-2">

                    {shot.shot_type && (
                      <Tag
                        text={shot.shot_type}
                      />
                    )}

                    {shot.camera && (
                      <Tag
                        text={shot.camera}
                      />
                    )}

                  </div>

                </div>

                <div className="grid gap-6 p-5 lg:grid-cols-2">

                  <div>

                    {shot.image_url && (
                      <div className="mb-5 overflow-hidden rounded-2xl bg-gray-100">
                        <img
                          src={shot.image_url}
                          alt={`镜头 ${shot.scene}`}
                          className="w-full object-cover"
                        />
                      </div>
                    )}
{shot.video_url && (
  <video
    src={shot.video_url}
    controls
    className="w-full rounded-2xl mt-4"
  />
)}

                    <p className="mb-2 text-xs font-semibold text-gray-400">
                      🎬 画面描述
                    </p>

                    <div className="rounded-2xl bg-gray-50 p-5 text-sm leading-7 text-gray-600">
                      {shot.description}
                    </div>

                    {shot.action && (
                      <div className="mt-4">

                        <p className="mb-2 text-xs font-semibold text-gray-400">
                          🎭 人物动作
                        </p>

                        <div className="rounded-2xl border border-gray-100 p-4 text-sm leading-6 text-gray-600">
                          {shot.action}
                        </div>

                      </div>
                    )}

                    {shot.dialogue && (
                      <div className="mt-4">

                        <p className="mb-2 text-xs font-semibold text-gray-400">
                          🎙️ 台词 / 旁白
                        </p>

                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
                          {shot.dialogue}
                        </div>

                      </div>
                    )}

                  </div>

                  <div className="space-y-4">

                    <PromptBox
                      label="🎨 AI绘图提示词"
                      value={
                        shot.image_prompt ||
                        ""
                      }
                    />

                    <PromptBox
                      label="🎥 AI视频提示词"
                      value={
                        shot.video_prompt ||
                        ""
                      }
                    />

                    <div className="flex gap-3">
                      <button
                        onClick={() =>
                          onGenerateVideo(
                            index,
                            shot.image_url || "",
                            shot.video_prompt || shot.description || ""
                          )
                        }
                        disabled={
                          !shot.image_url ||
                          videoGenerating === `video-${index}`
                        }
                        className="flex-1 rounded-xl border border-gray-200 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        {videoGenerating === `video-${index}`
                          ? "🎬 正在生成视频..."
                          : shot.video_url
                            ? "🔄 重新生成视频"
                            : "🎬 生成视频"}
                      </button>
                      <button
                        onClick={() =>
                          onGenerateImage(
                            "shot",
                            index,
                            imagePrompt
                          )
                        }
                        disabled={
                          imageGenerating === imageKey
                        }
                        className="flex-1 rounded-xl bg-black py-3 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {imageGenerating === imageKey
                          ? "🎨 正在生成..."
                          : shot.image_url
                            ? "🔄 重新生成图片"
                            : "🎨 生成图片"}
                      </button>

                    </div>

                  </div>

                </div>

              </div>
            );
          }
        )}

      </div>
    </div>
  );
}

/* ============================================================
   Images
============================================================ */

function ImagesPanel({
  result,
  onGenerateAllImages,
  batchImageGenerating,
  batchImageProgress,
}: {
  result: ScriptData;
  onGenerateAllImages: () => void;
  batchImageGenerating: boolean;
  batchImageProgress: {
    current: number;
    total: number;
  };
}) {
  const characters =
    result.characters || [];

  const scenes =
    result.scenes || [];

  const props =
    result.props || [];

  const shots =
    result.shots || [];

  const generatedCharacters =
    characters.filter(
      (item) => item.image_url
    );

  const generatedScenes =
    scenes.filter(
      (item) => item.image_url
    );

  const generatedProps =
    props.filter(
      (item) => item.image_url
    );

  const generatedShots =
    shots.filter(
      (item) => item.image_url
    );

  const totalGenerated =
    generatedCharacters.length +
    generatedScenes.length +
    generatedProps.length +
    generatedShots.length;

  const totalAssets =
    characters.length +
    scenes.length +
    props.length +
    shots.length;

  return (
    <div className="space-y-6">

      <PanelHeader
        icon="🎨"
        title="AI图片"
        description="统一查看人物、场景、道具和分镜图片"
      />

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <h3 className="font-semibold text-gray-900">
              AI视觉资产
            </h3>

            <p className="mt-1 text-sm text-gray-400">
              自动生成全部人物、场景、道具和分镜图片
            </p>
          </div>

          <button
            onClick={onGenerateAllImages}
            disabled={batchImageGenerating}
            className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
              batchImageGenerating
                ? "cursor-not-allowed bg-gray-100 text-gray-400"
                : "bg-black text-white hover:opacity-80"
            }`}
          >
            {batchImageGenerating
              ? "🎨 正在生成..."
              : "🎨 一键生成全部图片"}
          </button>

        </div>

        {batchImageGenerating && (
          <div className="mt-5">

            <div className="flex items-center justify-between text-xs">

              <span className="font-medium text-gray-700">
                正在生成图片
              </span>

              <span className="text-gray-400">
                {batchImageProgress.current} /{" "}
                {batchImageProgress.total}
              </span>

            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">

              <div
                className="h-full rounded-full bg-black transition-all duration-500"
                style={{
                  width:
                    batchImageProgress.total >
                    0
                      ? `${
                          (batchImageProgress.current /
                            batchImageProgress.total) *
                          100
                        }%`
                      : "0%",
                }}
              />

            </div>

            <p className="mt-2 text-xs text-gray-400">
              正在逐张生成，请不要关闭当前页面
            </p>

          </div>
        )}

        {!batchImageGenerating && (
          <div className="mt-4 flex flex-wrap gap-2">

            <span className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              共 {totalAssets} 个视觉资产
            </span>

            <span className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              已生成 {totalGenerated} 个
            </span>

            <span className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              待生成{" "}
              {Math.max(
                totalAssets -
                  totalGenerated,
                0
              )}{" "}
              个
            </span>

          </div>
        )}

      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <StatCard
          icon="♟"
          label="人物图片"
          value={
            generatedCharacters.length
          }
          onClick={() => {}}
        />

        <StatCard
          icon="▣"
          label="场景图片"
          value={
            generatedScenes.length
          }
          onClick={() => {}}
        />

        <StatCard
          icon="◆"
          label="道具图片"
          value={
            generatedProps.length
          }
          onClick={() => {}}
        />

        <StatCard
          icon="▤"
          label="分镜图片"
          value={
            generatedShots.length
          }
          onClick={() => {}}
        />

      </div>

      {totalGenerated === 0 ? (

        <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
            🎨
          </div>

          <h3 className="mt-5 font-semibold">
            还没有生成图片
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-400">
            点击上方「一键生成全部图片」，系统会自动生成完整视觉资产。
          </p>

          <div className="mx-auto mt-6 max-w-lg rounded-2xl bg-gray-50 p-5 text-left">

            <p className="text-xs font-medium text-gray-400">
              当前项目
            </p>

            <p className="mt-2 font-semibold">
              {result.title}
            </p>

            <p className="mt-2 text-xs text-gray-400">
              {characters.length} 个人物 ·{" "}
              {scenes.length} 个场景 ·{" "}
              {props.length} 个道具 ·{" "}
              {shots.length} 个镜头
            </p>

          </div>

        </div>

      ) : (

        <div className="space-y-8">

          {generatedCharacters.length >
            0 && (
            <ImageSection
              title="人物图片"
              items={generatedCharacters.map(
                (item) => ({
                  name: item.name,
                  image_url:
                    item.image_url!,
                })
              )}
            />
          )}

          {generatedScenes.length >
            0 && (
            <ImageSection
              title="场景图片"
              items={generatedScenes.map(
                (item, index) => ({
                  name:
                    item.name ||
                    `场景 ${index + 1}`,
                  image_url:
                    item.image_url!,
                })
              )}
            />
          )}

          {generatedProps.length >
            0 && (
            <ImageSection
              title="道具图片"
              items={generatedProps.map(
                (item, index) => ({
                  name:
                    item.name ||
                    `道具 ${index + 1}`,
                  image_url:
                    item.image_url!,
                })
              )}
            />
          )}

          {generatedShots.length >
            0 && (
            <ImageSection
              title="分镜图片"
              items={generatedShots.map(
                (item, index) => ({
                  name: `镜头 ${
                    index + 1
                  }`,
                  image_url:
                    item.image_url!,
                })
              )}
            />
          )}

        </div>

      )}

    </div>
  );
}

/* ============================================================
   Image Section
============================================================ */

function ImageSection({
  title,
  items,
}: {
  title: string;
  items: {
    name: string;
    image_url: string;
  }[];
}) {
  return (
    <div>

      <div className="mb-4 flex items-center justify-between">

        <h3 className="font-semibold">
          {title}
        </h3>

        <span className="text-xs text-gray-400">
          {items.length} 张
        </span>

      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

        {items.map(
          (item, index) => (

            <div
              key={`${item.name}-${index}`}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >

              <img
                src={item.image_url}
                alt={item.name}
                className="aspect-[3/4] w-full object-cover"
              />

              <div className="p-4">

                <p className="text-sm font-medium">
                  {item.name}
                </p>

              </div>

            </div>

          )
        )}

      </div>
    </div>
  );
}

/* ============================================================
   Video
============================================================ */

function VideoPanel({
  result,
  videoGenerating,
  onGenerateVideo,
}: {
  result: ScriptData;
  videoGenerating: string | null;
  onGenerateVideo: (index: number, imageUrl: string, prompt: string) => Promise<string | undefined>;
}) {
  return (
    <div className="space-y-6">
      <PanelHeader
        icon="▶"
        title="AI视频"
        description="根据分镜图片和视频提示词生成视频片段"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {result.shots?.map((shot, index) => {
          const key = `video-${index}`;
          const prompt = shot.video_prompt || shot.description || "";
          const hasImage = Boolean(shot.image_url);

          return (
            <div
              key={`${shot.id || shot.scene}-${index}`}
              className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium">
                  镜头 {shot.scene}
                </span>
                <span className="text-xs text-gray-400">{shot.duration}</span>
              </div>

              {shot.video_url ? (
                <video
                  src={shot.video_url}
                  controls
                  playsInline
                  className="mt-4 w-full rounded-2xl bg-black"
                />
              ) : shot.image_url ? (
                <img
                  src={shot.image_url}
                  alt={`镜头 ${shot.scene}`}
                  className="mt-4 aspect-video w-full rounded-2xl object-cover"
                />
              ) : (
                <div className="mt-4 flex aspect-video items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-400">
                  请先生成分镜图片
                </div>
              )}

              <p className="mt-4 line-clamp-3 text-sm leading-6 text-gray-500">
                {shot.description}
              </p>

              <PromptBox label="🎥 AI视频提示词" value={prompt} />

              <button
                onClick={() => onGenerateVideo(index, shot.image_url || "", prompt)}
                disabled={!hasImage || videoGenerating === key}
                className="mt-5 w-full rounded-xl bg-black py-3 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {videoGenerating === key
                  ? "🎬 正在生成视频..."
                  : shot.video_url
                    ? "🔄 重新生成视频"
                    : "🎬 生成这个视频片段"}
              </button>

              {!hasImage && (
                <p className="mt-2 text-center text-[11px] text-gray-400">
                  请先在「分镜」或「AI图片」中生成该镜头图片
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Voice
============================================================ */

function VoicePanel({
  result,
  voiceGenerating,
  onGenerateNarrator,
  onGenerateCharacterVoice,
}: {
  result: ScriptData;
  voiceGenerating: string | null;
  onGenerateNarrator: () => Promise<string | undefined>;
  onGenerateCharacterVoice: (characterId: string, voiceStyle: string) => Promise<string | undefined>;
}) {
  return (
    <div className="space-y-6">
      <PanelHeader icon="mic" title="AI配音" description="旁白、角色声音统一生成，并可直接预览音频" />

      <div className="grid gap-5 md:grid-cols-2">
        {result.voice?.narrator && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400">旁白轨道</p>
                <h3 className="mt-2 font-semibold">AI旁白</h3>
                <p className="mt-3 text-sm leading-6 text-gray-500">{result.voice.narrator.style}</p>
              </div>
              <span className="rounded-xl bg-gray-100 p-3"><Icon name="mic" size={18} /></span>
            </div>
            {result.narrator_audio_url && <audio src={result.narrator_audio_url} controls className="mt-5 w-full" />}
            <button onClick={onGenerateNarrator} disabled={voiceGenerating === "narrator"} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-xs font-semibold text-white disabled:opacity-50">
              <Icon name="mic" size={15} />
              {voiceGenerating === "narrator" ? "正在生成旁白…" : result.narrator_audio_url ? "重新生成旁白" : "生成旁白"}
            </button>
          </div>
        )}

        {result.voice?.characters?.map((voice, index) => {
          const key = `character-${voice.character_id}`;
          const audioUrl = voice.audio_url;
          return (
            <div key={`${voice.character_id}-${index}`} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-400">角色声音</p>
                  <h3 className="mt-2 font-semibold">{voice.character_id}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-500">{voice.voice_style}</p>
                </div>
                <span className="rounded-xl bg-gray-100 p-3"><Icon name="user" size={18} /></span>
              </div>
              {audioUrl && <audio src={audioUrl} controls className="mt-5 w-full" />}
              <button onClick={() => onGenerateCharacterVoice(voice.character_id, voice.voice_style)} disabled={voiceGenerating === key} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-xs font-semibold text-gray-700 disabled:opacity-50">
                <Icon name="mic" size={15} />
                {voiceGenerating === key ? "正在生成角色声音…" : audioUrl ? "重新生成角色声音" : "生成角色声音"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold">台词列表</p>
        <div className="mt-5 space-y-3">
          {result.shots?.filter((shot) => shot.dialogue).map((shot, index) => (
            <div key={`${shot.id || shot.scene}-${index}`} className="rounded-2xl bg-gray-50 p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-medium">镜头 {shot.scene}</span><span className="text-[10px] text-gray-400">{shot.duration}</span></div>
              <p className="mt-2 text-sm leading-6 text-gray-600">{shot.dialogue}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Music
============================================================ */

function MusicPanel({ result, musicGenerating, onGenerateMusic }: {
  result: ScriptData;
  musicGenerating: boolean;
  onGenerateMusic: () => Promise<string | undefined>;
}) {
  return (
    <div className="space-y-6">
      <PanelHeader icon="music" title="音乐与音效" description="AI自动规划背景音乐、情绪和音效，并生成可预览音轨" />
      {result.music && (
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2"><InfoBox label="背景音乐风格" value={result.music.style} /><InfoBox label="音乐情绪" value={result.music.mood} /></div>
          {result.music_url && <audio src={result.music_url} controls className="mt-5 w-full" />}
          <button onClick={onGenerateMusic} disabled={musicGenerating} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-xs font-semibold text-white disabled:opacity-50">
            <Icon name="music" size={15} />
            {musicGenerating ? "正在生成背景音乐…" : result.music_url ? "重新生成背景音乐" : "生成背景音乐"}
          </button>
        </div>
      )}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="font-semibold">🔊 音效清单</p>
        <div className="mt-5 flex flex-wrap gap-3">{result.sound_effects?.map((effect, index) => <span key={`${effect}-${index}`} className="rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600">{effect}</span>)}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Export
============================================================ */

function ExportPanel({ result, exportGenerating, fullVideoGenerating, onOneClickGenerate, onExportVideo }: {
  result: ScriptData;
  exportGenerating: boolean;
  fullVideoGenerating: boolean;
  onOneClickGenerate: () => Promise<void>;
  onExportVideo: () => Promise<void>;
}) {
  const readyVideos = result.shots?.filter((shot) => shot.video_url).length || 0;
  const totalVideos = result.shots?.length || 0;
  return (
    <div className="space-y-6">
      <PanelHeader icon="film" title="最终成片" description="把视频片段、旁白和背景音乐合成为最终MP4" />
      {result.final_video_url ? (
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <video src={result.final_video_url} controls playsInline className="mx-auto max-h-[70vh] w-full rounded-2xl bg-black" />
          <a href={result.final_video_url} download className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-xs font-semibold text-white">
            <Icon name="download" size={15} /> 下载最终MP4
          </a>
        </div>
      ) : (
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100"><Icon name="film" size={34} /></div>
            <h3 className="mt-6 text-xl font-bold">{result.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">视频片段 {readyVideos}/{totalVideos} · {result.narrator_audio_url ? "旁白已就绪" : "旁白未生成"} · {result.music_url ? "音乐已就绪" : "音乐未生成"}</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3"><InfoBox label="分镜" value={`${totalVideos} 个`} /><InfoBox label="人物" value={`${result.characters?.length || 0} 个`} /><InfoBox label="画面比例" value={"项目设置"} /></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button onClick={onOneClickGenerate} disabled={fullVideoGenerating} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-sm font-semibold text-white disabled:opacity-50"><Icon name="sparkles" size={16} />{fullVideoGenerating ? "正在一键制作…" : "一键生成整部视频"}</button>
              <button onClick={onExportVideo} disabled={exportGenerating || readyVideos !== totalVideos} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-3.5 text-sm font-semibold text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="film" size={16} />{exportGenerating ? "正在合成MP4…" : "合成最终MP4"}</button>
            </div>
            {readyVideos !== totalVideos && <p className="mt-3 text-xs text-gray-400">请先完成全部分镜视频，才能合成最终MP4。</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Workflow
============================================================ */

function Workflow() {
  const items = [
    ["✎", "AI剧本", "自动创作完整故事"],
    ["♟", "资产生成", "人物、场景、道具"],
    ["▤", "智能分镜", "自动规划镜头"],
    ["🎨", "AI图片", "生成视觉素材"],
    ["▶", "AI视频", "生成动态片段"],
    ["◉", "AI配音", "角色自动配音"],
    ["♫", "音乐音效", "自动匹配声音"],
    ["✓", "最终成片", "自动合成MP4"],
  ];

  return (
    <div className="mt-10">

      <div className="mb-5 flex items-center justify-between">

        <div>

          <h3 className="font-semibold">
            AI 自动制作流程
          </h3>

          <p className="mt-1 text-xs text-gray-400">
            从一个想法到最终视频
          </p>

        </div>

        <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-[10px] text-gray-500">
          8 STEPS
        </span>

      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

        {items.map(
          ([icon, title, text]) => (

            <WorkflowCard
              key={title}
              icon={icon}
              title={title}
              text={text}
            />

          )
        )}

      </div>
    </div>
  );
}

/* ============================================================
   Components
============================================================ */

function Icon({ name, size = 18 }: { name: "home" | "edit" | "user" | "image" | "film" | "mic" | "music" | "sparkles" | "download" | "layers"; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 2-2 6 6" /></>,
    film: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m8 5 2 14M14 5l2 14M3 9h18M3 15h18" /></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></>,
    music: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
    sparkles: <><path d="m12 3-1.3 4.2L7 9l3.7 1.8L12 15l1.3-4.2L17 9l-3.7-1.8Z" /><path d="m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7ZM5 4l.5 1.5L7 6l-1.5.5L5 8l-.5-1.5L3 6l1.5-.5Z" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function UiIcon({ icon }: { icon: string }) {
  const map: Record<string, "home" | "edit" | "user" | "image" | "film" | "mic" | "music" | "sparkles" | "download" | "layers"> = {
    "⌂": "home", "✎": "edit", "♟": "user", "▣": "layers", "◆": "layers", "▤": "layers",
    "🎨": "image", "▶": "film", "◉": "mic", "♫": "music", "□": "film",
    home: "home", edit: "edit", user: "user", image: "image", film: "film", mic: "mic", music: "music", sparkles: "sparkles", download: "download", layers: "layers",
  };
  const name = map[icon];
  return name ? <Icon name={name} size={19} /> : <span>{icon}</span>;
}

function SidebarIcon({ icon }: { icon: string }) {
  const map: Record<string, "home" | "edit" | "user" | "image" | "film" | "mic" | "music" | "layers"> = { "⌂": "home", "✎": "edit", "♟": "user", "▣": "layers", "◆": "layers", "▤": "layers", "🎨": "image", "▶": "film", "◉": "mic", "♫": "music", "□": "film" };
  const name = map[icon];
  return name ? <Icon name={name} size={16} /> : <span>{icon}</span>;
}

function SidebarItem({
  icon,
  text,
  active,
  onClick,
}: {
  icon: string;
  text: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-gray-100 font-medium text-gray-900"
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      <span className="flex w-5 items-center justify-center">
        <SidebarIcon icon={icon} />
      </span>

      {text}
    </button>
  );
}

function WorkspaceTab({
  active,
  text,
  onClick,
}: {
  active: boolean;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-xs font-medium transition ${
        active
          ? "bg-black text-white"
          : "text-gray-500 hover:bg-gray-100"
      }`}
    >
      {text}
    </button>
  );
}

function OptionGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>

      <p className="mb-2 text-xs font-medium text-gray-500">
        {title}
      </p>

      <div className="flex flex-wrap gap-2">

        {options.map((option) => (

          <button
            key={option}
            onClick={() =>
              onChange(option)
            }
            className={`rounded-lg border px-3 py-2 text-xs transition ${
              value === option
                ? "border-black bg-black text-white"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-400"
            }`}
          >
            {option}
          </button>

        ))}

      </div>
    </div>
  );
}

function WorkflowCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
  key?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-sm">

      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-sm">
        <UiIcon icon={icon} />
      </div>

      <p className="text-sm font-medium">
        {title}
      </p>

      <p className="mt-1 text-xs leading-5 text-gray-400">
        {text}
      </p>

    </div>
  );
}

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
        <UiIcon icon={icon} />
      </div>

      <div>

        <h3 className="font-semibold">
          {title}
        </h3>

        <p className="mt-0.5 text-xs text-gray-400">
          {description}
        </p>

      </div>
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between">

      <SectionTitle
        icon={icon}
        title={title}
        description={description}
      />

    </div>
  );
}

function Tag({
  text,
}: {
  text: string;
}) {
  return (
    <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600">
      {text}
    </span>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">

      <p className="text-[11px] font-medium text-gray-400">
        {label}
      </p>

      <p className="mt-2 text-sm leading-6 text-gray-600">
        {value}
      </p>

    </div>
  );
}

function PromptBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const copyPrompt = async () => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        value
      );

      alert("提示词已复制");
    } catch {
      alert("复制失败，请手动复制");
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">

      <div className="flex items-center justify-between gap-3">

        <p className="text-[11px] font-medium text-gray-400">
          {label}
        </p>

        <button
          onClick={copyPrompt}
          className="text-[10px] text-gray-400 hover:text-gray-900"
        >
          复制
        </button>

      </div>

      <p className="mt-2 text-xs leading-6 text-gray-500">
        {value || "暂无提示词"}
      </p>

    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: string;
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >

      <div className="flex items-center justify-between">

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
          {icon}
        </div>

        <span className="text-xs text-gray-300">
          →
        </span>

      </div>

      <p className="mt-5 text-2xl font-bold">
        {value}
      </p>

      <p className="mt-1 text-xs text-gray-400">
        {label}
      </p>

    </button>
  );
}

function MiniStep({
  number,
  text,
  done = false,
}: {
  number: string;
  text: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">

      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-semibold ${
          done
            ? "bg-black text-white"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {done ? "✓" : number}
      </span>

      <span
        className={`text-xs ${
          done
            ? "font-medium text-gray-900"
            : "text-gray-400"
        }`}
      >
        {text}
      </span>

    </div>
  );
}