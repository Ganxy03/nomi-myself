// 从 ComfyUI 导入的绑定推导「输入与生成方式」能力契约（2026-10-23）。
//
// 为什么必须有这一步（用户报的现象：「这个 comfyUI 怎么显示还在配置中」）：
// ComfyUI 导入的模型在目录里只带 parameters + comfyWorkflowImport 两样东西——
// 既没有内置档案（identifierPatterns 认不出用户自建的模型名），也没有能力契约。
// 于是 resolveArchetypeForModel 返回 null ⇒ 能力投影 inputContract='unknown'
// ⇒ 设置页永远显示「输入与生成方式 · 尚未设置」，画布模型列表被
// 「完成输入与请求方式后，才能显示在画布的模型列表中」挡在门外。
//
// 但 ComfyUI 绑定**已经**把契约说清楚了：产物类型（kind / taskKind）、提示词节点、
// 媒体输入槽、数值参数。缺的不是信息，是**翻译**——这里把绑定翻成能力契约，
// 让 Nomi 认得这条通道，而不是让用户手填一遍工作流已经声明过的事实。
//
// 边界（三条，都别越）：
//   ① 只描述**这条工作流自己**的输入面，不猜厂商模板、不补工作流没有的槽；
//   ② 媒体槽与参数一律**照抄**绑定，不新增、不改写、不做跨档归并；
//   ③ 契约写坏就不写——宁可退回「尚未设置」，也不能写出一个骗人的能力面。
import {
  normalizeCustomCapabilityContract,
  type CustomCapabilityContractV1,
} from "../shared/customCapabilityContract";
import { resolveComfyWorkflowTaskKind } from "./comfyuiWorkflowTaskContract";
import type {
  ArchetypeIntent,
  ArchetypeReferenceSlot,
  ArchetypeReferenceSlotKind,
  ModelParameterControl,
  ModelParameterControlOption,
} from "../shared/videoCapabilities/types";

export type ComfyuiCapabilityMediaSlot = {
  key: string;
  label: string;
  mediaKind: "image" | "video" | "audio";
};

