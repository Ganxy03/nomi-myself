import { describe, expect, it } from 'vitest'
import { resolveRenderedControls } from './nodeModelArchetype'
import type { ModelOption } from '../../../config/models'

// ComfyUI 模型的控件渲染口径（2026-10-23）。
//
// ComfyUI 现在也有能力契约（导入的工作流与内置预置都有），而能力契约会**解析成档案**。
// 若画布按「认得档案的模型」渲染，控件就被换成「档案模式参数」那套口径——
// 用户在工作流里认得的控件（宽度/步数/帧率…）被契约里那份展示用副本顶掉。
// 故 ComfyUI 一律走平铺口径：控件来自 meta.parameters（工作流/预置自己声明的那份）。
describe('ComfyUI 模型的控件渲染口径', () => {
  const contract = {
    version: 1,
    kind: 'image',
    defaultModeId: 'text_to_image',
    transportTaskKind: 'text_to_image',
    modes: [
      {
        id: 'text_to_image',
        intent: 'text',
        vendorTerm: '文生图',
        hint: '由导入的 ComfyUI 工作流自动识别',
        slots: [],
        params: [{ key: 'contract_only', label: '契约里的展示副本', type: 'number', defaultValue: 7, options: [] }],
        promptRequired: true,
        transportTaskKind: 'text_to_image',
      },
    ],
  }

  const meta = {
    parameters: [
      { key: 'comfy_width', label: '宽度', type: 'number', default: 512 },
      { key: 'ckpt_name', label: '模型权重（checkpoint 文件名）', type: 'text', default: '', placeholder: '留空 = 自动用本机第一个 checkpoint' },
    ],
    customCapabilityContract: contract,
  }

  it('内置 ComfyUI 预置（有档案有契约）：渲染平铺参数，不被契约顶掉', () => {
    const option = {
      value: 'comfyui-txt2img',
      modelKey: 'comfyui-txt2img',
      vendor: 'comfyui-local',
      label: '本地 · 文生图',
      meta,
    } as unknown as ModelOption
    const controls = resolveRenderedControls(option, meta, true, false)
    expect(controls.map((control) => control.key)).toEqual(['comfy_width', 'ckpt_name'])
    expect(controls.map((control) => control.key)).not.toContain('contract_only')
  })

  it('导入进来的 ComfyUI 工作流（第 2+ 台实例的 vendorKey）：同样是平铺参数', () => {
    const option = {
      value: 'comfy-h3-hz01-mvkks5vh',
      modelKey: 'comfy-h3-hz01-mvkks5vh',
      vendor: 'comfyui-local--candidate-ec0e62ae63924945',
      label: 'H3 导演台 · 文生视频',
      meta,
    } as unknown as ModelOption
    const controls = resolveRenderedControls(option, meta, true, false)
    expect(controls.map((control) => control.key)).toEqual(['comfy_width', 'ckpt_name'])
  })

  it('非 ComfyUI 供应商：契约照常接管（别把这次的口径扩到别人身上）', () => {
    const option = {
      value: 'other-model',
      modelKey: 'other-model',
      vendor: 'some-vendor',
      label: '别的模型',
      meta,
    } as unknown as ModelOption
    const controls = resolveRenderedControls(option, meta, true, false)
    expect(controls.map((control) => control.key)).toEqual(['contract_only'])
  })
})
