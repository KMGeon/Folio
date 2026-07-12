import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ApiError } from "@/lib/api-client";
import { fetchAdminJob } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../../../admin-server-access";

export default async function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const access = await getAdminServerAccess();
  let job;
  try {
    job = await readAdminServerData(access, (cookie) => fetchAdminJob(jobId, { cookie }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <AdminPageHeader
        title="Job detail"
        description="안전한 큐 메타데이터만 표시합니다. payload/result는 노출하지 않습니다."
      />
      <p className="text-xs text-muted-foreground">
        <Link href="/admin/operations" className="text-primary hover:underline">
          ← Operations
        </Link>
      </p>
      <dl className="grid gap-3 rounded-lg border bg-card p-3 text-xs sm:grid-cols-2">
        <Field label="ID" value={job.id} mono />
        <Field label="Kind" value={job.kind} mono />
        <Field label="Status" value={job.status} mono />
        <Field label="Distressed" value={job.isDistressed ? "yes" : "no"} />
        <Field label="Attempts" value={`${job.attempts} / ${job.maxAttempts}`} mono />
        <Field label="Repository" value={job.repository?.fullName ?? "—"} />
        <Field label="Run after" value={new Date(job.runAfter).toLocaleString()} />
        <Field
          label="Lease expires"
          value={job.leaseExpiresAt ? new Date(job.leaseExpiresAt).toLocaleString() : "—"}
        />
        <Field label="Locked by" value={job.lockedBy ?? "—"} mono />
        <Field label="Created" value={new Date(job.createdAt).toLocaleString()} />
        <Field label="Updated" value={new Date(job.updatedAt).toLocaleString()} />
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Error summary</dt>
          <dd className="mt-1 font-mono text-foreground">{job.errorSummary ?? "—"}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        워커 online/offline 상태는 이 화면에서 추론하지 않습니다.
      </p>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
