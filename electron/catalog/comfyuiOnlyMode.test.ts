import { describe, it, expect, vi, beforeEach } from "vitest";

// 「完全 ComfyUI 模式」的三条契约，逐条钉死：
//   ① 它是**全局意图**——任一 ComfyUI 实例打开就算开（用户加第二台机器时不必再点一次）；
//   ② 开关落在 ComfyUI 实例 vendor 的 meta 上，且**只翻这一个字段**（upsertVendor 对 meta 是整块替换，
//      把旧 meta 原样带上是唯一的正确写法；少带一条就把 extraHeaders / 候选谱系抹了）；
//   ③ 收敛点在 deriveModelListing——画布下拉、任务中心、nomi_list_models、生产放行范围四处都吃那份清单。
// ② 尤其重要：这类"顺手改 meta"的 bug 是静默的（连接照常能用，只是自定义头没了），不测就等于没测。

const state = {
  version: 8,
  vendors: [] as Array<Record<string, unknown>>,
  models: [] as Array<Record<string, unknown>>,
  mappings: [] as Array<Record<string, unknown>>,
  apiKeysByVendor: {} as Record<string, unknown>,
};
const upserted: Array<Record<string, unknown>> = [];

vi.mock("./catalogStore", () => ({
  readCatalog: () => state,
  mutateCatalog: (fn: (tx: { upsertVendor: (v: Record<string, unknown>) => void }) => void) =>
    fn({ upsertVendor: (v: Record<string, unknown>) => upserted.push(v) }),
}));

import { COMFYUI_ONLY_FLAG, comfyuiOnlyVendorKeys, isComfyuiVendorKey } from "./comfyuiOnlyScope";
import { isComfyuiOnlyMode, setComfyuiOnlyMode } from "./comfyuiOnlyMode";
import { COMFYUI_VENDOR_KEY, COMFYUI_VENDOR_KEY_PREFIX } from "./types";
import { deriveModelListing } from "./modelCatalogListing";

const comfyVendor = (key: string, meta?: Record<string, unknown>) => ({
  key,
  name: "ComfyUI",
  enabled: true,
  authType: "none",
  meta,
  createdAt: "t",
  updatedAt: "t",
});

beforeEach(() => {
  upserted.length = 0;
  state.vendors = [comfyVendor("comfyui-local"), comfyVendor("volcengine")];
  state.models = [];
  state.mappings = [];
  state.apiKeysByVendor = {};
});

describe("完全 ComfyUI 模式 · 判据", () => {
  // comfyuiOnlyScope.ts 为了不进 NodeNext 原生测试工程的 import 图，把 key 字面量抄了一份。
  // 这条测试就是那份抄写的锁：正本（types.ts）改了、抄写没改，当场报红，而不是等某台实例的
  // 「完全模式」莫名其妙不生效才被发现。
  it("抄写的 ComfyUI key 字面量与 types.ts 正本逐字一致", () => {
    expect(isComfyuiVendorKey(COMFYUI_VENDOR_KEY)).toBe(true);
    expect(isComfyuiVendorKey(`${COMFYUI_VENDOR_KEY}-工作站`)).toBe(true);
    expect(isComfyuiVendorKey("volcengine")).toBe(false);
    // 前缀判据不能只认字面量：正本的前缀常量本身也要由抄写覆盖到。
    expect(COMFYUI_VENDOR_KEY_PREFIX.startsWith(COMFYUI_VENDOR_KEY)).toBe(true);
  });

  it("没有任何 ComfyUI 实例打开 → 不收窄清单", () => {
    expect(isComfyuiOnlyMode(state as never)).toBe(false);
    expect(comfyuiOnlyVendorKeys(state as never)).toBeNull();
  });

  it("云厂商的 meta 就算写了同名字段也不算数（判据锚在 isComfyuiVendor 上）", () => {
    state.vendors = [comfyVendor("volcengine", { [COMFYUI_ONLY_FLAG]: true })];
    expect(isComfyuiOnlyMode(state as never)).toBe(false);
  });

  it("第二台实例打开也算开——全局意图，加机器不必再点一次", () => {
    state.vendors = [comfyVendor("comfyui-local"), comfyVendor("comfyui-local-2", { [COMFYUI_ONLY_FLAG]: true })];
    expect(isComfyuiOnlyMode(state as never)).toBe(true);
    expect([...(comfyuiOnlyVendorKeys(state as never) ?? [])]).toEqual(["comfyui-local", "comfyui-local-2"]);
  });
});

describe("完全 ComfyUI 模式 · 落库", () => {
  it("关 → 开：只翻这一个字段，旧 meta（extraHeaders 等）原样带上", () => {
    state.vendors = [comfyVendor("comfyui-local", { extraHeaders: { "X-Key": "abc" } })];
    expect(setComfyuiOnlyMode(true)).toEqual({ ok: true, enabled: true });
    expect(upserted).toHaveLength(1);
    expect(upserted[0].key).toBe("comfyui-local");
    expect(upserted[0].meta).toEqual({ extraHeaders: { "X-Key": "abc" }, [COMFYUI_ONLY_FLAG]: true });
  });

  it("目录里还没有任何 ComfyUI 连接 → 闭门失败并说人话，不静默种一台", () => {
    state.vendors = [comfyVendor("volcengine")];
    const r = setComfyuiOnlyMode(true);
    expect(r.ok).toBe(false);
    expect(upserted).toHaveLength(0);
  });
});

describe("完全 ComfyUI 模式 · 清单收窄（唯一收敛点）", () => {
  it("开着 → 清单里只剩 ComfyUI 名下的模型；关着 → 云厂商照旧在列", () => {
    state.vendors = [comfyVendor("comfyui-local", { [COMFYUI_ONLY_FLAG]: true }), comfyVendor("volcengine")];
    state.models = [
      { modelKey: "h3", vendorKey: "comfyui-local", labelZh: "H3", kind: "video", enabled: true, createdAt: "t", updatedAt: "t" },
      { modelKey: "seedream", vendorKey: "volcengine", labelZh: "Seedream", kind: "image", enabled: true, createdAt: "t", updatedAt: "t" },
    ];
    const published = (vendorKey: string, modelKey: string, taskKind: string) => ({
      id: `${vendorKey}-${modelKey}`,
      vendorKey,
      modelKey,
      taskKind,
      name: "m",
      enabled: true,
      create: { method: "POST", path: "/prompt" },
      createdAt: "t",
      updatedAt: "t",
    });
    state.mappings = [
      published("comfyui-local", "h3", "text_to_video"),
      published("volcengine", "seedream", "text_to_image"),
    ];

    const narrowed = deriveModelListing(state as never).map((m) => m.modelKey);
    expect(narrowed).toEqual(["h3"]);

    state.vendors = [comfyVendor("comfyui-local"), comfyVendor("volcengine")];
    expect(deriveModelListing(state as never).map((m) => m.modelKey).sort()).toEqual(["h3", "seedream"]);
  });
});