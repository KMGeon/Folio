import { Check, CreditCard } from "lucide-react";

import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";

export default function BillingPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <SettingsPageHeader title="Billing" description="Folio 요금제와 사용 범위를 확인합니다." />
      <SettingsCard
        title="Open Beta"
        description="오픈베타 기간에는 모든 팀이 무료로 사용할 수 있습니다."
        icon={<CreditCard className="size-4" />}
      >
        <div className="text-2xl font-semibold">무료</div>
        <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
          {["공개 저장소 무제한", "PR 챕터 요약", "리뷰어 대시보드", "위험도 표시"].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Check className="size-3.5 text-primary" />
              {item}
            </li>
          ))}
        </ul>
        <Button className="mt-5" disabled>
          준비 중
        </Button>
      </SettingsCard>
    </div>
  );
}
