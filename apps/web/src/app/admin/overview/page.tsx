import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminAnalyticsRange } from "@/components/admin/analytics/admin-analytics-panel";
import { fetchAdminAnalytics, fetchAdminOverview } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../admin-server-access";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const params = await searchParams;
  const range = value(params.range);
  const access = await getAdminServerAccess();
  const [payload, analytics] = await Promise.all([
    readAdminServerData(access, (cookie) => fetchAdminOverview({ cookie })),
    readAdminServerData(access, (cookie) => fetchAdminAnalytics({ range, cookie })),
  ]);

  return (
    <section className="mx-auto max-w-5xl">
      <AdminPageHeader
        title="Overview"
        description="서비스 성장, 큐 처리, 관리 작업을 한 화면에서 확인합니다."
        actions={<AdminAnalyticsRange range={range} pathname="/admin/overview" />}
      />
      <AdminOverview payload={payload} analytics={analytics} />
    </section>
  );
}

function value(input: string | string[] | undefined) {
  return (Array.isArray(input) ? input[0] : input) === "30d" ? "30d" : "7d";
}
