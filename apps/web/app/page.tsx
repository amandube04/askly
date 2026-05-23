import { api } from "~/trpc/server";
import { LandingFeatures } from "~/components/landing/landing-features";
import { LandingFooter } from "~/components/landing/landing-footer";
import { LandingFormPreview } from "~/components/landing/landing-form-preview";
import { LandingHero } from "~/components/landing/landing-hero";
import { LandingNav } from "~/components/landing/landing-nav";
import { LandingPublicForms } from "~/components/landing/landing-public-forms";
import { ScrollProgress } from "~/components/landing/scroll-progress";
import { Starfield } from "~/components/landing/starfield";

export default async function Home() {
  const [healthResult, publicFormsResult] = await Promise.allSettled([
    api.health.getHealth.query(),
    api.forms.listPublic.query({ limit: 12 }),
  ]);

  const backendHealthy =
    healthResult.status === "fulfilled" &&
    typeof healthResult.value?.status === "string" &&
    healthResult.value.status.toLowerCase().includes("healthy");

  const publicForms =
    publicFormsResult.status === "fulfilled"
      ? publicFormsResult.value.map((form) => ({
          id: form.id,
          title: form.title,
          slug: form.slug,
        }))
      : [];

  return (
    <main className="askly-landing">
      <ScrollProgress />
      <div className="askly-landing-grain" aria-hidden />
      <div className="askly-aurora" aria-hidden />
      <Starfield />

      <div className="relative z-10">
        <LandingNav />
        <LandingHero
          backendHealthy={backendHealthy}
          publicFormCount={publicForms.length}
        />
        <div className="askly-divider mx-auto max-w-6xl" />
        <LandingFeatures />
        <div className="askly-divider mx-auto max-w-6xl" />
        <LandingFormPreview />
        <div className="askly-divider mx-auto max-w-6xl" />
        <LandingPublicForms forms={publicForms} />
        <LandingFooter />
      </div>
    </main>
  );
}
