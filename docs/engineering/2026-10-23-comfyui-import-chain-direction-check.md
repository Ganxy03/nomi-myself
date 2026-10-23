# 方向检查：ComfyUI 导入链路的类根因复盘（2026-10-23）

> 触发：`node scripts/fix-churn.mjs` 命中（`electron/desktopStrings.ts`、`electron/tasks/comfyCandidateTest.ts`、
> `src/workbench/generationCanvas/runner/catalogTaskActions.ts`、`src/ui/onboarding/ComfyuiWorkflowImportPanel.tsx`
> 等文件/目录 14 天内第 N 次 fix；概念「参数准入」「面向用户的文案不断言零成本」「发给供应商的参考图只能用当前方式声明的」命中）。
> 结论交用户拍板：本次不是第 N 轮修补，而是**把这一类一次性收口**——引入工作流 → 能力面的翻译层。

## 0. 一句话根因

**外部工作流（ComfyUI）接进 Nomi 时，缺一层「工作流事实 → Nomi 能力面」的统一翻译**，
于是每个入口各自去解读 `meta`（设置页找档案、画布找控件、真机验证找 taskKind、渲染层找文案），
同一份绑定被解读出四套说法，而任何一处没解读到就表现为「还在配置中」。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 设置页「输入与生成方式 · 尚未设置」 | 导入/预置模型无档案也无能力契约 → `resolveArchetypeForModel` 返回 null | 缺翻译层（能力面） |
| 永久「正在后台自动适配」 | `stageComfyWorkflow` 留 `adapter.state='testing'`，手动放行从不清 | 状态机缺终态（未验证 ≠ 验证中） |
| 画布控件被契约顶掉 | 有档案就按档案渲染，ComfyUI 的控件其实属于工作流自己 | 渲染口径没区分「档案模型」与「工作流模型」 |
| 媒体槽认不出（音频退化裸文本） | 判据是「键名白名单 ∧ 类名白名单」两道并联 | 判据写成合取 ⇒ 任一变化即失效 |
| 导入的图不是用户那张图 | 只看 `graphToPrompt()` 有没有吐出东西 | 缺保真闸（不验证「前端真的换了图」） |
| 视频工作流永远验证不过 | 候选真机验证时限一刀切 300s | 时限按「云端 API 出图」量级定，没按产物种类分档 |

## 2. 为什么这一类会一直出现

追到表示层：**Nomi 的能力面只有一份来源——模型档案（archetype）**。而 ComfyUI 工作流不是模型档案：
它的输入面写在绑定（`comfyWorkflowImport.binding`）里。两种表示没有翻译层，于是：

- 能力投影只认档案 → 档案缺失就「不知道这个模型怎么用」（症状 1）；
- 适配器状态是**候选租约**的状态机 → 手动放行没有对应的终态（症状 2）；
- 渲染口径以「有没有档案」为分支 → 两类模型被同一套控件逻辑处理（症状 3）。

**铁律落点**：症状 1 落在**铁律 ⑪「能选到」**——能力面没自动生成，画布模型列表就被「完成输入与请求方式后…」挡在门外，
用户永远选不到这条 ComfyUI 模型。症状 3 落在**铁律 ⑫「点了=以为的」**——用户在工作流里认得的控件被档案副本顶掉，
点下去得到的参数与预期不一致。最小证据：`electron/catalog/comfyuiCapabilityContract.test.ts`（能力面生成物）、
`src/workbench/generationCanvas/nodes/nodeModelArchetype.comfyui.test.ts`（渲染口径对照）、
`/private/tmp/nomi-harness/seed/verify.ts`（装好版目录的只读投影：三个 ComfyUI 模型 `inputContract:'known'`）。

## 3. 不改结构的话，接下来会冒出什么（可验证预测）

