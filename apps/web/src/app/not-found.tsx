import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-xl">
        <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
          404
        </p>
        <h1 className="font-serif text-3xl font-normal leading-[1.1] tracking-tight text-foreground md:text-[2.75rem]">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          주소가 바뀌었거나 아직 연결되지 않은 Folio 화면입니다.
        </p>
        <Button asChild className="mt-8">
          <Link href="/dashboard">
            <ArrowLeft className="size-4" />
            대시보드로 이동
          </Link>
        </Button>
      </section>
    </main>
  );
}
