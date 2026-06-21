import {
  HeroSection,
  PricingSection,
  ProductSection,
  SecuritySection,
  WorkflowSection,
} from "./homepage-sections";

export default function HomepagePage() {
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