| 预测 | 怎么验证 |
|---|---|
| 再接一种外部工作流格式（InvokeAI / ComfyUI 新版 schema）时，「尚未设置」会再来一次 | 造一条只含 `parameters` + 绑定的目录行，跑 `resolveArchetypeForModel` → 期望 null |
| 媒体槽判据还会因节点改名而失效 | 改一个社区节点的类名（如 `LoadAudio` → `MyAudioLoader`），看 `resolveMediaWidgetKind` 是否仍认出（`/object_info` 声明类型这一路应兜住） |
| 导入静默失败还会复发 | 构造一个前端 `loadGraphData` 抛 DataCloneError 的工作流，期望 `verifyLoadedGraph` 判红而不是交出别人的图 |

## 4. 靶子独立性检查

- 尺子（能力投影脚本 `verify.ts`）与被测物（目录里的 meta）是**两条线**：尺子读盘上事实，不复用被测代码的判断。
- 有「修对了反而掉分」的先例吗：无——本次全部新增测试（`comfyuiCapabilityContract.test.ts`、
  `nodeModelArchetype.comfyui.test.ts`、`comfyui/graphFidelity.test.ts`）都是新文件，不改动旧断言的期望值。
- 靶子本身有错吗：没有。本次修的是**被测物（产品代码）**，尺子不动。

## 5. P0：这些是我们独有的吗？现成方案有哪些

- 「工作流 → 能力面翻译」**不是**独有领域：ComfyUI 官方有 `/object_info`（节点自报输入类型），Nomi 也有既有的
  `CustomCapabilityContractV1` 契约格式。独有部分只有一处：**ComfyUI 绑定 → 契约**的映射规则（产物类型、
  taskKind、提示词节点、媒体槽、数值参数）。其余一律接现成：契约格式接既有的，声明类型接 `/object_info`。
- 「生成阶段词表」也不是独有：接既有的 `GenerationFeedbackPhase`，本次收敛到中立模块
  `electron/shared/generationPhase.ts`（不新造第二份）。
- 命中概念「参数准入」「发给供应商的参考图只能用当前方式声明的」：本次**不新开特例分支**——
  ComfyUI 的参数仍走既有参数准入通道，契约里的参数只是展示副本。

## 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 复用既有 `CustomCapabilityContractV1` + 既有能力投影 + 既有 `isComfyuiVendorKey` 口径 | 低 | 低 | ✅ **推荐**（本次采用） |
| 补 | 在导入流程里手写「设置页看得懂」的字段 | 中 | 高（又是一份要同步的清单） | ❌ |
| 重写（限一个模块） | 重写能力投影层 | 高 | 高 | ❌ |
| 删 | 删掉 ComfyUI 的能力面翻译，回到手填 | 低 | 高（回到「尚未设置」） | ❌ |

## 7. 用户要权衡的核心

**要一条能立刻用的 ComfyUI 通道，还是一条永远自洽的能力面架构**——本次选了「先接通 + 把翻译层收进既有契约」，
代价是 ComfyUI 的控件走平铺口径（不复用档案参数），收益是不再需要用户手填工作流已经声明过的事实。

## 特征测试清单（动结构前先锁住）

- `electron/catalog/comfyuiCapabilityContract.test.ts`（能力面翻译：方式/槽/参数/超界默认值/坏键）
- `src/workbench/generationCanvas/nodes/nodeModelArchetype.comfyui.test.ts`（渲染口径：ComfyUI 平铺 vs 他人走档案）
- `electron/catalog/comfyuiLocal.test.ts`（内置预置带契约 + 老装机靠 seed 对账自愈）
- `electron/comfyui/graphFidelity.test.ts`（导入保真闸：没换图就判红）
- `electron/catalog/comfyuiManualEnable.test.ts`（手动放行落 `unverified` 并清 runId）
- 只读投影脚本 `/private/tmp/nomi-harness/seed/verify.ts`（装好版目录 → `inputContract:'known'`）

## 仍未闭环的（不属于本次提交，交用户拍板）

1. 配置的 ComfyUI 端点当前 404（gpuhome 实例号已失效），端到端真机验证跑不了；
2. Mac 上打出的 Windows 包缺 win32 版 ffmpeg/ffprobe/clipboard 二进制（pnpm 10 不再自动装跨平台可选依赖）；
3. 用户当前那台 2080Ti（11 GB）带不动 H3 工作流（int8 hybrid 权重 19.53 GB + Qwen3-VL-32B int8）。
