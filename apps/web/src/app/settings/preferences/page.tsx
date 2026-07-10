import { PreferencesForm } from "@/components/settings/preferences-form";
import { SettingsPageHeader } from "@/components/settings/settings-card";

export default function PreferencesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <SettingsPageHeader
        title="Preferences"
        description="리뷰 화면을 내 작업 방식에 맞게 설정합니다."
      />
      <PreferencesForm />
    </div>
  );
}
