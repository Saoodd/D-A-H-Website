import type { MetadataRoute } from "next";
import { isIndexableDeployment, siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Preview / development deployments: keep the whole site out of search.
  if (!isIndexableDeployment()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // "/vendor/" (with the slash) is the private vendor account area;
        // the public "/vendors" and "/vendor-terms" pages stay crawlable.
        disallow: ["/admin", "/api/", "/vendor/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
