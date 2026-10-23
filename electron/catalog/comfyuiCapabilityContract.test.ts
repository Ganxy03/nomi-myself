import { describe, it, expect } from "vitest";

// ComfyUI 导入 → 能力契约的翻译（2026-10-23）。
//
// 这条契约存在的理由：导入进来的工作流在目录里只有 parameters + comfyWorkflowImport，
// 没有内置档案也没有能力契约 ⇒ 设置页永远显示「输入与生成方式 · 尚未设置」，
// 画布模型列表被「完成输入与请求方式后，才能显示在画布的模型列表中」挡在门外。
// 工作流绑定本身已经把输入面说清楚了——这里只做翻译，不许编。
import {
  buildComfyuiCapabilityContract,
  capabilityContractFromImportMeta,
} from "./comfyuiCapabilityContract";
import { parseCustomCapabilityContract } from "../shared/customCapabilityContract";

describe("能力契约 · 从 ComfyUI 绑定翻译", () => {
  it("文生视频：一条方式、无素材槽、参数照抄", () => {
    const contract = buildComfyuiCapabilityContract({
      kind: "video",
      taskKinds: ["text_to_video"],
      promptRequired: true,
      mediaSlots: [],
      params: [
        { key: "comfy_width", label: "宽度", type: "number", default: 864 },
        { key: "comfy_height", label: "高度", type: "number", default: 480 },
      ],
    });
    expect(contract).not.toBeNull();
    expect(contract?.kind).toBe("video");
    expect(contract?.defaultModeId).toBe("text_to_video");
    expect(contract?.transportTaskKind).toBe("text_to_video");
    expect(contract?.modes).toHaveLength(1);
    const mode = contract?.modes[0];
    expect(mode?.id).toBe("text_to_video");
    // vendorTerm 是给人看的方式名（走 model-display 词典翻译），测试不抄文案，只认它非空。
    expect(typeof mode?.vendorTerm).toBe("string");
    expect((mode?.vendorTerm ?? "").length).toBeGreaterThan(0);
    expect(mode?.intent).toBe("text");
    expect(mode?.promptRequired).toBe(true);
    expect(mode?.slots).toEqual([]);
    expect(mode?.params.map((param) => param.key)).toEqual(["comfy_width", "comfy_height"]);
    expect(mode?.params[0].defaultValue).toBe(864);
  });

  it("图生视频：图槽必填（图输入正是 taskKind 的判据）", () => {
    const contract = buildComfyuiCapabilityContract({
      kind: "video",
      taskKinds: ["image_to_video"],
      promptRequired: true,
      mediaSlots: [{ key: "comfy_image_1", label: "首帧", mediaKind: "image" }],
      params: [],
    });
    const mode = contract?.modes[0];
    expect(mode?.intent).toBe("single");
    expect(typeof mode?.vendorTerm).toBe("string");
    expect((mode?.vendorTerm ?? "").length).toBeGreaterThan(0);
    expect(mode?.slots).toEqual([{ kind: "first_frame", label: "首帧", min: 1, max: 1 }]);
  });

  it("多条图输入 → 一条 image_ref 槽（max = 条数），不再冒充首帧", () => {
    const contract = buildComfyuiCapabilityContract({
      kind: "image",
      taskKinds: ["image_edit"],
      promptRequired: true,
      mediaSlots: [
        { key: "comfy_image_1", label: "参考图 A", mediaKind: "image" },
        { key: "comfy_image_2", label: "参考图 B", mediaKind: "image" },
      ],
      params: [],
    });
    expect(contract?.modes[0].slots).toEqual([{ kind: "image_ref", label: "参考图 A", min: 1, max: 2 }]);
  });

  it("视频/音频输入只是参考面，不进 taskKind 判据（min=0）", () => {
    const contract = buildComfyuiCapabilityContract({
      kind: "video",
      taskKinds: ["text_to_video"],
      promptRequired: false,
      mediaSlots: [{ key: "comfy_video_1", label: "源视频", mediaKind: "video" }],
      params: [],
    });
    expect(contract?.modes[0].slots).toEqual([{ kind: "source_video", label: "源视频", min: 0, max: 1 }]);
    expect(contract?.modes[0].promptRequired).toBe(false);
  });

  it("select 参数保留选项；默认值不在本机选项里 → 前置保留，绝不丢用户值", () => {
    const contract = buildComfyuiCapabilityContract({
      kind: "image",
      taskKinds: ["text_to_image"],
      promptRequired: true,
      mediaSlots: [],
      params: [{ key: "comfy_sampler", label: "采样器", type: "select", default: "euler_ancestral", options: ["euler", "dpmpp_2m"] }],
    });
    const param = contract?.modes[0].params[0];
    expect(param?.type).toBe("select");
    expect(param?.options.map((option) => option.value)).toEqual(["euler_ancestral", "euler", "dpmpp_2m"]);
    expect(param?.defaultValue).toBe("euler_ancestral");
  });

  it("默认值类型对不上 → 丢默认值但契约仍然成立（不能因为一条脏参数就退回「尚未设置」）", () => {
    const contract = buildComfyuiCapabilityContract({
      kind: "image",
      taskKinds: ["text_to_image"],
      promptRequired: true,
      mediaSlots: [],
      params: [{ key: "comfy_seed", label: "种子", type: "text", default: 42 }],
    });
    expect(contract).not.toBeNull();
    expect(contract?.modes[0].params[0].defaultValue).toBeUndefined();
  });

  it("默认值超出契约校验器的数字上限（1e12）→ 只丢这个默认值，参数与其余参数都保住", () => {
    // 内置 ComfyUI 预置的随机种子默认就是 1.57e14：超界的一条默认值若带崩整份契约，
    // 设置页就退回「尚未设置」，用户看到的还是「正在配置中」。
    const contract = buildComfyuiCapabilityContract({
      kind: "image",
      taskKinds: ["text_to_image"],
      promptRequired: true,
      mediaSlots: [],
      params: [
        { key: "comfy_width", label: "宽度", type: "number", default: 512 },
        { key: "comfy_seed", label: "随机种子", type: "number", default: 156680208700286 },
      ],
    });
    expect(contract).not.toBeNull();
    expect(contract?.modes[0].params.map((param) => param.key)).toEqual(["comfy_width", "comfy_seed"]);
    expect(contract?.modes[0].params[1].defaultValue).toBeUndefined();
    expect(contract?.modes[0].params[0].defaultValue).toBe(512);
  });

  it("键名不合法 / 方式不认识 → 不给契约（宁可「尚未设置」，也不写骗人的能力面）", () => {
    expect(buildComfyuiCapabilityContract({
      kind: "video",
      taskKinds: ["text_to_video"],
      promptRequired: true,
      mediaSlots: [],
      params: [{ key: "__proto__x", label: "坏键", type: "number", default: 1 }],
    })).not.toBeNull(); // 坏键被丢掉，方式本身仍然成立
    expect(buildComfyuiCapabilityContract({
      kind: "video",
      taskKinds: [],
      promptRequired: true,
      mediaSlots: [],
      params: [],
    })).toBeNull();
  });

  it("多条方式 → 一个方式一个 mode，defaultModeId 落在第一条上", () => {
    const contract = buildComfyuiCapabilityContract({
      kind: "video",
      taskKinds: ["text_to_video", "image_to_video"],
      promptRequired: true,
      mediaSlots: [{ key: "comfy_image_1", label: "首帧", mediaKind: "image" }],
      params: [],
    });
    expect(contract?.modes.map((mode) => mode.id)).toEqual(["text_to_video", "image_to_video"]);
    expect(contract?.defaultModeId).toBe("text_to_video");
    expect(contract?.modes[1].slots[0].min).toBe(1);
  });
});

