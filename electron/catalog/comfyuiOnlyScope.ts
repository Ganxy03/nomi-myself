// 「完全 ComfyUI 模式」的**纯判据**——清单派生侧吃的那一半，零运行时 import。
//
// 为什么和写库那半（comfyuiOnlyMode.ts）分开：deriveModelListing 被 tests/agent-runtime 的原生
// NodeNext 测试工程编译进来（lane-models-block.test.mts 直接 import 它）。那份工程里只要**值**引到
// electron/catalog/types.ts（它 import 了 catalogVersion.json），整份 program 就会把一批无关文件的
// 扩展名缺失报成 TS2835 —— 报在 electron/ai/antigravityConnection.ts、electron/audioTaskRunner.ts
// 这些跟本功能八竿子打不着的地方，排查成本极高。本文件只 type-only 引 types，因此不触发。
//
// 代价是那两个 key 字面量抄了一份（types.ts 的 COMFYUI_VENDOR_KEY / COMFYUI_VENDOR_KEY_PREFIX 是正本）。
// 抄写漂移由 comfyuiOnlyScope.test.ts 钉死：它对着 types.ts 的常量逐字比对，改了一边另一边立刻报红。
import type { CatalogState } from "./types.js";

/** 落在 ComfyUI 实例 vendor.meta 上的开关字段名（正本在 comfyuiOnlyMode.ts）。 */
export const COMFYUI_ONLY_FLAG = "comfyuiOnlyMode";
const COMFYUI_VENDOR_KEY = "comfyui-local";
const COMFYUI_VENDOR_KEY_PREFIX = "comfyui-local-";

/** 「这个 vendor 是不是一台 ComfyUI」——与 types.ts 的 isComfyuiVendor 同判据（见文件头注释）。 */
export function isComfyuiVendorKey(key: string): boolean {
  return key === COMFYUI_VENDOR_KEY || key.startsWith(COMFYUI_VENDOR_KEY_PREFIX);
}

function flagOf(meta: unknown): boolean {
  return Boolean(meta && typeof meta === "object" && (meta as Record<string, unknown>)[COMFYUI_ONLY_FLAG] === true);
}

/**
 * 清单收窄判据：任一 ComfyUI 实例打开这个开关就算开（它是**全局意图**——用户的创作全走 ComfyUI，
 * 不跟具体哪台机器绑定，加第二台时不必再点一次）。
 *
 * @returns null = 不收窄（开关没开，或目录里一台 ComfyUI 都没有）；否则是**全部** ComfyUI 实例 key。
 */
export function comfyuiOnlyVendorKeys(state: CatalogState): Set<string> | null {
  if (!state.vendors.some((vendor) => isComfyuiVendorKey(vendor.key) && flagOf(vendor.meta))) return null;
  const keys = new Set(state.vendors.filter((vendor) => isComfyuiVendorKey(vendor.key)).map((vendor) => vendor.key));
  return keys.size > 0 ? keys : null;
}