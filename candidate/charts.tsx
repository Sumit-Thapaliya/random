'use client';

import {
  SKILL_DEMAND,
  WEEKLY,
  type ApplicationStatus,
  PIPELINE_ORDER,
} from './mock-data';

/* All charts are hand-rolled SVG so they inherit the theme tokens
 * (`hsl(var(--primary))`, …) and work in light + dark with no chart library.
 * Animations reuse the keyframes already declared in tailwind.config.ts:
 * `draw` for lines, `grow-bar` for bars, `pop-in` for points. */

const W = 600;
const H = 200;
const PAD = 28;

function toPoints(values: number[], max: number) {
  return values.map((value, index) => {
    const x = PAD + (index * (W - PAD * 2)) / Math.max(values.length - 1, 1);
    const y = H - PAD - (value / max) * (H - PAD * 2);
    return [x, y] as const;
  });
}

function toPath(points: ReadonlyArray<readonly [number, number]>) {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`)
    .join(' ');
}

/** Applications vs profile views across the last 8 weeks. */
export function ApplicationsTrend() {
  const max =
    Math.max(
      ...WEEKLY.map((week) => week.applications),
      ...WEEKLY.map((week) => week.views),
    ) * 1.15;

  const apps = toPoints(WEEKLY.map((week) => week.applications), max);
  const views = toPoints(WEEKLY.map((week) => week.views), max);
  const areaPath = `${toPath(apps)} L${apps[apps.length - 1][0]},${H - PAD} L${apps[0][0]},${H - PAD} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-52 w-full"
      role="img"
      aria-label="Applications sent and profile views per week"
    >
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD - t * (H - PAD * 2)}
          y2={H - PAD - t * (H - PAD * 2)}
          stroke="hsl(var(--border))"
          strokeDasharray="4 6"
        />
      ))}

      <path
        d={areaPath}
        fill="hsl(var(--primary))"
        fillOpacity="0.08"
        className="animate-fade-in"
      />

      <path
        d={toPath(views)}
        fill="none"
        stroke="hsl(var(--info))"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="chart-line animate-draw"
      />
      <path
        d={toPath(apps)}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="chart-line animate-draw"
        style={{ animationDelay: '250ms' }}
      />

      {views.map(([x, y], index) => (
        <circle
          key={`v-${index}`}
          cx={x}
          cy={y}
          r="3"
          fill="hsl(var(--card))"
          stroke="hsl(var(--info))"
          strokeWidth="2"
          className="animate-pop-in"
          style={{ animationDelay: `${400 + index * 80}ms` }}
        />
      ))}
      {apps.map(([x, y], index) => (
        <circle
          key={`a-${index}`}
          cx={x}
          cy={y}
          r="3.5"
          fill="hsl(var(--card))"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          className="animate-pop-in"
          style={{ animationDelay: `${500 + index * 80}ms` }}
        />
      ))}

      {WEEKLY.map((week, index) => (
        <text
          key={week.week}
          x={PAD + (index * (W - PAD * 2)) / Math.max(WEEKLY.length - 1, 1)}
          y={H - 8}
          textAnchor="middle"
          className="fill-[hsl(var(--muted-foreground))] text-[10px] font-medium"
        >
          {week.week}
        </text>
      ))}
    </svg>
  );
}

