/**
 * @file server/modules/ai/contracts.ts
 * AI Gateway Interface Specifications & Provider Abstraction
 */

import { UUID } from '../../core/types.ts';

export type AITaskType =
  | 'copilot_suggest'
  | 'conversation_summary'
  | 'sentiment_intent_analysis'
  | 'supervisor_risk_eval'
  | 'qa_rubric_audit'
  | 'nl_analyst_query'
  | 'roleplay_simulation'
  | 'knowledge_retrieval';

export type PrivacyClassification = 'public' | 'confidential' | 'restricted_pii';

export interface AIRouteRequest {
  organizationId: UUID;
  task: AITaskType;
  input: string;
  contextData?: Record<string, unknown>;
  privacy: PrivacyClassification;
  maxTokens?: number;
  temperature?: number;
  forceLocal?: boolean;
}

export interface AIRouteResponse {
  runId: UUID;
  provider: 'local_heuristic' | 'local_ollama' | 'cloud_gemini' | 'cloud_fallback';
  model: string;
  content: string;
  structuredOutput?: Record<string, unknown>;
  citations?: Array<{ documentId: string; chunkId: string; title: string; confidence: number }>;
  tokensUsed: { input: number; output: number; total: number };
  costUsd: number;
  latencyMs: number;
  isHallucinationSafe: boolean;
}

export interface AIProviderAdapter {
  id: string;
  name: string;
  isLocal: boolean;
  isAvailable(): Promise<boolean>;
  generate(request: AIRouteRequest): Promise<AIRouteResponse>;
}

export interface AICostBudgetPolicy {
  organizationId: UUID;
  dailyBudgetLimitUsd: number;
  monthlyBudgetLimitUsd: number;
  currentDaySpendUsd: number;
  currentMonthSpendUsd: number;
  cloudFallbackEnabled: boolean;
  alertThresholdPercent: number; // e.g. 80%
}

export interface PromptTemplate {
  id: string;
  task: AITaskType;
  version: number;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema?: Record<string, unknown>;
  antiHallucinationGuardrails: string[];
}