export type ComfyuiCapabilityParam = {
  key: string;
  label: string;
  type: "number" | "text" | "boolean" | "select";
  default?: number | string | boolean;
  options?: (string | number | boolean)[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

export type ComfyuiCapabilityTaskKind =
  | "text_to_image"
  | "image_edit"
  | "text_to_video"
  | "image_to_video"
  | "text_to_3d"
  | "image_to_3d";

export type ComfyuiCapabilityInput = {
  kind: "image" | "video" | "model3d";
  /** 这条工作流登记了哪些生成方式（一条 mapping 一个方式，一个方式一个 mode）。 */
  taskKinds: ComfyuiCapabilityTaskKind[];
  /** 工作流里有没有真正的提示词输入（有才要求提示词）。 */
  promptRequired: boolean;
  mediaSlots: ComfyuiCapabilityMediaSlot[];
  params: ComfyuiCapabilityParam[];
};

const MAX_LABEL_CHARS = 160;
const MAX_HINT_CHARS = 200;
const MAX_PARAMS = 64;
const MAX_SLOTS = 16;
const MAX_SLOT_COUNT = 64;

const SAFE_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const RESERVED_KEY_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

const TASK_TERMS: Record<ComfyuiCapabilityTaskKind, { term: string; intent: ArchetypeIntent }> = {
  text_to_image: { term: "文生图", intent: "text" },
  image_edit: { term: "图生图 / 改图", intent: "edit" },
  text_to_video: { term: "文生视频", intent: "text" },
  image_to_video: { term: "图生视频", intent: "single" },
  text_to_3d: { term: "文生 3D", intent: "text" },
  image_to_3d: { term: "图生 3D", intent: "single" },
};

/** 图输入决定 taskKind（见 comfyuiWorkflowTaskContract），所以图槽必填；视频/音频只是参考面。 */
const IMAGE_INPUT_TASK_KINDS = new Set<ComfyuiCapabilityTaskKind>(["image_edit", "image_to_video", "image_to_3d"]);

function safeKey(value: string): string | null {
  const key = value.trim();
  if (!key || key.length > 128 || !SAFE_KEY_RE.test(key)) return null;
  if (key.split(".").some((part) => RESERVED_KEY_SEGMENTS.has(part.toLowerCase()))) return null;
  return key;
}

function label(value: string, fallback: string): string {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return fallback;
  return normalized.length > MAX_LABEL_CHARS ? normalized.slice(0, MAX_LABEL_CHARS) : normalized;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 契约校验器（electron/shared/customCapabilityContract.ts）给数字划了硬上限
 * （|v| ≤ 1e12）。超界的数字**整条契约都不认**——一条脏参数把整份能力面带走，
 * 设置页就退回「尚未设置」。所以翻译层必须先自己把界洗一遍：
 * 超界的默认值/上下界/步长**就地丢掉**（参数本身留下），
 * 宁可少一个默认值，也不能因为一个种子数太大就写不出能力面。
 */
const MAX_CONTRACT_NUMBER = 1_000_000_000_000;

function boundedNumber(value: unknown): number | null {
  const num = finiteNumber(value);
  if (num === null) return null;
  return Math.abs(num) <= MAX_CONTRACT_NUMBER ? num : null;
}

function slotKindFor(mediaKind: ComfyuiCapabilityMediaSlot["mediaKind"], count: number): ArchetypeReferenceSlotKind {
  if (mediaKind === "video") return count === 1 ? "source_video" : "video_ref";
  if (mediaKind === "audio") return "audio_ref";
  return count === 1 ? "first_frame" : "image_ref";
}

function buildSlots(input: ComfyuiCapabilityInput, taskKind: ComfyuiCapabilityTaskKind): ArchetypeReferenceSlot[] {
  const groups = new Map<ComfyuiCapabilityMediaSlot["mediaKind"], ComfyuiCapabilityMediaSlot[]>();
  for (const slot of input.mediaSlots) {
    const list = groups.get(slot.mediaKind) ?? [];
    list.push(slot);
    groups.set(slot.mediaKind, list);
  }
  const slots: ArchetypeReferenceSlot[] = [];
  for (const mediaKind of ["image", "video", "audio"] as const) {
    const group = groups.get(mediaKind);
    if (!group || group.length === 0) continue;
    const count = Math.min(group.length, MAX_SLOT_COUNT);
    const kind = slotKindFor(mediaKind, count);
    const min = mediaKind === "image" && IMAGE_INPUT_TASK_KINDS.has(taskKind) ? 1 : 0;
    slots.push({
      kind,
      label: label(group[0].label, mediaKind === "image" ? "参考图" : mediaKind === "video" ? "参考视频" : "参考音频"),
      min,
      max: kind === "first_frame" || kind === "last_frame" || kind === "source_video" ? 1 : count,
    });
  }
  return slots.slice(0, MAX_SLOTS);
}

function optionOf(value: string | number | boolean): ModelParameterControlOption {
  return { value, label: String(value) };
}

function buildParam(param: ComfyuiCapabilityParam): ModelParameterControl | null {
  const key = safeKey(param.key);
  if (!key) return null;
  const title = label(param.label, key);
  if (param.type === "select") {
    const seen = new Set<string>();
    const options: ModelParameterControlOption[] = [];
    for (const value of param.options ?? []) {
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
      const identity = `${typeof value}:${String(value)}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      options.push(optionOf(value));
    }
    if (options.length === 0) return null;
    // 默认值不在本机选项里（离线导入的作者值）→ 前置保留，绝不静默丢用户值。
    const hasDefault = param.default !== undefined
      && (typeof param.default === "string" || typeof param.default === "number" || typeof param.default === "boolean");
    const defaultValue = hasDefault ? param.default as string | number | boolean : undefined;
    if (defaultValue !== undefined && !options.some((option) => option.value === defaultValue)) {
      options.unshift(optionOf(defaultValue));
    }
    return {
      key,
      label: title,
      type: "select",
      options,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    };
  }
  const control: ModelParameterControl = { key, label: title, type: param.type, options: [] };
  const defaultValue = param.default;
  const matches = param.type === "number"
    ? boundedNumber(defaultValue) !== null
    : param.type === "boolean"
      ? typeof defaultValue === "boolean"
      : typeof defaultValue === "string";
  const min = param.type === "number" ? boundedNumber(param.min) : null;
  const max = param.type === "number" ? boundedNumber(param.max) : null;
  const step = param.type === "number" ? boundedNumber(param.step) : null;
  const placeholder = typeof param.placeholder === "string" && param.placeholder.trim()
    ? param.placeholder.trim()
    : null;
  return {
    ...control,
    ...(matches && defaultValue !== undefined ? { defaultValue } : {}),
    ...(min !== null ? { min } : {}),
    ...(max !== null ? { max } : {}),
    ...(step !== null && step > 0 ? { step } : {}),
    ...(placeholder ? { placeholder } : {}),
  };
}

function buildParams(params: ComfyuiCapabilityParam[]): ModelParameterControl[] {
  const controls: ModelParameterControl[] = [];
  const seen = new Set<string>();
  for (const param of params) {
    if (controls.length >= MAX_PARAMS) break;
    const control = buildParam(param);
    if (!control || seen.has(control.key)) continue;
    seen.add(control.key);
    controls.push(control);
  }
  return controls;
}

function rawContract(input: ComfyuiCapabilityInput): Record<string, unknown> | null {
  const taskKinds: ComfyuiCapabilityTaskKind[] = input.taskKinds.filter((taskKind) => Boolean(TASK_TERMS[taskKind]));
  if (taskKinds.length === 0) return null;
  const params = buildParams(input.params);
  const modes = taskKinds.map((taskKind) => {
    const term = TASK_TERMS[taskKind];
    return {
      id: taskKind,
      intent: term.intent,
      vendorTerm: term.term,
      hint: "由导入的 ComfyUI 工作流自动识别",
      slots: buildSlots(input, taskKind),
      params,
      promptRequired: input.promptRequired,
      transportTaskKind: taskKind,
    };
  });
  return {
    version: 1,
    kind: input.kind,
    defaultModeId: modes[0].id,
    transportTaskKind: modes[0].transportTaskKind,
    modes,
  };
}

/**
 * 推导能力契约。返回 null = 这条工作流推导不出可信的能力面（调用方就**别写**，
 * 让设置页继续显示「尚未设置」——那是实话）。
 */
export function buildComfyuiCapabilityContract(input: ComfyuiCapabilityInput): CustomCapabilityContractV1 | null {
  const raw = rawContract(input);
  if (!raw) return null;
  const normalized = normalizeCustomCapabilityContract(raw);
  if (normalized) return normalized;
  // 参数里有一条不合规就把整份能力面丢掉？不行——「输入与生成方式」会退回「尚未设置」，
  // 而那不是工作流的问题，是翻译的问题。退一步：保住方式与素材槽，参数交给
  // meta.parameters（画布本来就读它，能力契约里的参数只用于展示）。
  const withoutParams = {
    ...raw,
    modes: (raw.modes as Record<string, unknown>[]).map((mode) => ({ ...mode, params: [] })),
  };
  return normalizeCustomCapabilityContract(withoutParams);
}

/**
 * 从目录里已存的导入 meta（parameters + comfyWorkflowImport）反推能力契约。
 *
 * taskKind 的来源有两条：目录里的 mapping 登记的值（最准），或按「产物类型 + 有没有图输入」
 * 现推（mapping 缺失时的兜底，判据与 comfyuiWorkflowTaskContract 同一条）。
 */
export function capabilityContractFromImportMeta(input: {
  kind: string;
  taskKinds?: readonly string[];
  meta: unknown;
}): CustomCapabilityContractV1 | null {
  const kind = input.kind;
  if (kind !== "image" && kind !== "video" && kind !== "model3d") return null;
  const meta = input.meta;
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  const parameters = Array.isArray(record.parameters) ? record.parameters : [];
  const importMeta = (record.comfyWorkflowImport && typeof record.comfyWorkflowImport === "object"
    ? record.comfyWorkflowImport
    : null) as Record<string, unknown> | null;
  // 不是导入进来的工作流 → 没有绑定可翻译，不给契约。
  if (!importMeta) return null;
  const binding = (importMeta.binding && typeof importMeta.binding === "object"
    ? importMeta.binding
    : {}) as Record<string, unknown>;
  const mediaSlots: ComfyuiCapabilityMediaSlot[] = [];
  const params: ComfyuiCapabilityParam[] = [];
  for (const entry of parameters) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const key = String(item.key || "");
    if (!key) continue;
    const type = String(item.type || "");
    if (type === "image-url") {
      const mediaKind = item.mediaKind === "video" || item.mediaKind === "audio" ? item.mediaKind : "image";
      mediaSlots.push({ key, label: String(item.label || key), mediaKind });
      continue;
    }
    if (type !== "number" && type !== "text" && type !== "boolean" && type !== "select") continue;
    const options = Array.isArray(item.options)
      ? item.options.filter((value): value is string | number | boolean =>
        typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      : undefined;
    params.push({
      key,
      label: String(item.label || key),
      type,
      ...(typeof item.default === "number" || typeof item.default === "string" || typeof item.default === "boolean"
        ? { default: item.default }
        : {}),
      ...(options ? { options } : {}),
      ...(typeof item.placeholder === "string" && item.placeholder.trim() ? { placeholder: item.placeholder } : {}),
    });
  }
  const declared = (input.taskKinds ?? [])
    .map((value) => String(value))
    .filter((value) => Boolean(TASK_TERMS[value as ComfyuiCapabilityTaskKind])) as ComfyuiCapabilityTaskKind[];
  const taskKinds = declared.length > 0
    ? declared
    : [resolveComfyWorkflowTaskKind(
      kind as "image" | "video" | "model3d",
      mediaSlots.map((slot) => ({ mediaKind: slot.mediaKind })),
    )];
  return buildComfyuiCapabilityContract({
    kind,
    taskKinds,
    promptRequired: Boolean(binding.promptNodeId && binding.promptInputKey),
    mediaSlots,
    params,
  });
}
