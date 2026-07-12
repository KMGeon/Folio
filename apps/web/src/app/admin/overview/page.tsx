import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { fetchAdminOverview } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../admin-server-access";

export default async function AdminOverviewPage() {
  const access = await getAdminServerAccess();
  const payload = await readAdminServerData(access, (cookie) => fetchAdminOverview({ cookie }));

  return (
    <section className="mx-auto max-w-5xl">
      <AdminPageHeader title="Overview" description="시스템 접근 상태와 최근 관리 작업입니다." />
      <AdminOverview payload={payload} />
    </section>
  );
}
