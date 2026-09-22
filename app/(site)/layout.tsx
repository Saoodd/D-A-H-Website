import { getVendorSession } from "@/lib/auth";
import { SiteChrome } from "@/components/SiteChrome";
import { SiteFooter } from "@/components/SiteFooter";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const vendor = await getVendorSession();
  return (
    <>
      <SiteChrome vendorLoggedIn={!!vendor} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
