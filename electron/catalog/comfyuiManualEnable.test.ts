import { describe, it, expect, vi, beforeEach } from "vitest";

// 认证放宽（手动放行）的三条契约：
//   ① 只对**导入进来的 ComfyUI 工作流**开这条后门（别的模型碰都不碰）；
//   ② 放行必须**留痕**——没跑过真实校验这件事要留在目录里（comfyWorkflowImport.verification=manual_ack），
//      否则「跳过验证」和「验过了」在库里长得一模一样，事后无从分辨；
//   ③ 放行后模型必须真的进得了清单（publishedModes 非空），否则用户点了按钮什么都没发生。
const state = {
  version: 8,
  vendors: [] as Array<Record<string, unknown>>,
  models: [] as Array<Record<string, unknown>>,
  mappings: [] as Array<Record<string, unknown>>,
  apiKeysByVendor: {} as Record<string, unknown>,
};
const applied = { vendors: [] as Array<Record<string, unknown>>, models: [] as Array<Record<string, unknown>>, mappings: [] as Array<Record<string, unknown>> };

vi.mock("./catalogStore", () => ({
  readCatalog: () => state,
  mutateCatalog: (fn: (tx: unknown, s: unknown) => unknown) =>
    fn(
      {
        upsertVendor: (v: Record<string, unknown>) => {
          applied.vendors.push(v);
          const hit = state.vendors.findIndex((item) => item.key === v.key);
          if (hit >= 0) state.vendors[hit] = v; else state.vendors.push(v);
        },
        upsertModel: (m: Record<string, unknown>) => {
          applied.models.push(m);
          const hit = state.models.findIndex((item) => item.vendorKey === m.vendorKey && item.modelKey === m.modelKey);
          if (hit >= 0) state.models[hit] = m; else state.models.push(m);
        },
        upsertMapping: (m: Record<string, unknown>) => {
          applied.mappings.push(m);
          const hit = state.mappings.findIndex((item) => item.id === m.id);
          if (hit >= 0) state.mappings[hit] = m; else state.mappings.push(m);
        },
      },
      state,
    ),
}));

import { COMFYUI_MANUAL_VERIFICATION, manualEnableAvailability, manuallyEnableComfyWorkflow } from "./comfyuiManualEnable";

const importedModel = {
  modelKey: "comfy-h3-1", vendorKey: "comfyui-local", labelZh: "H3", kind: "video", enabled: false,
  meta: { parameters: [], comfyWorkflowImport: { text: "{}", binding: {} } },
  createdAt: "t", updatedAt: "t",
};

beforeEach(() => {
  applied.vendors = []; applied.models = []; applied.mappings = [];
  state.vendors = [{ key: "comfyui-local", name: "ComfyUI", enabled: false, authType: "none", createdAt: "t", updatedAt: "t" }];
  state.models = [{ ...importedModel }];
  state.mappings = [{
    id: "m1", vendorKey: "comfyui-local", modelKey: "comfy-h3-1", taskKind: "text_to_video",
    name: "H3", enabled: false, create: { method: "POST", path: "/prompt" }, createdAt: "t", updatedAt: "t",
  }];
});

describe("手动放行 · 挡门判据", () => {
  it("导入进来、还没启用 → 可放行", () => {
    expect(manualEnableAvailability(state as never, "comfyui-local", "comfy-h3-1")).toEqual({ ok: true });
  });

  it("不是导入进来的 ComfyUI 模型 → 闭门（用户自带/云厂商模型不归这条后门管）", () => {
    state.models = [{ ...importedModel, meta: {} }];
    expect(manualEnableAvailability(state as never, "comfyui-local", "comfy-h3-1")).toEqual({ ok: false, reason: "not_imported_workflow" });
  });

  it("连接不是 ComfyUI / 行不存在 / 没有渠道 → 各自说自己的原因", () => {
    state.vendors = [{ key: "volcengine", name: "火山", enabled: true, createdAt: "t", updatedAt: "t" }];
    expect(manualEnableAvailability(state as never, "volcengine", "comfy-h3-1")).toEqual({ ok: false, reason: "not_comfyui" });
    expect(manualEnableAvailability(state as never, "comfyui-local", "nope")).toEqual({ ok: false, reason: "connection_missing" });
    state.vendors = [{ key: "comfyui-local", name: "ComfyUI", enabled: true, createdAt: "t", updatedAt: "t" }];
    expect(manualEnableAvailability(state as never, "comfyui-local", "nope")).toEqual({ ok: false, reason: "workflow_missing" });
    state.vendors = [{ key: "comfyui-local", name: "ComfyUI", enabled: true, createdAt: "t", updatedAt: "t" }];
    state.mappings = [];
    expect(manualEnableAvailability(state as never, "comfyui-local", "comfy-h3-1")).toEqual({ ok: false, reason: "no_mapping" });
  });
});

