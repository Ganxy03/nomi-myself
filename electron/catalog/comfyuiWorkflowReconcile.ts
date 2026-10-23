// 导入时与本机 /object_info 的「缺件对账」（纯函数）。2026-10-23 从 comfyuiWorkflowImport.ts 拆出。
//
// 为什么拆：这一族只回答「这台机器上这份图跑不跑得起来」，与分析（哪些槽可绑定）、构建（怎么注参）
// 是三件事；混在一起把主流程顶到 800 行体积门之外。对账结果仍从 comfyuiWorkflowImport 转出，
// 外部调用方（导入面板、模板库、认证前置检查）一个都不用改。
import type { ComfyObjectInfoIndex } from "../comfyuiObjectInfo";
import type { ComfyGraph, WorkflowEnumOption } from "./comfyuiWorkflowImport";

/** 一条「引用了本机没有的文件/选项」记录（combo 枚举对不上：checkpoint/LoRA/VAE 文件名、采样器名…）。 */
export type MissingEnumValue = { nodeId: string; classType: string; title?: string; inputKey: string; value: string };
export type WorkflowReconcile = {
  /** 本机 ComfyUI 没装的节点类（缺自定义节点包，运行必失败）。 */
  unknownNodeTypes: string[];
  /** 输入值不在本机 combo 可选项里（多半 = 作者机器上的模型文件名，本机没这个文件）。 */
  missingEnumValues: MissingEnumValue[];
};

/**
 * 导入时对账（纯函数）：workflow 每个节点/每个标量输入 vs 本机 /object_info 能力索引。
 * 抄自 Krita AI Diffusion 的「清单 vs object_info」思路（generic 版：不需要预置清单，全图逐项核）——
 * 缺节点/缺模型是 ComfyUI 接入第一死因，在导入面板就说清，不等 /prompt 400 或 execution_error 再猜。
 */
export function reconcileComfyWorkflow(graph: ComfyGraph, index: ComfyObjectInfoIndex): WorkflowReconcile {
  const unknown = new Set<string>();
  const missingEnumValues: MissingEnumValue[] = [];
  for (const [nodeId, node] of Object.entries(graph)) {
    const classType = node.class_type ?? "";
    if (!index.classNames.has(classType)) {
      unknown.add(classType);
      continue; // 类都没有，枚举无从核对
    }
    const enums = index.enumsByClass.get(classType);
    if (!enums) continue;
    const inputs = node.inputs && typeof node.inputs === "object" ? node.inputs : {};
    for (const [inputKey, value] of Object.entries(inputs)) {
      if (typeof value !== "string" || !value.trim() || value.includes("{{")) continue; // 连线/空值/模板占位不核
      const options = enums.get(inputKey);
      // 严格按类型比对，与 ComfyUI 的 `val in combo_options` 同口径：字符串 "8" 对不上数字选项 8。
      if (!options || options.includes(value)) continue;
      missingEnumValues.push({ nodeId, classType, title: node._meta?.title, inputKey, value });
    }
  }
  return { unknownNodeTypes: [...unknown], missingEnumValues };
}

/** 单个 combo 选项列表烤入上限（2000 个 LoRA 的机器别把 catalog 撑爆；对账/报错不受此限）。 */
const ENUM_BAKE_CAP = 400;

/**
 * 收集「图里出现的 (classType, inputKey) → 本机 combo 可选值」（纯函数）。
 * reconcile 时顺手带出，导入/保存时经 buildImportedWorkflow 烤进参数控件——
 * checkpoint/LoRA 这类文件名参数在画布上变成列真实文件的下拉，不再手抄文件名拼错 400。
 */
export function collectGraphEnumOptions(graph: ComfyGraph, index: ComfyObjectInfoIndex): WorkflowEnumOption[] {
  const seen = new Set<string>();
  const out: WorkflowEnumOption[] = [];
  for (const node of Object.values(graph)) {
    const enums = index.enumsByClass.get(node.class_type ?? "");
    if (!enums) continue;
    const inputs = node.inputs && typeof node.inputs === "object" ? node.inputs : {};
    for (const [inputKey, value] of Object.entries(inputs)) {
      // 只给字符串值的 widget 烤下拉：数值/布尔值的 combo（bit_depth=8、rescale_after_model=true）
      // 导入面板按值推成数字框/开关，本身就按原类型发回，不用下拉；连线也不核。
      if (typeof value !== "string") continue;
      const options = enums.get(inputKey);
      if (!options || options.length === 0) continue;
      const key = `${node.class_type} ${inputKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ classType: node.class_type ?? "", inputKey, options: options.slice(0, ENUM_BAKE_CAP) });
    }
  }
  return out;
}
