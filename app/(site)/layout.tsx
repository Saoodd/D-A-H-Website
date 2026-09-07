import { getVendorSession } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const vendor = await getVendorSession();
  return (
    <>
      <SiteHeader vendorLoggedIn={!!vendor} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
