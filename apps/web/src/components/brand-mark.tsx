import { cn } from "@/lib/utils";

export interface BrandMarkProps {
  className?: string;
  imageClassName?: string;
}

/** Shared Folio brand mark for headers and pre-auth pages. */
export function BrandMark({ className, imageClassName }: BrandMarkProps) {
  return (
    <span aria-hidden className={cn("flex size-8 items-center justify-center", className)}>
      <img
        src="/folio-mark.png"
        alt=""
        width={24}
        height={24}
        className={cn("size-6", imageClassName)}
      />
    </span>
  );
}
