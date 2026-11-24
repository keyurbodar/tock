export interface GuardBudget {
  readonly maxConsecutiveIdentical: number;
  readonly maxSubrequestsPerSlice: number;
}

export const DEFAULT_GUARD_BUDGET: GuardBudget = {
  maxConsecutiveIdentical: 3,
  maxSubrequestsPerSlice: 35
};

export class ExecutionGuards {
  private readonly budget: GuardBudget;
  private readonly lastCallBySession = new Map<string, { sig: string; count: number }>();
  private sliceSubrequests = 0;

  constructor(budget: GuardBudget = DEFAULT_GUARD_BUDGET) {
    this.budget = budget;
  }

  resetSlice(): void {
    this.sliceSubrequests = 0;
  }

  recordSubrequest(n = 1): { allowed: boolean; used: number; limit: number } {
    this.sliceSubrequests += n;
    return {
      allowed: this.sliceSubrequests <= this.budget.maxSubrequestsPerSlice,
      used: this.sliceSubrequests,
      limit: this.budget.maxSubrequestsPerSlice
    };
  }

  checkLoop(sessionId: string, toolName: string, args: unknown): { blocked: boolean; count: number } {
    const sig = `${toolName}:${JSON.stringify(args ?? null)}`;
    const prev = this.lastCallBySession.get(sessionId);
    const count = prev && prev.sig === sig ? prev.count + 1 : 1;
    this.lastCallBySession.set(sessionId, { sig, count });
    return { blocked: count > this.budget.maxConsecutiveIdentical, count };
  }

  clearSession(sessionId: string): void {
    this.lastCallBySession.delete(sessionId);
  }
}
