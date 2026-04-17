import Hero from "../components/Hero";
import Features from "../components/Features";
import CTA from "../components/CTA";
import Process from "../components/Process";
import VehicleTypes from "../components/VehicleTypes";
import CustomerReviews from "../components/CustomerReviews";
import DispatchStatus from "../components/DispatchStatus";

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <CTA />
      <Process />
      <VehicleTypes />
      <CustomerReviews />
      <DispatchStatus />
    </>
  );
}
