import Nav from "@/components/homepage/Nav";
import Hero from "@/components/homepage/Hero";
import WhyCards from "@/components/homepage/WhyCards";
import HowItWorks from "@/components/homepage/HowItWorks";
import WhatYouDeploy from "@/components/homepage/WhatYouDeploy";
import HomepageFooter from "@/components/homepage/HomepageFooter";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-portal-bg text-portal-text">
      <Nav />
      <main>
        <Hero />
        <WhyCards />
        <HowItWorks />
        <WhatYouDeploy />
      </main>
      <HomepageFooter />
    </div>
  );
}
