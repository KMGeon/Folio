import { cookies } from "next/headers";

import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { fetchAdminOverview } from "@/lib/admin-api";

export default async function AdminOverviewPage() {
  const cookie = (await cookies())
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  const payload = await fetchAdminOverview({ cookie });

  return (
    <section className="mx-auto max-w-5xl">
      <AdminPageHeader title="Overview" description="시스템 접근 상태와 최근 관리 작업입니다." />
      <AdminOverview payload={payload} />
    </section>
  );
}
