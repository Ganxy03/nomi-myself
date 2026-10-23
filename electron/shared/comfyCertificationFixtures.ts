/**
 * Deterministic, in-memory media used by the ComfyUI certification run.
 *
 * These are deliberately data URLs: the normal asset-localization path can
 * decode and upload them to the user's ComfyUI instance, while no temporary
 * source file or user project is needed. Each image slot receives a different
 * visible color so a fixture cannot accidentally prove that every slot was
 * wired to the same input.
 */

export type ComfyCertificationMediaSlot = {
  paramKey: string;
  label: string;
  mediaKind: "image" | "video" | "audio";
};

/**
 * 16 张**互不相同**的纯色 64x64 PNG（2026-10-23 重新生成）。
 *
 * 原来是 8 张 1x1。改的原因有两条，都不是为了好看：
 *   · **数量**：8 是个硬上限，超了直接抛 `comfy_certification_fixture_capacity:8`——而 MiniMax-H3
 *     允许 9 张参考图，用户那条 H3 工作流正好卡在第 9 张上，验证根本迈不出去。放到 16。
 *   · **尺寸**：1x1 的图过不去多数视频模型的预处理（分辨率下限），canonical run 会以「图不行」
 *     收场——那不是工作流的毛病，是我们自己的夹具太小。64x64 纯色足够小（~200B）又普遍可接受。
 * 每张颜色不同这件事本身是契约：夹具必须能证明每个槽真的接到了各自的输入，
 * 全用同一张就等于没验证接线（见文件头注释）。
 */
const IMAGE_FIXTURES = [
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItz/fMYxgi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLzk8EPlvGqjQAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjCMMa1Qi+hcEKLDX9WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgvp80DxzCIEtAAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsMtkHLMbxgi+hcEKLNXzWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgtfq4FLf0E8ywAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjf4xjGCP4FgYrsEzXaxEQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQuCxSvoGWu3peAAAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsAtmWOMYywi+hcEKLF3zWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgvNdkGHgS+v5QAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItj/wCXzQi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLtDUGHqhy2HAAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsAtmMGMbwQi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELguOSEGHl+IEzwAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjHOMY3wi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgtl5gDibHpziwAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsMtpCBMbxgi+hcEKLDX9WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgsNlEGHwntaUwAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsAtmRHOawwi+hcEKLFP9WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgvQKeGHG02BuQAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsEtnJmMbwQi+hcEKLNXzWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELguPOeGH0bSujQAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsIttMOMYxgi+hcEKLD31WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgvkD4HhVs+2KAAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsEtnOuMY0Ai+hcEKLF3zWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgsm1GFp4R4OSgAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsAtmfwxhGCP4FgYrsFTPaxEQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQuCyaYAHDOxZ4PgAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAATklEQVR42u3PQQkAAAgEsItoMDtrBN/CYAWW6XotAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKXBRqFsbS92X+bAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAATElEQVR42u3PMQ0AAAwDoOqsfyGVsHsJOCB9LgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIClwEMTODxihgWdQAAAABJRU5ErkJggg==",
] as const;

const VIDEO_FIXTURE =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAN1bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAMgAAQAAAQAAAAAAAAAAAAAAAAEAAAAA" +
  "AAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAAB" +
  "AAAAAAAAAMgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAA" +
  "AAEAAADIAAAEAAABAAAAAAIXbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAACgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRl" +
  "b0hhbmRsZXIAAAABwm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYJzdGJsAAAAvnN0c2QA" +
  "AAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "GP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAMg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAHTgAAB0" +
  "4AAAABhzdHRzAAAAAAAAAAEAAAAFAAACAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAOGN0dHMAAAAAAAAABQAAAAEAAAQAAAAAAQAACgAAAAABAAAEAAAAAAEA" +
  "AAAAAAAAAQAAAgAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAUAAAABAAAAKHN0c3oAAAAAAAAAAAAAAAUAAAK8AAAADAAAAAwAAAAMAAAADAAAABRzdGNvAAAA" +
  "AAAAAAEAAAOlAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAAB" +
  "AAAAAExhdmY1OC43Ni4xMDAAAAAIZnJlZQAAAvRtZGF0AAACoAYF//+c3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2MSAtIEguMjY0L01QRUctNCBB" +
  "VkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjAgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0z" +
  "IGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5n" +
  "ZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIg" +
  "dGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9" +
  "MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29w" +
  "PTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBt" +
  "YnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAABRliIQAM//+" +
  "3zL4FNaFDnRCM2R0vwAAAAhBmiRsQr/+wAAAAAhBnkJ4hf/BgQAAAAgBnmF0Qr/EgAAAAAgBnmNqQr/EgQ==";


// 最小合法 WAV（8kHz 单声道 16-bit，8 个静音采样，44 字节头 + 16 字节数据）——
// 与上面 IMAGE_FIXTURES/VIDEO_FIXTURE 同一用途：证明 LoadAudio 声明的媒体槽在「运行测试」
// 真跑链路里也收得到素材，不是加了识别却在真提交这一步又漏掉（用户报的根因之一
// 「ComfyUI 音频输入用不了」——半吊子实现最容易在这类"最后一米"的地方复发）。
const AUDIO_FIXTURE = "UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";

function dataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64.replace(/\s+/g, "")}`;
}

/** Build explicit per-slot params and the Comfy reference declaration. */
export function buildComfyCertificationFixtureParams(input: {
  vendorKey: string;
  modelKey: string;
  slots: readonly ComfyCertificationMediaSlot[];
}): Record<string, unknown> {
  if (input.slots.length > IMAGE_FIXTURES.length) {
    throw new Error(`comfy_certification_fixture_capacity:${IMAGE_FIXTURES.length}`);
  }
  const params: Record<string, unknown> = {};
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];
  for (const [index, slot] of input.slots.entries()) {
    const value = slot.mediaKind === "video"
      ? dataUrl("video/mp4", VIDEO_FIXTURE)
      : slot.mediaKind === "audio"
        ? dataUrl("audio/wav", AUDIO_FIXTURE)
        : dataUrl("image/png", IMAGE_FIXTURES[index]);
    params[slot.paramKey] = value;
    if (slot.mediaKind === "video") videoUrls.push(value);
    else if (slot.mediaKind === "audio") audioUrls.push(value);
    else imageUrls.push(value);
  }
  return {
    ...params,
    // The contract reader derives identity from the request metadata fields,
    // while the declaration carries the same identity for exact matching.
    // Keep both sides explicit so a candidate vendor cannot silently fall back
    // to legacy aggregate reference handling.
    modelKey: input.modelKey,
    modelVendor: input.vendorKey,
    ...(imageUrls.length ? { referenceImages: imageUrls } : {}),
    ...(videoUrls.length ? { referenceVideoUrls: videoUrls } : {}),
    ...(audioUrls.length ? { referenceAudioUrls: audioUrls } : {}),
    parameterReferenceSlots: {
      modelKey: input.modelKey,
      vendorKey: input.vendorKey,
      slots: input.slots.map((slot) => ({
        key: slot.paramKey,
        label: slot.label,
        mediaKind: slot.mediaKind,
        group: "reference" as const,
      })),
    },
  };
}
