import {
  HeroSection,
  PricingSection,
  ProductSection,
  SecuritySection,
  WorkflowSection,
} from "./homepage/homepage-sections";

/** Public marketing home at the site root. Dashboard lives at /dashboard. */
export default function HomePage() {
  return (
    <main className="min-h-svh overflow-hidden bg-background text-foreground">
      <HeroSection />
      <ProductSection />
      <WorkflowSection />
      <PricingSection />
      <SecuritySection />
    </main>
  );
}
