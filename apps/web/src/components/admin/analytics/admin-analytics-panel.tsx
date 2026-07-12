import type { AdminAnalyticsDay, AdminAnalyticsPayload } from "@folio/types";
import Link from "next/link";

type AnalyticsSection = "overview" | "operations" | "users" | "workspaces" | "audit" | "health";

const emptyQuery: Record<string, string | undefined> = {};

interface TrendSeries {
  key: string;
  label: string;
  values: number[];
  className: string;
}

const sectionContent: Record<
  AnalyticsSection,
  {
    trendTitle: string;
    distributionTitle: string;
    trend: (days: AdminAnalyticsDay[]) => TrendSeries[];
    distribution: (analytics: AdminAnalyticsPayload) => { key: string; value: number }[];
  }
> = {
  overview: {
    trendTitle: "작업 처리 추이",
    distributionTitle: "작업 상태 분포",
    trend: jobOutcomeSeries,
    distribution: (analytics) => analytics.distributions.jobs,
  },
  operations: {
    trendTitle: "작업 처리 추이",
    distributionTitle: "작업 상태 분포",
    trend: jobOutcomeSeries,
    distribution: (analytics) => analytics.distributions.jobs,
  },
  users: {
    trendTitle: "사용자 유입 추이",
    distributionTitle: "사용자 상태 분포",
    trend: (days) => [
      {
        key: "created",
        label: "가입",
        values: days.map((day) => day.users.created),
        className: "text-primary",
      },
    ],
    distribution: (analytics) => analytics.distributions.users,
  },
  workspaces: {
    trendTitle: "워크스페이스·저장소 추이",
    distributionTitle: "GitHub App 설치 상태",
    trend: (days) => [
      {
        key: "created",
        label: "워크스페이스",
        values: days.map((day) => day.workspaces.created),
        className: "text-primary",
      },
      {
        key: "enabled",
        label: "활성 저장소",
        values: days.map((day) => day.workspaces.enabledRepositories),
        className: "text-muted-foreground",
      },
    ],
    distribution: (analytics) => analytics.distributions.installations,
  },
  audit: {
    trendTitle: "관리 이벤트 추이",
    distributionTitle: "작업 유형 분포",
    trend: (days) => [
      {
        key: "events",
        label: "이벤트",
        values: days.map((day) => day.audit.events),
        className: "text-primary",
      },
    ],
    distribution: (analytics) => analytics.distributions.audit,
  },
  health: {
    trendTitle: "review_pull 처리 추이",
    distributionTitle: "작업 종류 분포",
    trend: jobOutcomeSeries,
    distribution: (analytics) => analytics.distributions.jobKinds,
  },
};

export function AdminAnalyticsPanel({
  analytics,
  section,
}: {
  analytics: AdminAnalyticsPayload;
  section: AnalyticsSection;
}) {
  const content = sectionContent[section];
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(16rem,0.85fr)]">
      <TrendChart
        title={content.trendTitle}
        days={analytics.days}
        series={content.trend(analytics.days)}
      />
      <DistributionChart
        title={content.distributionTitle}
        values={content.distribution(analytics)}
      />
    </div>
  );
}

export function AdminAnalyticsRange({
  range,
  pathname,
  query = emptyQuery,
}: {
  range: AdminAnalyticsPayload["range"];
  pathname: string;
  query?: Record<string, string | undefined>;
}) {
  return (
    <nav aria-label="분석 기간" className="flex rounded-md border bg-card p-0.5 text-xs">
      {(["7d", "30d"] as const).map((value) => (
        <Link
          key={value}
          href={rangeHref(pathname, query, value)}
          className={`rounded px-2 py-1 transition-colors ${
            range === value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {value}
        </Link>
      ))}
    </nav>
  );
}

function TrendChart({
  title,
  days,
  series,
}: {
  title: string;
  days: AdminAnalyticsDay[];
  series: TrendSeries[];
}) {
  const maximum = Math.max(1, ...series.flatMap((item) => item.values));
  const width = 600;
  const height = 180;
  const inset = 18;
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <i
                className={`size-1.5 rounded-full bg-current ${item.className}`}
                aria-hidden="true"
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <svg
        role="img"
        aria-label={`${title}: ${series.map((item) => `${item.label} ${item.values.reduce((sum, value) => sum + value, 0)}`).join(", ")}`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-44 w-full overflow-visible"
      >
        <title>{title}</title>
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={inset}
            x2={width - inset}
            y1={height - inset - (height - inset * 2) * ratio}
            y2={height - inset - (height - inset * 2) * ratio}
            className="stroke-border"
            strokeWidth="1"
          />
        ))}
        {series.map((item) => (
          <path
            key={item.key}
            d={linePath(item.values, maximum, width, height, inset)}
            className={item.className}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{formatDay(days[0]?.date)}</span>
        <span>{formatDay(days.at(-1)?.date)}</span>
      </div>
    </section>
  );
}

function DistributionChart({
  title,
  values,
}: {
  title: string;
  values: { key: string; value: number }[];
}) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <span className="font-mono text-xs text-muted-foreground">{total}</span>
      </div>
      {values.length ? (
        <dl className="space-y-3">
          {values.map((item) => {
            const ratio = total ? (item.value / total) * 100 : 0;
            return (
              <div key={item.key}>
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <dt className="truncate text-muted-foreground">{item.key}</dt>
                  <dd className="font-mono text-foreground">{item.value}</dd>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
                </div>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="py-10 text-center text-xs text-muted-foreground">기록된 데이터가 없습니다</p>
      )}
    </section>
  );
}

function jobOutcomeSeries(days: AdminAnalyticsDay[]): TrendSeries[] {
  return [
    {
      key: "succeeded",
      label: "성공",
      values: days.map((day) => day.jobs.succeeded),
      className: "text-primary",
    },
    {
      key: "failed",
      label: "실패",
      values: days.map((day) => day.jobs.failed),
      className: "text-muted-foreground",
    },
    {
      key: "dead",
      label: "dead",
      values: days.map((day) => day.jobs.dead),
      className: "text-destructive",
    },
  ];
}

function linePath(values: number[], maximum: number, width: number, height: number, inset: number) {
  const span = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = inset + ((width - inset * 2) * index) / span;
      const y = height - inset - ((height - inset * 2) * value) / maximum;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatDay(value: string | undefined) {
  return value ? value.slice(5).replace("-", ".") : "—";
}

function rangeHref(
  pathname: string,
  query: Record<string, string | undefined>,
  range: "7d" | "30d",
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }
  search.set("range", range);
  return `${pathname}?${search.toString()}`;
}