/** Applications per week as bars growing from the baseline. */
export function WeeklyBars() {
  const max = Math.max(...WEEKLY.map((week) => week.applications)) * 1.2;

  return (
    <div className="flex h-52 items-end gap-3">
      {WEEKLY.map((week, index) => (
        <div key={week.week} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {week.applications}
          </span>
          <div className="flex h-full w-full items-end">
            <div
              className="bar-grow w-full rounded-t-lg bg-primary animate-grow-bar"
              style={{
                height: `${Math.max((week.applications / max) * 100, 4)}%`,
                animationDelay: `${index * 80}ms`,
              }}
            />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground">
            {week.week}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal demand bars: green where the candidate has the skill,
 * hollow where it is still a gap. */
export function SkillDemandBars() {
  const max = Math.max(...SKILL_DEMAND.map((item) => item.roles));

  return (
    <ul className="space-y-3">
      {SKILL_DEMAND.map((item, index) => (
        <li
          key={item.skill}
          className="animate-fade-in-up"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="mb-1 flex items-center justify-between text-xs">
            <span
              className={
                item.hasSkill
                  ? 'font-semibold text-foreground'
                  : 'font-medium text-muted-foreground'
              }
            >
              {item.skill}
              {item.hasSkill ? (
                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  have
                </span>
              ) : (
                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                  gap
                </span>
              )}
            </span>
            <span className="font-semibold text-muted-foreground">
              {item.roles} role{item.roles === 1 ? '' : 's'}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={
                item.hasSkill
                  ? 'h-full rounded-full bg-primary transition-all duration-700'
                  : 'h-full rounded-full bg-warning/60 transition-all duration-700'
              }
              style={{ width: `${(item.roles / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Candidate funnel: how many applications sit at each stage. */
export function PipelineFunnel({
  counts,
}: {
  counts: Record<ApplicationStatus, number>;
}) {
  const stages = PIPELINE_ORDER;
  const max = Math.max(...stages.map((stage) => counts[stage]), 1);
  const total = stages.reduce((sum, stage) => sum + counts[stage], 0);

  return (
    <div className="space-y-3">
      {stages.map((stage, index) => {
        const count = counts[stage];
        const previous = index > 0 ? counts[stages[index - 1]] : null;
        const conversion =
          previous && previous > 0 ? Math.round((count / previous) * 100) : null;

        return (
          <div
            key={stage}
            className="animate-fade-in-up"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold">{stage}</span>
              <span className="flex items-center gap-2">
                {conversion !== null && count > 0 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {conversion}% of {stages[index - 1]}
                  </span>
                ) : null}
                <span className="font-bold tabular-nums">{count}</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  stage === 'Applied'
                    ? 'h-full rounded-full bg-muted-foreground/40 transition-all duration-700'
                    : stage === 'Shortlisted'
                      ? 'h-full rounded-full bg-info transition-all duration-700'
                      : stage === 'Interview'
                        ? 'h-full rounded-full bg-warning transition-all duration-700'
                        : stage === 'Offer'
                          ? 'h-full rounded-full bg-primary transition-all duration-700'
                          : 'h-full rounded-full bg-success transition-all duration-700'
                }
                style={{ width: `${Math.max((count / max) * 100, 3)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{total}</span> live in
        the funnel right now.
      </p>
    </div>
  );
}

/** Donut of application sources - same idiom as the recruiter dashboard. */
export function SourcesDonut({
  slices,
}: {
  slices: Array<{ label: string; value: number; colorClass: string }>;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const strokeFor = (colorClass: string) => {
    if (colorClass.includes('info')) return 'hsl(var(--info))';
    if (colorClass.includes('warning')) return 'hsl(var(--warning))';
    if (colorClass.includes('success')) return 'hsl(var(--success))';
    return 'hsl(var(--primary))';
  };

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 140 140"
        className="h-40 w-40 shrink-0"
        role="img"
        aria-label="Where your applications came from"
      >
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="18"
        />
        {slices.map((slice) => {
          const length = (slice.value / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const element = (
            <circle
              key={slice.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={strokeFor(slice.colorClass)}
              strokeWidth="18"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              className="animate-fade-in"
            />
          );
          offset += length;
          return element;
        })}
        <text
          x="70"
          y="66"
          textAnchor="middle"
          className="fill-[hsl(var(--foreground))] text-[22px] font-bold"
        >
          {slices.length}
        </text>
        <text
          x="70"
          y="84"
          textAnchor="middle"
          className="fill-[hsl(var(--muted-foreground))] text-[10px] font-medium"
        >
          sources
        </text>
      </svg>

      <ul className="space-y-2 text-sm">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${slice.colorClass}`} />
            <span className="font-medium">{slice.label}</span>
            <span className="ml-auto font-semibold text-muted-foreground">
              {slice.value}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Compact donut showing how the candidate's fit scores are distributed. */
export function MatchDonut({
  buckets,
  average,
}: {
  buckets: Array<{ label: string; value: number; tone: string }>;
  /** Weighted average match across all applications, shown in the middle. */
  average: number;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0) || 1;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 140 140"
        className="h-36 w-36 shrink-0"
        role="img"
        aria-label="Distribution of match scores across your applications"
      >
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="16"
        />
        {buckets.map((bucket) => {
          const length = (bucket.value / total) * circumference;
          const element = (
            <circle
              key={bucket.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={bucket.tone}
              strokeWidth="16"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
              className="animate-fade-in"
            />
          );
          offset += length;
          return element;
        })}
        <text
          x="70"
          y="75"
          textAnchor="middle"
          className="fill-[hsl(var(--foreground))] text-[20px] font-bold"
        >
          {average}%
        </text>
      </svg>

      <ul className="space-y-2 text-sm">
        {buckets.map((bucket) => (
          <li key={bucket.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: bucket.tone }}
            />
            <span className="font-medium">{bucket.label}</span>
            <span className="ml-auto font-semibold text-muted-foreground">
              {bucket.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