describe("能力契约 · 从目录里已存的导入 meta 反推", () => {
  it("按 parameters + comfyWorkflowImport 反推，产出可被解析的契约", () => {
    const contract = capabilityContractFromImportMeta({
      kind: "video",
      taskKinds: ["text_to_video"],
      meta: {
        parameters: [
          { key: "comfy_seed", label: "种子", type: "number", default: 42 },
          { key: "comfy_image_1", label: "首帧", type: "image-url", mediaKind: "image", default: "" },
        ],
        comfyWorkflowImport: { text: "{}", binding: { promptNodeId: "5", promptInputKey: "global_prompt" } },
      },
    });
    expect(contract).not.toBeNull();
    expect(parseCustomCapabilityContract({ customCapabilityContract: contract })).not.toBeNull();
    expect(contract?.modes[0].promptRequired).toBe(true);
    expect(contract?.modes[0].slots[0].kind).toBe("first_frame");
  });

  it("mapping 没给方式 → 按「产物类型 + 有没有图输入」现推一条", () => {
    const contract = capabilityContractFromImportMeta({
      kind: "video",
      meta: {
        parameters: [{ key: "comfy_seed", label: "种子", type: "number", default: 42 }],
        comfyWorkflowImport: { text: "{}", binding: {} },
      },
    });
    expect(contract?.modes[0].id).toBe("text_to_video");
  });

  it("不是导入进来的工作流 / 类型对不上 → null", () => {
    expect(capabilityContractFromImportMeta({ kind: "video", meta: { parameters: [] } })).toBeNull();
    expect(capabilityContractFromImportMeta({ kind: "text", meta: { parameters: [] } })).toBeNull();
  });
});
