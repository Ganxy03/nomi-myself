// 「完全 ComfyUI 模式」的**写库那半**——开关读写。判据本体在 comfyuiOnlyScope.ts（零运行时 import）。
//
// 为什么不让用户看见云厂商（那 100+ 个没配 key 的模型会在下拉里排前面，选中后才报缺 key）：
// 同一份 model 清单有好几个消费方（画布下拉、任务中心、MCP/Agent 的 nomi_list_models、
// 生产放行范围 connectedModelScope），各处各滤一遍必然漏。唯一的收敛点是 deriveModelListing，
// 它吃的是 comfyuiOnlyScope 的判据，所以下面所有消费方自动一致。
//
// 存在哪：ComfyUI 实例 vendor 的 meta.comfyuiOnlyMode。**不接受渲染层直接写 meta**——
// catalogStore 的 upsertVendor 对 meta 是整块替换（除非是 customConfig 那条特判），
// 渲染层拿不到完整旧 meta（extraHeaders / 候选谱系都在里面），一写就抹。所以走主进程这个函数，
// 读-改-写合并。
import { mutateCatalog, readCatalog } from "./catalogStore";
import { COMFYUI_ONLY_FLAG, comfyuiOnlyVendorKeys, isComfyuiVendorKey } from "./comfyuiOnlyScope";
import { COMFYUI_VENDOR_KEY } from "./types";
import type { CatalogState, Vendor } from "./types";

/**
 * 这个目录当前是不是「完全 ComfyUI 模式」。判据与清单派生侧同源（comfyuiOnlyScope）。
 */
export function isComfyuiOnlyMode(state: CatalogState): boolean {
  return comfyuiOnlyVendorKeys(state) !== null;
}

/** 清单派生侧用的判据（转出，避免 modelCatalogListing 越过零 import 边界）。 */
export { comfyuiOnlyVendorKeys };

/** 设置开关。落到第一台 ComfyUI 实例上（没有实例就落到主实例 key 上，等用户填地址）。 */
export function setComfyuiOnlyMode(enabled: boolean): { ok: true; enabled: boolean } | { ok: false; error: string } {
  try {
    const state = readCatalog();
    const target: Vendor | undefined =
      state.vendors.find((vendor) => isComfyuiVendorKey(vendor.key))
      ?? state.vendors.find((vendor) => vendor.key === COMFYUI_VENDOR_KEY);
    if (!target) return { ok: false, error: "目录里还没有 ComfyUI 连接，先添加一台再开这个模式" };
    mutateCatalog((tx) => {
      tx.upsertVendor({
        ...target,
        // 整块替换语义下唯一的正确写法：把旧 meta 原样带上，只翻这一个标志。
        meta: { ...(target.meta && typeof target.meta === "object" ? (target.meta as Record<string, unknown>) : {}), [COMFYUI_ONLY_FLAG]: enabled === true },
      });
    });
    return { ok: true, enabled: enabled === true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function readComfyuiOnlyMode(): boolean {
  return isComfyuiOnlyMode(readCatalog());
}