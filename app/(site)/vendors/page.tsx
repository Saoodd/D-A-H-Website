import type { Metadata } from "next";
import { VendorsClient } from "./VendorsClient";

export const metadata: Metadata = {
  title: "Vendor Info & Application",
  description: "Grow your business at a Dar Al Hay market — requirements, expectations, and how to create your DAH business account.",
};

export default function VendorsPage() {
  return <VendorsClient />;
}
