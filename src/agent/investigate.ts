import { check, type ProgressEvent } from '../check.ts';
import type { Caller, CheckResult } from '../types.ts';
import { planCheck, toCheckInput, type Plan } from './plan.ts';

export type InvestigationEvent = { type: 'plan'; plan: Plan; model?: string; signed: boolean } | ProgressEvent;

// The whole agent: plan from a free-form question (signed), then buy evidence, verify it, and judge (signed).
export const investigate = async (question: string, call: Caller, onEvent?: (e: InvestigationEvent) => void): Promise<CheckResult> => {
  const q = question.trim();
  if (q.length < 8) throw new Error('Ask about a headline in at least a few words.');
  const { plan, attestation, model } = await planCheck(q, call);
  onEvent?.({ type: 'plan', plan, model, signed: Boolean(attestation) });
  return check(toCheckInput(plan), call, onEvent, { question: q, reply: plan.reply, model, attestation });
};
