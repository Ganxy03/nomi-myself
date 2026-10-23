// 「这个 widget 是不是媒体槽」的全部判据（2026-10-23 从 comfyuiWorkflowImport.ts 拆出）。
//
// 为什么单独立文件：这三路证据 + 往上游追源是一套完整判据，混在工作流分析主流程里既压行数又难单测
// （analyzeComfyWorkflow 已经 900+ 行，撞 800 行体积门）。**判据一处**同样重要——导入时用、
// 认证夹具判定槽型时也用，两处各判一次必然漂移。
import type { ComfyObjectInfoIndex } from "../comfyuiObjectInfo";
import type { ComfyGraph, NodeInputCandidate } from "./comfyuiWorkflowImport";
import { isPromptLikeKey } from "./comfyuiWorkflowPromptKeys";

/** 媒体扩展名（作者机器上留下的文件名是硬证据，与节点名、键名都无关）。 */
const MEDIA_FILE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|mp4|webm|mov|mkv|m4v|avi|mp3|wav|flac|ogg|m4a|aac)$/i;
const MEDIA_AUDIO_EXT_RE = /\.(mp3|wav|flac|ogg|m4a|aac)$/i;
const MEDIA_VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|m4v|avi)$/i;

/**
 * 「这节点像是去取文件的」——扩展名那一路的**前提**。
 *
 * 只看扩展名会把云端 API 节点（ByteDanceImageNode.image = 'reference.png'）也判成媒体槽，
 * 而那些字段收的是 URL 不是 ComfyUI input 目录里的文件名：绑上去 = 传一个文件名给一个要 URL 的接口
 * = 每次跑都错。所以扩展名必须与「这节点负责取文件」同现。
 * 模型载入节点（LoadXxxCheckpoint.lora_name='x.safetensors'）天然被这一条挡住——它们不是媒体扩展名。
 */
const FILE_FETCHING_NODE_RE = /load|read|open|fetch/i;
const LOAD_IMAGE_RE = /loadimage/i;
const LOAD_VIDEO_RE = /loadvideo|vhs_loadvideo/i;
/**
 * 音频输入节点（用户报的根因「ComfyUI 音频输入用不了」）。官方核心节点 class_type 就叫 `LoadAudio`，
 * 输入键叫 `audio`（ComfyUI 源码 comfy_extras/nodes_audio.py，`node_id="LoadAudio"` /
 * `IO.Combo.Input("audio", upload=IO.UploadType.audio, ...)`，2026-09-11 核实）——与
 * MEDIA_INPUT_KEYS 早就收着的 "audio" 键名完全对得上；只是一直没有配套的 class_type 识别正则，
 * 于是 isMediaInput 永远判 false，音频输入退化成裸文本 widget（用户得手填 ComfyUI 内部文件名）。
 */
const LOAD_AUDIO_RE = /loadaudio/i;
const TEXT_ENCODE_RE = /textencode|encode.*text|cliptext/i;
const STRING_SOURCE_RE = /primitive.*string|string.*multiline|stringinput|textinput/i;
const SWITCH_RE = /switch/i;
const PREVIEW_ANY_RE = /previewany/i;
const TEXT_GENERATE_RE = /textgenerate/i;

/**
 * 声明类型（/object_info 的 `input.required.x = ["IMAGE", …]`）认出的媒体族——比类名/键名/扩展名都硬，
 * 是节点自己申报的「这槽收什么」。没有索引时（离线导入）这一路自动缺席，另三路顶上。
 */
export function mediaKindByDeclaredType(declaredType: string): "image" | "video" | "audio" | undefined {
  const type = declaredType.toUpperCase();
  if (type === "IMAGE") return "image";
  if (type === "VIDEO") return "video";
  if (type === "AUDIO") return "audio";
  return undefined;
}

/** 声明类型（/object_info）——没索引、没这个类、或这个槽没声明类型时一律空串。 */
export function declaredInputType(index: ComfyObjectInfoIndex | null | undefined, classType: string, inputKey: string): string {
  return index?.classes.get(classType)?.inputs.get(inputKey)?.type ?? "";
}

/**
 * 这个字符串 widget 是不是媒体槽（以及收哪种媒体）。2026-10-23 之前这里是
 * `MEDIA_INPUT_KEYS.has(key) && (Load* 类名)` —— 键名白名单 + 类名白名单**两道**并联，
 * 自建节点两道都不沾就彻底认不出（用户那台 H3 机器上 H3SafeLoadImage 靠类名侥幸过关而已）。
 * 现在三路证据任一命中即认：
 *   ① /object_info 声明的槽类型 IMAGE/VIDEO/AUDIO（节点自己申报，最硬）；
 *   ② 类名是载入节点（含社区变体，与旧判据同源，只是不再要求键名也在白名单里）；
 *   ③ 值是媒体文件名（作者机器上留下的文件名是硬证据，与节点名、键名都无关）。
 */