describe("手动放行 · 落库与留痕", () => {
  it("放行 → vendor/model/mapping 全启用，且目录里留下 manual_ack 痕迹", () => {
    const r = manuallyEnableComfyWorkflow({ vendorKey: "comfyui-local", modelKey: "comfy-h3-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.alreadyEnabled).toBe(false);
    // 真进了清单（否则用户点了按钮却什么都没发生）。
    expect(r.publishedModes).toEqual(["text_to_video"]);
    expect(applied.vendors[0].enabled).toBe(true);
    expect(applied.models[0].enabled).toBe(true);
    expect(applied.mappings[0].enabled).toBe(true);
    const meta = applied.models[0].meta as { comfyWorkflowImport: Record<string, unknown> };
    expect(meta.comfyWorkflowImport.verification).toBe(COMFYUI_MANUAL_VERIFICATION);
    expect(typeof meta.comfyWorkflowImport.verifiedAt).toBe("string");
    // 旧 meta 不能被抹掉（parameters 与原始 draft 都还在）。
    expect(meta.comfyWorkflowImport.text).toBe("{}");
    expect((applied.models[0].meta as { parameters: unknown }).parameters).toEqual([]);
  });

  it("已启用再点一次 = 幂等 no-op，不重复改痕迹", () => {
    manuallyEnableComfyWorkflow({ vendorKey: "comfyui-local", modelKey: "comfy-h3-1" });
    applied.models = [];
    const again = manuallyEnableComfyWorkflow({ vendorKey: "comfyui-local", modelKey: "comfy-h3-1" });
    expect(again).toMatchObject({ ok: true, alreadyEnabled: true });
    expect(applied.models).toHaveLength(1); // 仍然回写一次，痕迹里的时间戳刷新；不会变成第二条行
    expect(state.models).toHaveLength(1);
  });

  it("不是导入进来的工作流 → 拒绝，一条都不写", () => {
    state.models = [{ ...importedModel, meta: {} }];
    const r = manuallyEnableComfyWorkflow({ vendorKey: "comfyui-local", modelKey: "comfy-h3-1" });
    expect(r).toEqual({ ok: false, error: "manual_enable_blocked:not_imported_workflow" });
    expect(applied.models).toHaveLength(0);
  });

  it("放行 → 补上能力契约、落地适配器状态（不再永远「正在后台自动适配」）", () => {
    state.models = [{
      ...importedModel,
      meta: {
        parameters: [{ key: "comfy_width", label: "宽度", type: "number", default: 864 }],
        comfyWorkflowImport: { text: "{}", binding: { promptNodeId: "5", promptInputKey: "global_prompt" } },
        adapter: { state: "testing", runId: "comfy-lease-1", modes: [], updatedAt: "t" },
      },
    }];
    const r = manuallyEnableComfyWorkflow({ vendorKey: "comfyui-local", modelKey: "comfy-h3-1" });
    expect(r.ok).toBe(true);
    const meta = applied.models[0].meta as {
      customCapabilityContract?: { modes: Array<{ id: string }> };
      adapter?: { state?: string; runId?: string };
    };
    // 能力契约在位 ⇒ 设置页不再显示「输入与生成方式 · 尚未设置」。
    expect(meta.customCapabilityContract?.modes.map((mode) => mode.id)).toEqual(["text_to_video"]);
    // 适配器状态落地：不再是「testing」（那会让设置页永远显示「正在后台自动适配」）。
    expect(meta.adapter?.state).toBe("unverified");
    expect(meta.adapter?.runId).toBeUndefined();
  });
});