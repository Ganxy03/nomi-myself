// 生成任务的**阶段**词表（2026-10-23，ComfyUI 接入这批改动带出来的）。
//
// 为什么落到 electron/shared：同一套阶段名现在有两处消费者——
//   · 渲染层给用户看的进度（src/workbench/observability/narrate.ts）
//   · 主进程 ComfyUI 候选真机验证回报的「卡在哪一段」（electron/tasks/comfyCandidateTest.ts）
// 两边各抄一份，词表就会分叉：渲染层认 'finalizing'，主进程不认；
// 于是同一件事在两处说得不一样，排查时对不上号。
//
// 所以这里只留**一个** owner（中立模块，主进程与渲染层都能引），
// 两侧都从它派生。改阶段名只改这一处。
//
// 边界：这里只放**语义词表**（有哪些阶段），不放文案、不放时长、不放排序。
// 文案归渲染层的 narrate 注册表；主进程不给人看句子，只报阶段名。

/** 生成任务会经过的阶段，按时间顺序。 */
export const GENERATION_PHASES = [
  'queued', //     已入队，还没开始跑
  'submitting', //  正在把请求发给后端
  'generating', //  后端在跑（采样/生成中）
  'finalizing', //  正在把结果收尾（落盘/归一）
  'failed', //     终态：失败
] as const

export type GenerationPhase = typeof GENERATION_PHASES[number]
