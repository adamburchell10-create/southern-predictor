"use client";

import type { MatchweekKind } from "./weekUtils";

export default function WeekPager({
  label,
  kind,
  isCurrent,
  index,
  count,
  onPrev,
  onNext,
}: {
  label: string;
  kind: MatchweekKind;
  isCurrent: boolean;
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="week-pager">
      <button className="week-nav-btn" onClick={onPrev} disabled={index <= 0} aria-label="Previous matchweek">
        ‹
      </button>
      <div className="week-pager-label">
        <div className="week-pager-kind">{kind === "weekend" ? "Weekend fixtures" : "Midweek fixtures"}</div>
        <div>{label}</div>
        {isCurrent && <div className="week-pager-sub">This matchweek</div>}
      </div>
      <button className="week-nav-btn" onClick={onNext} disabled={index >= count - 1} aria-label="Next matchweek">
        ›
      </button>
    </div>
  );
}
