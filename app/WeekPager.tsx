"use client";

import { isCurrentWeek, weekLabel } from "./weekUtils";

export default function WeekPager({
  weekKey,
  index,
  count,
  onPrev,
  onNext,
}: {
  weekKey: string;
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="week-pager">
      <button className="week-nav-btn" onClick={onPrev} disabled={index <= 0} aria-label="Previous week">
        ‹
      </button>
      <div className="week-pager-label">
        <div>{weekLabel(weekKey)}</div>
        {isCurrentWeek(weekKey) && <div className="week-pager-sub">This week</div>}
      </div>
      <button className="week-nav-btn" onClick={onNext} disabled={index >= count - 1} aria-label="Next week">
        ›
      </button>
    </div>
  );
}
