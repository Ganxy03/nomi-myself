// 「跳过真实验证，直接启用」——ComfyUI 认证放宽（2026-10-23）。
//
// 为什么要有这条后门：认证的规范动作是**跑一次真的**候选运行（POST /prompt → /history → /view，
// 见 comfyuiCandidateLifecycle），但那条链对用户自己的机器有真实成本与真实卡点：
//   ① 长视频（H3 那台 5.4 分钟/镜）要占用机器 40 分钟才走得完一次；
//   ② 工作流里挂了只在这台机器上才有的自定义节点包时，规范化提示词一提交就是错，
//      用户要等一轮才知道；
//   ③ 用户就是想先跑起来看看，认证流程本身成了拦路虎。
// 于是给一条**明确的、留痕的**放行：模型/渠道/vendor 直接启用，但目录里必须留下
// `comfyWorkflowImport.verification = "manual_ack"` 的痕迹，UI 也要照实显示「未经验证（手动放行）」——
// 不做的事（真跑一遍）绝不能事后被当成做过。
//
// 边界：只认**导入进来的 ComfyUI 工作流**（model.meta.comfyWorkflowImport 在），不碰任何别的模型；
// 只对当前处于「已导入未启用」的行生效（已启用的重复调用是幂等的 no-op，不重复改 meta）；
// 落库走 mutateCatalog 的读-改-写，meta 整块替换时把旧值原样带上（与 comfyuiOnlyMode 同一条纪律）。
import { mutateCatalog, readCatalog } from "./catalogStore";
import { capabilityContractFromImportMeta } from "./comfyuiCapabilityContract";
import { isComfyuiVendor, type CatalogState, type Mapping, type Model, type ProfileKind, type Vendor } from "./types";
import { derivePublishedExecution } from "../shared/modelPublication";

/** 目录里留下的放行痕迹（UI 读它决定要不要说实话）。 */
export const COMFYUI_MANUAL_VERIFICATION = "manual_ack";

export type ManualEnableResult =
  | { ok: true; vendorKey: string; modelKey: string; publishedModes: ProfileKind[]; alreadyEnabled: boolean }
  | { ok: false; error: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isImportedComfyWorkflow(model: Model | undefined): boolean {
  return Boolean(model && record(record(model.meta).comfyWorkflowImport).text);
}

export function manualEnableState(state: CatalogState, vendorKey: string, modelKey: string): {
  vendor?: Vendor;
  model?: Model;
  mappings: Mapping[];
} {
  const vendor = state.vendors.find((item) => item.key === vendorKey);
  const model = state.models.find((item) => item.vendorKey === vendorKey && item.modelKey === modelKey);
  const mappings = state.mappings.filter((item) => item.vendorKey === vendorKey && item.modelKey === modelKey);
  return { ...(vendor ? { vendor } : {}), ...(model ? { model } : {}), mappings };
}

/** 这一行现在能不能被「手动放行」（UI 用它决定按钮是可用还是禁用+说清为什么）。 */
export function manualEnableAvailability(state: CatalogState, vendorKey: string, modelKey: string): {
  ok: boolean;
  reason?: string;
} {
  const { vendor, model, mappings } = manualEnableState(state, vendorKey, modelKey);
  if (!vendor) return { ok: false, reason: "connection_missing" };
  if (!isComfyuiVendor(vendor)) return { ok: false, reason: "not_comfyui" };
  if (!model) return { ok: false, reason: "workflow_missing" };
  if (!isImportedComfyWorkflow(model)) return { ok: false, reason: "not_imported_workflow" };
  if (mappings.length === 0) return { ok: false, reason: "no_mapping" };
  if (model.enabled && mappings.every((mapping) => mapping.enabled)) return { ok: false, reason: "already_enabled" };
  return { ok: true };
}

/**
 * 手动放行：把 vendor / model / 该模型名下所有 mapping 一次启用，并落痕 manual_ack。
 * 返回落痕后的已发布模式（空数组 = 放行了但仍然没进清单，UI 要照实说）。
 */
export function manuallyEnableComfyWorkflow(input: { vendorKey: string; modelKey: string }): ManualEnableResult {
  const vendorKey = String(input.vendorKey || "").trim();
  const modelKey = String(input.modelKey || "").trim();
  if (!vendorKey || !modelKey) return { ok: false, error: "invalid_workflow_identity" };
  const availability = manualEnableAvailability(readCatalog(), vendorKey, modelKey);
  // already_enabled 不是失败：重复点按钮不该报错，调用方据此原样回读即可。
  if (!availability.ok && availability.reason !== "already_enabled") {
    return { ok: false, error: `manual_enable_blocked:${availability.reason}` };
  }
  // 用 mutateCatalog 传进来的 state（不是再 readCatalog 一次）：tx 是在**这一份** state 上原地改的，
  // 中途重读要么拿到旧缓存、要么拿到未落盘的中间态，落痕与发布模式的结论都会算错。
  return mutateCatalog((tx, state) => {
    const { vendor, model, mappings } = manualEnableState(state as CatalogState, vendorKey, modelKey);
    if (!vendor || !model) throw new Error("manual_enable_blocked:workflow_missing");
    const now = new Date().toISOString();
    const importMeta = record(model.meta).comfyWorkflowImport;
    // 手动放行 = 用户亲口说「这条工作流能用」。顺手把两件事做实（2026-10-23）：
    //   ① 补齐能力契约——导入时写过一次，这里按当前 binding/参数重算一遍，
    //      早于本功能导入的旧行也能补上。缺了它，设置页永远显示「输入与生成方式 · 尚未设置」，
    //      画布模型列表被「完成输入与请求方式后，才能显示在画布的模型列表中」挡在门外。
    //   ② 落地适配器状态——导入时留下的 "testing" 是「等真实验证」的候选租约，
    //      模型都已启用了还留着它，设置页会永远显示「正在后台自动适配」。
    //      手动放行**没有**跑过真实验证，所以状态是 "unverified"（可以说「可以用，尚未测试」），
    //      不是 "verified"（那会把没做过的事说成做过）。
    const contract = capabilityContractFromImportMeta({
      kind: model.kind,
      taskKinds: mappings.map((mapping) => mapping.taskKind),
      meta: model.meta,
    });
    const adapter = record(record(model.meta).adapter);
    const { runId: _staleRunId, ...adapterRest } = adapter;
    const modelMeta = {
      ...record(model.meta),
      comfyWorkflowImport: { ...record(importMeta), verification: COMFYUI_MANUAL_VERIFICATION, verifiedAt: now },
      ...(contract ? { customCapabilityContract: contract } : {}),
      ...(Object.keys(adapterRest).length ? { adapter: { ...adapterRest, state: "unverified" } } : {}),
    };
    tx.upsertVendor({ ...vendor, enabled: true });
    tx.upsertModel({ ...model, enabled: true, meta: modelMeta });
    for (const mapping of mappings) {
      if (mapping.enabled) continue;
      tx.upsertMapping({ ...mapping, enabled: true });
    }
    const published = derivePublishedExecution(
      state.models.find((item) => item.vendorKey === vendorKey && item.modelKey === modelKey),
      { mappings: state.mappings },
    );
    return {
      ok: true as const,
      vendorKey,
      modelKey,
      publishedModes: published.publishedModes,
      alreadyEnabled: availability.reason === "already_enabled",
    };
  });
}