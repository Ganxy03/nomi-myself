import { describe, expect, it } from "vitest";

import {
  collectLoadedNodeTypes,
  collectSourceNodeTypes,
  shouldRetryConversion,
  verifyLoadedGraph,
} from "./graphFidelity";
import { describeLoadError } from "../comfyuiGraphConvert";

/**
 * 保真闸的契约（真机踩坑后补的）：
 *   ① 前端**不报错、也不加载**时，图里还是它启动时那套 —— 这种必须判失败，
 *      否则会把别人的工作流当成本次转换结果交出去（用户导入的是完全不相干的图）。
 *   ② 前端真的加载了这张图 → 节点类型清单必须完全对得上。
 *   ③ 差一点点（少一个类型）不拦：那属于 ComfyUI 提交时自己会报的事，别在导入这一步卡死用户。
 */
describe("收集节点类型", () => {
  it("原图：取顶层节点的 type（保序、去空）", () => {
    const types = collectSourceNodeTypes({
      nodes: [{ type: "H3StudioDirector" }, { type: "SaveImage" }, { type: "" }, { noType: 1 }],
    });
    expect(types).toEqual(["H3StudioDirector", "SaveImage"]);
  });

  it("原图不是对象 / 没有 nodes → 空清单（不拦）", () => {
    expect(collectSourceNodeTypes(null)).toEqual([]);
    expect(collectSourceNodeTypes({})).toEqual([]);
    expect(collectSourceNodeTypes("x")).toEqual([]);
  });

  it("加载结果：只认数组里的字符串 type", () => {
    expect(collectLoadedNodeTypes(["SaveImage", null, { type: "KSampler" }, 7])).toEqual(["SaveImage", "KSampler"]);
    expect(collectLoadedNodeTypes(undefined)).toEqual([]);
  });
});

describe("保真闸", () => {
  it("完全一致 → ok", () => {
    const r = verifyLoadedGraph(["A", "B", "C"], ["A", "B", "C"]);
    expect(r.ok).toBe(true);
  });

  it("前端没换图（交集为空）→ 失败，并说清是「没加载」", () => {
    const r = verifyLoadedGraph(
      ["H3StudioDirector", "H3StudioSaveImage"],
      ["SaveImage", "KSampler", "CLIPLoader"],
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("没能加载");
    expect(r.missing).toContain("H3StudioDirector");
  });

  it("加载出来是空的 → 失败", () => {
    const r = verifyLoadedGraph(["A"], []);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("没有加载出任何节点");
  });

  it("只少一个类型、没多出来 → 放过（交给 ComfyUI 自己报错）", () => {
    expect(verifyLoadedGraph(["A", "B"], ["A"]).ok).toBe(true);
  });

  it("多出别的节点类型（图没换干净）→ 失败", () => {
    const r = verifyLoadedGraph(["A"], ["A", "B"]);
    expect(r.ok).toBe(false);
    expect(r.extra).toEqual(["B"]);
  });

  it("原图没有节点 → 不拦（没得可比）", () => {
    expect(verifyLoadedGraph([], ["A"]).ok).toBe(true);
  });
});

describe("要不要重试（前端没换图时的兜底）", () => {
  it("没过保真闸且还有次数 → 重试", () => {
    const bad = verifyLoadedGraph(["A"], ["B"]);
    expect(shouldRetryConversion(bad, 1, 3)).toBe(true);
    expect(shouldRetryConversion(bad, 2, 3)).toBe(true);
  });

  it("已是最后一次 → 不重试（返回原因，别空转）", () => {
    const bad = verifyLoadedGraph(["A"], ["B"]);
    expect(shouldRetryConversion(bad, 3, 3)).toBe(false);
  });

  it("保真闸过了 → 不重试", () => {
    const good = verifyLoadedGraph(["A"], ["A"]);
    expect(shouldRetryConversion(good, 1, 3)).toBe(false);
  });
});

describe("前端报错的翻译", () => {
  it("structuredClone 报错 → 说人话", () => {
    const msg = describeLoadError("Failed to execute 'structuredClone' on 'Window': #<Object> could not be cloned.");
    expect(msg).toContain("读不进这张工作流");
    expect(msg).not.toContain("structuredClone");
  });

  it("普通报错原样带出（截断）", () => {
    expect(describeLoadError("boom")).toBe("boom");
    expect(describeLoadError("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });

  it("空报错 → 兜一句", () => {
    expect(describeLoadError("")).toBe("转换失败");
  });
});
