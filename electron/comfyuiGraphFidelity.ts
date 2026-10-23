// 「前端到底加载了这张图没有」的判定（2026-10-23 真机踩坑后加）。
//
// 真机现象（H3 Studio 模板，ComfyUI 0.37.0 + 前端 1.54.7）：
//   loadGraphData(界面格式) 之后，图**根本没换**——里面还是前端启动时那套默认工作流。
//   而前端 sometimes 抛 structuredClone 的 DataCloneError（节点 properties 里有克隆不了的东西），
//   有时又不抛、只是静默不加载。
//   我们这边旧代码只看「graphToPrompt() 有没有吐出东西」，于是把**另一张图**当成本次转换结果
//   返回，用户导入的是完全不相干的工作流，还带着一句「转换成功」。
//
// 所以这里加一道**保真闸**：转换完拿「前端里实际在的节点类型」和「原图的节点类型」对一遍。
// 对不上就是没加载成功 → 直接报错，不许把别人的图当结果交出去。
//
// 纯函数（无 Electron 依赖）：能单测，也便于别处复用。
//
// 文案走 desktopT（electron/desktopStrings.ts，**也是 electron-free**）：用户能直接读到这段原因，
// 所以它得跟着桌面语言走，不能在主进程里写死中文。
import { desktopT } from "./desktopStrings";

export type GraphFidelityResult = {
  ok: boolean;
  /** 对不上时给用户看的原因（中文，可直接显示）。 */
  reason?: string;
  /** 原图里有、加载后没有的节点类型。 */
  missing?: string[];
  /** 加载后多出来的节点类型（= 前端图没换干净时会有）。 */
  extra?: string[];
};

function typeOf(node: unknown): string {
  // 加载结果那边传进来的是**字符串**（页面里 graph._nodes.map(n => n.type)），
  // 原图那边是节点对象 —— 两种形态都要认。
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  const t = (node as { type?: unknown }).type;
  return typeof t === "string" ? t : "";
}

/**
 * 原图的顶层节点类型清单（**保序、带重复**）。
 * 只取顶层：subgraph 实例节点（type 是 UUID）在前端里也是顶层节点，比对时两边都在。
 */
export function collectSourceNodeTypes(uiWorkflow: unknown): string[] {
  if (!uiWorkflow || typeof uiWorkflow !== "object") return [];
  const nodes = (uiWorkflow as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map(typeOf).filter((t) => t.length > 0);
}

/** 前端加载完成后，图里实际的节点类型清单（来自页面里的 graph._nodes）。 */
export function collectLoadedNodeTypes(loaded: unknown): string[] {
  if (!Array.isArray(loaded)) return [];
  return loaded.map(typeOf).filter((t) => t.length > 0);
}

function countMap(list: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of list) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
}

/**
 * 比对「原图类型清单」与「前端实际加载出的类型清单」。
 *
 * 判定口径（刻意保守，别把正常的图误杀）：
 *   · 数量与类型**完全一致** → ok（这是绝大多数情况）。
 *   · 只差少量（缺 1 个且不多出别的）→ 仍算 ok：前端偶尔会把个别节点判成 unknown，
 *     那属于 ComfyUI 自己提交时报错的事，不该由我们拦在导入这一步。
 *   · **类型完全不相干**（交集为空）或**多出来的节点比缺的多**（说明前端图没换干净）
 *     → 判失败：这正是「静默加载失败」的样子。
 */
export function verifyLoadedGraph(sourceTypes: string[], loadedTypes: string[]): GraphFidelityResult {
  if (sourceTypes.length === 0) return { ok: true };
  if (loadedTypes.length === 0) {
    return {
      ok: false,
      reason: desktopT("comfyui.fidelity.noNodes"),
      missing: [...new Set(sourceTypes)],
      extra: [],
    };
  }
  const src = countMap(sourceTypes);
  const got = countMap(loadedTypes);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [type, n] of src) {
    const have = got.get(type) ?? 0;
    if (have < n) missing.push(type);
  }
  for (const [type, n] of got) {
    const want = src.get(type) ?? 0;
    if (n > want) extra.push(type);
  }
  if (missing.length === 0 && extra.length === 0) return { ok: true };
  // 差一点（少一个类型且没多出来）→ 交给 ComfyUI 自己报错，不拦。
  if (extra.length === 0 && missing.length === 1) return { ok: true };
  // 交集为空 = 加载出来的根本不是这张图。
  const shared = [...src.keys()].filter((t) => got.has(t));
  if (shared.length === 0) {
    return {
      ok: false,
      reason: desktopT("comfyui.fidelity.notLoaded"),
      missing,
      extra,
    };
  }
  return {
    ok: false,
    reason: desktopT("comfyui.fidelity.mismatch", {
      missing: missing.join("、"),
      extra: extra.join("、"),
    }),
    missing,
    extra,
  };
}

/**
 * 保真闸没过时，要不要**再试一次**。
 *
 * 只有「前端没换图」这种有可能自愈的情况才值得重试（ComfyUI 正在跑长任务时最常见）；
 * 试到最后一次就返回原因，别再空转。
 */
export function shouldRetryConversion(
  fidelity: GraphFidelityResult,
  attempt: number,
  maxAttempts: number,
): boolean {
  return !fidelity.ok && attempt < maxAttempts;
}
