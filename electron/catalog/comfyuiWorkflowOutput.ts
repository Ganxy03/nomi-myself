import type { ComfyGraph, OutputNodeCandidate, WorkflowBinding } from './comfyuiWorkflowImport'
import type { ComfyObjectInfoIndex } from '../comfyuiObjectInfo'
import { desktopT } from '../i18n'

type OutputKind = NonNullable<WorkflowBinding['outputKind']>
type ResolvedOutput = { outputNodeId: string; outputKind: OutputKind }

// File/preview outputs, not data types: SaveWEBM returns IMAGE internally but saves video.
// CreateVideo only builds an in-memory VIDEO; official nodes_video.py requires a saver after it.
export function comfyOutputKind(classType: string): OutputNodeCandidate['kind'] | undefined {
  if (/videocombine|savevideo|saveanimated|savewebp|savewebm/i.test(classType)) return 'video'
  if (/saveglb|preview3d|save3d|savemesh/i.test(classType)) return 'model3d'
  if (/saveimage|previewimage|maskpreview/i.test(classType)) return 'image'
  if (/saveaudio|savesvg|savewav|saveflac/i.test(classType)) return 'unsupported'
  return undefined
}

export function comfyOutputCandidates(graph: ComfyGraph, index?: ComfyObjectInfoIndex | null): OutputNodeCandidate[] {
  return Object.entries(graph).flatMap(([nodeId, node]) => {
    const classType = node.class_type ?? ''
    const kind = comfyOutputKindForClass(index, classType)
    return kind ? [{ nodeId, classType, kind }] : []
  })
}

export function suggestedComfyOutput(candidates: OutputNodeCandidate[]): ResolvedOutput | undefined {
  for (const kind of ['video', 'model3d', 'image'] as const) {
    const matching = candidates.filter((candidate) => candidate.kind === kind)
    // 前缀锚点（H3StudioSaveImage / H3StudioExportClip 这类前缀式命名）也要认得：
    // `^(save|export)` 只中内置节点的写法，自建节点一律落到 matching[0]，
    // 于是「保存节点」被图里位置更靠前的 PreviewImage / 开关节点顶掉。
    const selected = matching.find((candidate) => /^(save|export)|videocombine/i.test(candidate.classType))
      ?? matching.find((candidate) => /save|export|write|record/i.test(candidate.classType))
      ?? matching[0]
    if (selected) return { outputNodeId: selected.nodeId, outputKind: kind }
  }
  return undefined
}

/**
 * 2026-10-23 新增：产物类型**认声明**，不认类名。
 *
 * 上面那串正则是「作者希望类名长这样」的假设：SaveVideo / VideoCombine / SaveImage 内置节点全中，
 * 但自建保存节点只要类名不含 savevideo/saveimage，就**连候选都不是**——导入时直接报 noOutput，
 * 用户被迫手工指一个输出节点（而选错 = `partial_execution_targets` 指错 = 跑局部图不出东西）。
 * /object_info 里节点已经申报了自己的 RETURN_TYPES（`"output": ["VIDEO"]`）与 OUTPUT_NODE 标志，照读即可。
 * undefined = 「声明里看不出是什么」→ 交回类名正则，绝不硬猜成 image。
 */
export function comfyOutputKindByTypes(index: ComfyObjectInfoIndex | null | undefined, classType: string): OutputNodeCandidate['kind'] | undefined {
  const info = index?.classes.get(classType)
  if (!info || info.outputs.length === 0) return undefined;
  const has = (type: string) => info.outputs.some((slot) => slot.toUpperCase() === type);
  // 顺序即优先级：同时出 VIDEO 与 IMAGE 时按视频算（SaveWEBM 这类内部产 IMAGE、实存视频）。
  if (has('VIDEO')) return 'video';
  if (has('3D') || has('MESH') || has('GLB')) return 'model3d';
  if (has('AUDIO')) return 'unsupported';
  if (has('IMAGE')) return 'image';
  return undefined;
}

/**
 * 类名优先（内置节点的语义更正：SaveWEBM 内部出 IMAGE、实存视频），类名认不出再读**声明**。
 *
 * 声明这一路必须同时看到 OUTPUT_NODE：只凭「这个节点会输出 IMAGE」就把 H3StudioLazyImageSwitch
 * 这类**旁路开关**当成产物节点，等于把 `partial_execution_targets` 指到一根线上——
 * ComfyUI 于是只跑到那个开关就停，一个文件都不存，界面报「跑完了但没有产物」。
 */
export function comfyOutputKindForClass(index: ComfyObjectInfoIndex | null | undefined, classType: string): OutputNodeCandidate['kind'] | undefined {
  const byClass = comfyOutputKind(classType)
  if (byClass) return byClass
  if (index?.classes.get(classType)?.outputNode !== true) return undefined
  return comfyOutputKindByTypes(index, classType)
}

function downstreamVideoOutputs(graph: ComfyGraph, source: string, index?: ComfyObjectInfoIndex | null): OutputNodeCandidate[] {
  const children = new Map<string, Set<string>>()
  for (const [nodeId, node] of Object.entries(graph)) {
    for (const input of Object.values(node.inputs ?? {})) {
      if (!Array.isArray(input) || input.length !== 2 || typeof input[0] !== 'string' || typeof input[1] !== 'number') continue
      const targets = children.get(input[0]) ?? new Set<string>()
      targets.add(nodeId)
      children.set(input[0], targets)
    }
  }
  const reachable = new Set([source])
  // Set iteration also visits newly added elements, with cycle protection.
  for (const nodeId of reachable) for (const child of children.get(nodeId) ?? []) reachable.add(child)
  return comfyOutputCandidates(graph, index).filter((candidate) => reachable.has(candidate.nodeId) && candidate.kind === 'video')
}

/** Selected output is authoritative. A stale label must never change the actual media contract. */
export function resolveComfyWorkflowOutput(graph: ComfyGraph, binding: WorkflowBinding, index?: ComfyObjectInfoIndex | null): ResolvedOutput {
  const nodeId = binding.outputNodeId
  if (!nodeId) {
    const suggested = suggestedComfyOutput(comfyOutputCandidates(graph, index))
    if (suggested) return suggested
    throw new Error(desktopT('comfyWorkflow.noOutput'))
  }
  const node = graph[nodeId]
  if (!node) throw new Error(desktopT('comfyWorkflow.outputNodeMissing', { id: nodeId }))
  const classType = node.class_type ?? ''
  if (/^CreateVideo$/i.test(classType)) {
    const outputs = downstreamVideoOutputs(graph, nodeId, index)
    if (outputs.length === 1) return { outputNodeId: outputs[0].nodeId, outputKind: 'video' }
    throw new Error(desktopT('comfyWorkflow.createVideoNotOutput'))
  }
  const kind = comfyOutputKindForClass(index, classType)
  if (kind === 'unsupported') throw new Error(desktopT('comfyWorkflow.unsupportedOutput', { classType }))
  // Explicit declarations remain available for custom nodes; absence is never guessed as image.
  const outputKind = kind ?? binding.outputKind
  if (!outputKind) throw new Error(desktopT('comfyWorkflow.unknownOutput', { classType }))
  return { outputNodeId: nodeId, outputKind }
}
