// 「这个键名像不像正向提示词」——规则派生，不列白名单（2026-10-23 从 comfyuiWorkflowImport.ts 拆出）。
//
// 为什么独立成文件：媒体槽判据（comfyuiWorkflowMediaSlots）也要用这条判据排雷——文本节点里写着
// ".png" 的字符串不是媒体槽。判据住在 import.ts 会让两个模块形成**运行时循环**（boundaries 门岗红），
// 所以提到两边都能引的叶子模块。仍从 comfyuiWorkflowImport 转出，调用方（含既有测试）一行不改。
const INLINE_PROMPT_KEYS = new Set(["prompt", "positive_prompt", "text", "description"]);

/**
 * 明确**不是**正向提示词的键（命中 `*_prompt` 规则但语义相反/另有用途）。
 * 实测本机 ComfyUI 全量 object_info：negative_prompt 出现在 30 个节点类、system_prompt 9 个。
 */
const NON_POSITIVE_PROMPT_KEYS = new Set(["negative_prompt", "system_prompt"]);

/**
 * 白名单追不完：实测真实键名有 prompt_text(3 类) / texture_prompt(2) / user_prompt / structured_prompt /
 * text_prompt / text_style_prompt……以后厂商还会造新的。规则=「叫 prompt/text/description，
 * 或以 _prompt 结尾、prompt_ 开头」，再减掉明确非正向的那几个。
 */
export function isPromptLikeKey(inputKey: string): boolean {
  const key = inputKey.toLowerCase();
  if (NON_POSITIVE_PROMPT_KEYS.has(key) || key.includes("negative")) return false;
  return INLINE_PROMPT_KEYS.has(key) || key.endsWith("_prompt") || key.startsWith("prompt_");
}