# AI Gateway & Intelligence Architecture (بوابة الذكاء الاصطناعي)

## 1. AI Gateway Overview

AI Contact Center OS abstracts model invocation behind an enterprise **AI Gateway**. Modules never execute direct HTTP calls to proprietary AI SDKs.

```
                  [Business Module Request]
                   (Task, Context, Privacy)
                              │
                              ▼
                      [AI Gateway Router]
                              │
         ┌────────────────────┴────────────────────┐
         │ (Privacy=High OR Cost=Zero OR Offline)  │ (Complex Reasoning & Cloud Enabled)
         ▼                                         ▼
  [Local Provider]                         [Cloud Provider]
  ├── Heuristic / Rule-based NLP           ├── Gemini 2.5 Flash / Pro
  └── Local Ollama HTTP Adapter            └── Anthropic / OpenAI Adapter
         │                                         │
         └────────────────────┬────────────────────┘
                              ▼
                     [Safety & Guardrails]
                              │
                     [Budget & Cost Guard]
                              │
                  [Audit Trail & Evaluation]
```

---

## 2. Dynamic Routing Matrix

Every request defines a `RoutingContext`:
```ts
interface AIRoutingContext {
  task: 'intent_classification' | 'copilot_suggest' | 'conversation_summary' | 'supervisor_eval' | 'qa_audit' | 'nl_analyst' | 'rag_query';
  complexity: 'simple' | 'medium' | 'complex';
  privacyLevel: 'public' | 'confidential' | 'restricted_pii';
  maxBudgetUsd?: number;
  allowCloudFallback: boolean;
}
```

### Decision Rules:
- **Simple Classification / Sentiment**: Local Engine (Latency < 20ms, Cost: $0.00).
- **Restricted PII / Confidential Customer Data**: Local Engine ONLY (Guaranteed zero egress).
- **Complex QA Auditing / Multi-turn Dialogue Summaries**: Cloud LLM if cloud mode enabled and budget available; else graceful fallback to structured local summarizer.
- **Budget Exhaustion**: If monthly or daily cap exceeded, automatically route to Local Engine without service interruption.

---

## 3. Strict Anti-Hallucination Contract
- AI responses that rely on knowledge base retrieval **MUST** output verifiable citation anchors (`[Source: Doc-ID Ch-3]`).
- If similarity confidence is below threshold (< 0.68) or retrieved chunks contain insufficient data, the AI is constrained by system prompt:
  > *"لا أعرف بناءً على الوثائق المتوفرة"* / *"لا توجد بيانات كافية في قاعدة المعرفة للرد بدقة"*.
- Fabricating policies, discounts, or terms not found in the ground truth is strictly intercepted by the post-generation validator.

---

## 4. Prompt Registry & Versioning
Prompts are treated as versioned database assets (`prompt_versions`):
- Semantic variables templated via Mustache (`{{customer_name}}`, `{{history}}`, `{{knowledge_context}}`).
- Prompts undergo automated regression evaluation before being promoted to `active` status.
