export const CLARIS_LLM_TEST_CONTRACT_VERSION = 1 as const

export interface ClarisLlmTestDto {
  contractVersion: typeof CLARIS_LLM_TEST_CONTRACT_VERSION
  latencyMs: number
}
