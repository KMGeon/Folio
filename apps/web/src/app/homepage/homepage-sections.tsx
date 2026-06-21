import { ArrowRight, BookOpen, Braces, CheckCircle2, Github, Split } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { ChapterSceneBackground } from "@/components/three/chapter-scene-background";
import { Button } from "@/components/ui/button";
import { loginUrl } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { features, pricingPlans, proofPoints, reviewFlow } from "./homepage-data";
import styles from "./homepage.module.css";
import { LiveReviewBoard } from "./live-review-board";

export function HeroSection() {
  return (
    <section className={cn("relative min-h-svh overflow-hidden border-b", styles.heroShell)}>
      <ChapterSceneBackground />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/88 to-background/35"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background to-transparent"
      />
      <HomepageHeader />
      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-10 px-5 py-10 md:px-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(460px,0.92fr)]">
        <HeroCopy />
        <LiveReviewBoard />
      </div>
    </section>
  );
}

function HomepageHeader() {
  return (
    <header className="relative z-10 mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
      <Link href="/homepage" className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md border bg-primary/10 text-primary">
          <BookOpen className="size-4" />
        </div>
        <span className="font-semibold text-sm">Folio</span>
      </Link>
      <nav className="hidden items-center gap-6 text-muted-foreground text-xs md:flex">
        {[
          ["Product", "#product"],
          ["Workflow", "#workflow"],
          ["Pricing", "#pricing"],
          ["Security", "#security"],
        ].map(([label, href]) => (
          <a key={label} href={href} className="transition-colors hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>
      <Button asChild size="sm" variant="outline">
        <a href={loginUrl("/")}>
          <Github className="size-4" />
          로그인
        </a>
      </Button>
    </header>
  );
}

function HeroCopy() {
  return (
    <div className="max-w-3xl">
      <div className="inline-flex items-center gap-2 rounded-full border bg-background/55 px-3 py-1 font-mono text-muted-foreground text-xs">
        <Split className="size-3.5 text-primary" />
        GitHub-native PR review
      </div>
      <h1 className="mt-6 text-balance font-semibold text-4xl leading-tight tracking-tight md:text-6xl">
        PR을 읽는 순서까지 설계하는 리뷰 워크스페이스
      </h1>
      <p className="mt-5 max-w-2xl text-muted-foreground text-sm leading-6 md:text-base">
        Folio는 큰 pull request를 논리적인 리뷰 챕터로 나누고, 팀이 같은 순서로 변경 의도와 위험도를
        확인하게 합니다.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <a href={loginUrl("/")}>
            <Github className="size-4" />
            GitHub로 시작하기
          </a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="#workflow">
            리뷰 흐름 보기
            <ArrowRight className="size-4" />
          </a>
        </Button>
      </div>
      <div className="mt-8 grid gap-2 sm:grid-cols-3">
        {proofPoints.map((point) => (
          <div key={point} className="flex items-start gap-2 text-muted-foreground text-xs">
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-primary" />
            <span>{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductSection() {
  return (
    <section id="product" className="border-b px-5 py-16 md:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="PRODUCT" title="리뷰어가 먼저 봐야 할 것부터 보여줍니다." />
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
}) {
  return (
    <article className="rounded-lg border bg-card p-5">
      <div className="flex size-9 items-center justify-center rounded-md border bg-background/50 text-primary">
        <Icon className="size-4" />
      </div>
      <h3 className="mt-5 font-semibold text-sm">{title}</h3>
      <p className="mt-2 text-muted-foreground text-sm leading-6">{body}</p>
    </article>
  );
}

export function WorkflowSection() {
  return (
    <section id="workflow" className="border-b px-5 py-16 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1fr]">
        <div>
          <SectionIntro eyebrow="WORKFLOW" title="PR이 열리면 Folio가 리뷰 지도를 만듭니다." />
          <p className="mt-4 text-muted-foreground text-sm leading-6">
            webhook으로 변경을 감지하고, diff를 챕터로 분해한 뒤 GitHub comment와 Folio 화면에서
            같은 구조로 읽게 합니다.
          </p>
        </div>
        <div className="grid gap-3">
          {reviewFlow.map((step, index) => (
            <WorkflowRow key={step.title} index={index + 1} {...step} />
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowRow({
  index,
  title,
  scope,
  icon: Icon,
}: {
  index: number;
  title: string;
  scope: string;
  icon: LucideIcon;
}) {
  return (
    <div className="grid grid-cols-[2.5rem_2.75rem_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-card p-4">
      <span className="font-mono text-muted-foreground text-xs tabular-nums">
        {String(index).padStart(2, "0")}
      </span>
      <div className="flex size-10 items-center justify-center rounded-md border bg-background/55 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="mt-1 font-mono text-muted-foreground text-xs">{scope}</p>
      </div>
    </div>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="border-b px-5 py-16 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <SectionIntro eyebrow="PRICING" title="지금은 오픈베타, 나중에는 팀 규모에 맞게." />
            <p className="mt-4 text-muted-foreground text-sm leading-6">
              오픈베타 기간에는 모든 팀이 무료로 사용할 수 있습니다. 정식 출시 이후에는 공개
              프로젝트, 성장팀, 기업 보안 요구에 맞춰 단계적으로 운영합니다.
            </p>
          </div>
          <div className="rounded-full border bg-primary/10 px-3 py-1.5 font-mono text-primary text-xs">
            open beta · free access
          </div>
        </div>
        <div className="mt-8 grid gap-3 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  name,
  note,
  price,
  detail,
  action,
  featured,
  items,
}: {
  name: string;
  note: string;
  price: string;
  detail: string;
  action: string;
  featured: boolean;
  items: string[];
}) {
  return (
    <article
      className={cn(
        "flex min-h-[27rem] flex-col rounded-lg border bg-card p-6",
        featured && "border-primary/35 bg-primary/5",
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-2xl tracking-tight">{name}</h3>
          {featured ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-primary text-xs">
              later default
            </span>
          ) : null}
        </div>
        <p className="mt-5 text-muted-foreground text-sm">{note}</p>
      </div>
      <div className="mt-12">
        <div className="font-semibold text-4xl tracking-tight">{price}</div>
        <div className="mt-3 font-mono text-muted-foreground text-xs">{detail}</div>
      </div>
      <Button asChild className="mt-8 w-full" variant={featured ? "default" : "outline"}>
        <a href={loginUrl("/")}>
          <Github className="size-4" />
          {action}
        </a>
      </Button>
      <div className="mt-8 grid gap-3 text-sm">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

export function SecuritySection() {
  return (
    <section id="security" className="px-5 py-16 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 rounded-lg border bg-card p-6 md:p-8 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <SectionIntro eyebrow="SECURITY" title="Folio는 GitHub 데이터 도구입니다." />
          <p className="mt-4 max-w-2xl text-muted-foreground text-sm leading-6">
            로컬 repository, SSH 키, 개발자 머신에 접근하지 않습니다. GitHub App 권한과 OAuth 세션을
            통해 리뷰에 필요한 정보만 사용합니다.
          </p>
        </div>
        <div className="grid gap-2 text-sm">
          {["GitHub App webhook", "OAuth session", "PR chapter state"].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-md border bg-background/40 px-3 py-2"
            >
              <Braces className="size-4 text-primary" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionIntro({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-muted-foreground text-xs">{eyebrow}</p>
      <h2 className="mt-3 font-semibold text-2xl tracking-tight md:text-3xl">{title}</h2>
    </div>
  );
}