export function resolveMediaWidgetKind(
  index: ComfyObjectInfoIndex | null | undefined,
  classType: string,
  inputKey: string,
  value: string,
): "image" | "video" | "audio" | undefined {
  const byDeclared = mediaKindByDeclaredType(declaredInputType(index, classType, inputKey));
  if (byDeclared) return byDeclared;
  if (LOAD_VIDEO_RE.test(classType)) return "video";
  if (LOAD_AUDIO_RE.test(classType)) return "audio";
  if (LOAD_IMAGE_RE.test(classType)) return "image";
  if (!MEDIA_FILE_EXT_RE.test(value)) return undefined;
  // 走扩展名这一路（最弱）要额外排雷：文本节点里写着 ".png" 的字符串不是媒体槽，
  // 云端 API 节点里写着 "reference.png" 的字段收的是 URL 而不是文件名，同样不是媒体槽。
  if (!FILE_FETCHING_NODE_RE.test(classType)) return undefined;
  if (isPromptLikeKey(inputKey)) return undefined;
  if (STRING_SOURCE_RE.test(classType) || TEXT_ENCODE_RE.test(classType)) return undefined;
  if (SWITCH_RE.test(classType) || PREVIEW_ANY_RE.test(classType) || TEXT_GENERATE_RE.test(classType)) return undefined;
  return MEDIA_AUDIO_EXT_RE.test(value) ? "audio" : MEDIA_VIDEO_EXT_RE.test(value) ? "video" : "image";
}

function isLink(v: unknown): v is [string, number] {
  return Array.isArray(v) && v.length >= 2 && typeof v[0] === "string" && typeof v[1] === "number";
}

/**
 * 往上游追「真正能被注入的那个 widget」。
 *
 * 图里绝大多数媒体输入是**连线**（`["3", 0]`），widget 只长在载入节点上；按图直接扫只能看到这些 widget。
 * 中间隔了 H3RefRouter / H3StartFrameFix / ImageBatch 这类中间节点时仍要能认回源头，
 * 否则用户看到的是「消费节点有一个 image 输入」却找不到能填的地方。
 * 只在**有 object_info 索引**时启用（没有索引就无法判断一条连线收的是不是媒体，硬追会把
 * CONDITIONING/LATENT 链路也拖进来）。深度上限防环，也防超大连线图把分析拖慢。
 */
export function traceMediaWidget(
  graph: ComfyGraph,
  index: ComfyObjectInfoIndex,
  startNodeId: string,
  startInputKey: string,
  family: "image" | "video" | "audio",
  maxDepth = 12,
): NodeInputCandidate | undefined {
  const visited = new Set<string>();
  let frontier: Array<{ nodeId: string; inputKey: string }> = [{ nodeId: startNodeId, inputKey: startInputKey }];
  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: Array<{ nodeId: string; inputKey: string }> = [];
    for (const edge of frontier) {
      const token = `${edge.nodeId}|${edge.inputKey}`;
      if (visited.has(token)) continue;
      visited.add(token);
      const node = graph[edge.nodeId];
      const value = node?.inputs?.[edge.inputKey];
      if (!node || !isLink(value)) continue;
      const sourceNodeId = value[0];
      const sourceNode = graph[sourceNodeId];
      if (!sourceNode) continue;
      const sourceClass = sourceNode.class_type ?? "";
      const sourceInputs = sourceNode.inputs && typeof sourceNode.inputs === "object" ? sourceNode.inputs : {};
      // 这一层上先找「同族可注入 widget」；找到就认它，不再往更上游追（最近的源头才是用户要填的那个）。
      const fallback: NodeInputCandidate[] = [];
      for (const [inputKey, inputValue] of Object.entries(sourceInputs)) {
        if (typeof inputValue !== "string") continue;
        const kind = resolveMediaWidgetKind(index, sourceClass, inputKey, inputValue);
        if (!kind || kind !== family) continue;
        const candidate: NodeInputCandidate = {
          nodeId: sourceNodeId, inputKey, classType: sourceClass, title: sourceNode._meta?.title, value: inputValue, mediaKind: family,
        };
        if (mediaKindByDeclaredType(declaredInputType(index, sourceClass, inputKey)) === family) return candidate;
        fallback.push(candidate);
      }
      if (fallback.length > 0) return fallback[0];
      // 这一层没有可注入的 widget → 继续沿同族的连线往上走。
      for (const [inputKey, inputValue] of Object.entries(sourceInputs)) {
        if (!isLink(inputValue)) continue;
        const declared = mediaKindByDeclaredType(declaredInputType(index, sourceClass, inputKey));
        if (declared && declared !== family) continue;
        next.push({ nodeId: sourceNodeId, inputKey });
      }
    }
    frontier = next;
  }
  return undefined;
}