"use client";

import { Rows3, Type } from "lucide-react";
import { useEffect, useState } from "react";

import { SettingsCard } from "@/components/settings/settings-card";
import {
  DEFAULT_REVIEW_PREFERENCES,
  readReviewPreferences,
  type ReviewPreferences,
  writeReviewPreferences,
} from "@/lib/review-preferences";
import { cn } from "@/lib/utils";

export function PreferencesForm() {
  const [preferences, setPreferences] = useState(DEFAULT_REVIEW_PREFERENCES);
  useEffect(() => setPreferences(readReviewPreferences()), []);

  function update<K extends keyof ReviewPreferences>(key: K, value: ReviewPreferences[K]) {
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      writeReviewPreferences(next);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Appearance"
        description="리뷰 화면의 정보 밀도와 안내 표시를 설정합니다."
        icon={<Type className="size-4" />}
      >
        <PreferenceRow label="텍스트 크기">
          <SegmentedControl
            value={preferences.textSize}
            options={[
              ["compact", "작게"],
              ["default", "기본"],
            ]}
            onChange={(value) => update("textSize", value as ReviewPreferences["textSize"])}
          />
        </PreferenceRow>
        <PreferenceRow label="챕터 패널">
          <SegmentedControl
            value={preferences.chapterPanel}
            options={[
              ["left", "왼쪽"],
              ["right", "오른쪽"],
            ]}
            onChange={(value) => update("chapterPanel", value as ReviewPreferences["chapterPanel"])}
          />
        </PreferenceRow>
        <PreferenceRow label="검토 포인트" description="챕터별 핵심 검토 사항을 표시합니다.">
          <Toggle
            checked={preferences.showReviewFocus}
            onChange={(value) => update("showReviewFocus", value)}
          />
        </PreferenceRow>
      </SettingsCard>

      <SettingsCard
        title="Diff Display"
        description="코드 변경을 처음 열었을 때의 레이아웃입니다."
        icon={<Rows3 className="size-4" />}
      >
        <PreferenceRow label="기본 레이아웃">
          <SegmentedControl
            value={preferences.diffLayout}
            options={[
              ["unified", "Unified"],
              ["split", "Split"],
            ]}
            onChange={(value) => update("diffLayout", value as ReviewPreferences["diffLayout"])}
          />
        </PreferenceRow>
      </SettingsCard>
    </div>
  );
}

function PreferenceRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-md border bg-background p-0.5">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "h-7 rounded px-3 text-xs transition-colors",
            value === option ? "bg-accent font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-primary-foreground transition-[left]",
          checked ? "left-4.5" : "left-0.5",
        )}
      />
    </button>
  );
}
