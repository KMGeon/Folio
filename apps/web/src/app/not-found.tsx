import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-xl">
        <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          주소가 바뀌었거나 아직 연결되지 않은 Folio 화면입니다.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">
            <ArrowLeft className="size-4" />
            대시보드로 이동
          </Link>
        </Button>
      </section>
    </main>
  );
}
