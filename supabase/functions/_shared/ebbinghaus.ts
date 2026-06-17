// Ebbinghaus review interval schedule
const DEFAULT_INTERVALS = [1, 2, 4, 7, 15, 30];

export interface EbbinghausResult {
  review_stage: number;
  scheduled_date: string; // ISO date YYYY-MM-DD
  next_review_interval: number;
}

export function initialSchedule(
  intervals = DEFAULT_INTERVALS,
  initialInterval = 1,
): EbbinghausResult {
  return {
    review_stage: 0,
    scheduled_date: new Date(Date.now() + initialInterval * 86400000)
      .toISOString()
      .slice(0, 10),
    next_review_interval: intervals[0] || initialInterval,
  };
}

export function advanceOnCompletion(
  intervals = DEFAULT_INTERVALS,
  currentStage: number,
  completionDate: Date,
): EbbinghausResult {
  const nextStage = currentStage + 1;
  const interval = intervals[Math.min(nextStage, intervals.length - 1)];
  const nextDate = new Date(completionDate.getTime() + interval * 86400000);

  return {
    review_stage: nextStage,
    scheduled_date: nextDate.toISOString().slice(0, 10),
    next_review_interval: interval,
  };
}
