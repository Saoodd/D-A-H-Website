// Seed data for local development / demoing the site end-to-end.
//
// TODO (DAH to confirm before real launch):
//   - The exact booth count and full A#/B# ID list from the reference floor
//     plan — paste the complete list via Admin → Events → an event → "Bulk
//     import booths" once confirmed, rather than relying on the handful of
//     placeholder booths seeded below.
//   - Which specific booths are currently sold vs. available.
//
// Run with: npm run db:seed

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      defaultAcceptanceDeadlineHours: 24,
      mainCommunityWhatsappLink: "https://chat.whatsapp.com/REPLACE_WITH_REAL_COMMUNITY_LINK",
    },
    update: {},
  });

  await prisma.pricingTier.upsert({
    where: { sizeKey: "2x2" },
    create: { sizeKey: "2x2", label: "2m x 2m kiosk", priceAedFils: 183750, vatInclusive: true, sortOrder: 0 },
    update: {},
  });
  await prisma.pricingTier.upsert({
    where: { sizeKey: "3x2" },
    create: { sizeKey: "3x2", label: "3m x 2m kiosk", priceAedFils: 210000, vatInclusive: true, sortOrder: 1 },
    update: {},
  });

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setHours(11, 0, 0, 0);

  const monthAfter = new Date(nextMonth);
  monthAfter.setMonth(monthAfter.getMonth() + 1);

  const event = await prisma.event.upsert({
    where: { slug: "dah-community-market" },
    create: {
      slug: "dah-community-market",
      name: "DAH Community Market",
      description:
        "A warm, curated pop-up market featuring Dubai's best food, drink and craft vendors. Placeholder description — replace with real event copy.",
      startDate: nextMonth,
      location: "Dubai (venue TBC)",
      categoryNeeds: "F&B, coffee, bakery, craft & lifestyle",
      status: "PUBLISHED",
    },
    update: {},
  });

  const secondEvent = await prisma.event.upsert({
    where: { slug: "dah-community-market-2" },
    create: {
      slug: "dah-community-market-2",
      name: "DAH Community Market — Next Edition",
      description: "Placeholder for next month's edition — duplicate a floor plan from Admin → Events to reuse the same layout.",
      startDate: monthAfter,
      location: "Dubai (venue TBC)",
      categoryNeeds: "F&B, coffee, bakery, craft & lifestyle",
      status: "DRAFT",
    },
    update: {},
  });

  // A small placeholder floor plan modelled loosely on the reference spec's
  // structural zones — replace booth codes/positions with the real layout.
  const existingFeatures = await prisma.floorPlanFeature.count({ where: { eventId: event.id } });
  if (existingFeatures === 0) {
    await prisma.floorPlanFeature.createMany({
      data: [
        { eventId: event.id, type: "ENTRANCE_MAIN", label: "Main entrance", gridX: 14, gridY: 20, gridW: 5, gridH: 1 },
        { eventId: event.id, type: "ENTRANCE_SIDE", label: "Side entrance", gridX: 1, gridY: 20, gridW: 2, gridH: 1 },
        { eventId: event.id, type: "ENTRANCE_SIDE", label: "Side entrance", gridX: 30, gridY: 20, gridW: 2, gridH: 1 },
        { eventId: event.id, type: "TOILET_FEMALE", label: "Female toilets", gridX: 34, gridY: 2, gridW: 3, gridH: 3 },
        { eventId: event.id, type: "TOILET_MALE", label: "Male toilets", gridX: 34, gridY: 6, gridW: 3, gridH: 3 },
        { eventId: event.id, type: "OFFICE", label: "Office", gridX: 34, gridY: 10, gridW: 3, gridH: 3 },
        { eventId: event.id, type: "LOADING", label: "Loading area", gridX: 34, gridY: 14, gridW: 3, gridH: 3 },
        { eventId: event.id, type: "STAIRS", label: "Stairs to mezzanine", gridX: 34, gridY: 18, gridW: 3, gridH: 2 },
      ],
    });
  }

  const existingBooths = await prisma.booth.count({ where: { eventId: event.id } });
  if (existingBooths === 0) {
    const booths: { code: string; size: string; gridX: number; gridY: number; gridW: number; gridH: number }[] = [];
    // Top row — A1..A10
    for (let i = 0; i < 10; i++) {
      booths.push({ code: `A${i + 1}`, size: i % 3 === 0 ? "3x2" : "2x2", gridX: 1 + i * 3, gridY: 1, gridW: 2.5, gridH: 2 });
    }
    // Bottom row — B1..B10
    for (let i = 0; i < 10; i++) {
      booths.push({ code: `B${i + 1}`, size: i % 4 === 0 ? "3x2" : "2x2", gridX: 1 + i * 3, gridY: 16, gridW: 2.5, gridH: 2 });
    }
    // A couple of central cluster booths
    booths.push({ code: "A11", size: "2x2", gridX: 12, gridY: 8, gridW: 2.5, gridH: 2 });
    booths.push({ code: "A12", size: "2x2", gridX: 12, gridY: 11, gridW: 2.5, gridH: 2 });
    booths.push({ code: "B11", size: "3x2", gridX: 18, gridY: 8, gridW: 3, gridH: 2 });
    booths.push({ code: "B12", size: "3x2", gridX: 18, gridY: 11, gridW: 3, gridH: 2 });

    await prisma.booth.createMany({
      data: booths.map((b) => ({ eventId: event.id, status: "AVAILABLE", ...b })),
    });

    // Mark a couple as already sold, to demo the visual states.
    const toSell = await prisma.booth.findMany({ where: { eventId: event.id, code: { in: ["A2", "B4"] } } });
    for (const b of toSell) {
      await prisma.booth.update({
        where: { id: b.id },
        data: { status: "SOLD", manualAssigneeName: "Seed Demo Vendor", priceAedFilsAtSale: b.size === "3x2" ? 210000 : 183750, soldAt: new Date() },
      });
    }
  }

  const galleryCount = await prisma.galleryImage.count();
  if (galleryCount === 0) {
    await prisma.galleryImage.createMany({
      data: [
        { url: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80", caption: "Market floor, golden hour", sortOrder: 0 },
        { url: "https://images.unsplash.com/photo-1533619043865-1613310d3d5f?w=800&q=80", caption: "Fresh bakes from a vendor stall", sortOrder: 1 },
        { url: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&q=80", caption: "Coffee cart queue", sortOrder: 2 },
        { url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80", caption: "Community browsing the stalls", sortOrder: 3 },
      ],
    });
  }

  const demoEmail = "demo.vendor@example.com";
  let vendor = await prisma.vendor.findUnique({ where: { email: demoEmail } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        email: demoEmail,
        passwordHash: await bcrypt.hash("password123", 10),
        businessName: "Demo Vendor Co.",
        contactName: "Demo Vendor",
        phone: "+971500000000",
        instagram: "@demovendor",
      },
    });
  }

  const existingDemoApp = await prisma.application.findFirst({ where: { vendorId: vendor.id, eventId: event.id } });
  if (!existingDemoApp) {
    await prisma.application.create({
      data: {
        vendorId: vendor.id,
        eventId: event.id,
        businessName: vendor.businessName,
        contactName: vendor.contactName,
        phone: vendor.phone,
        email: vendor.email,
        category: "Coffee & bakery",
        instagram: vendor.instagram,
        message: "Seed demo application — pending review.",
        status: "PENDING",
      },
    });
  }

  console.log("Seed complete.");
  console.log(`Demo vendor login: ${demoEmail} / password123`);
  console.log(`Demo events: ${event.slug}, ${secondEvent.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
