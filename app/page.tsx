import { FeaturesSection } from "@/components/features";
import { Hero } from "@/components/hero";
import { HowItWorksSection } from "@/components/how-it-works";
import { ScreenshotsSection } from "@/components/screenshots";
import { SiteFooter } from "@/components/site-footer";

export default function HomePage() {
  return (
    <>
      <a
        href="#features"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Hero />
      <main>
        <FeaturesSection />
        <ScreenshotsSection />
        <HowItWorksSection />
      </main>
      <SiteFooter />
    </>
  );
}
