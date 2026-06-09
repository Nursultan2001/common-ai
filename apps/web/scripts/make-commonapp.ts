import { PrismaClient } from "@prisma/client";

// Ensures the admin has a Common App application (field map "common-app-core")
// that is unlocked, so the extension can autofill the real Common App pages.
// Run: npm run make-commonapp --workspace=apps/web

const db = new PrismaClient();

async function main() {
  const admin = await db.user.findUnique({ where: { email: "admin@demo.test" } });
  if (!admin) throw new Error("Run make-admin first.");
  let applicant = await db.applicant.findFirst({ where: { ownerUserId: admin.id } });
  if (!applicant) applicant = await db.applicant.create({ data: { ownerUserId: admin.id } });

  const uni = await db.university.upsert({
    where: { name: "Common App" },
    update: { fieldMapKey: "common-app-core", portalType: "COMMON_APP" },
    create: {
      name: "Common App",
      portalType: "COMMON_APP",
      supplementUrl: "https://apply.commonapp.org/",
      fieldMapKey: "common-app-core",
    },
  });

  const app = await db.application.upsert({
    where: {
      applicantId_universityId: { applicantId: applicant.id, universityId: uni.id },
    },
    update: {},
    create: { applicantId: applicant.id, universityId: uni.id, status: "DRAFT" },
  });

  await db.entitlement.upsert({
    where: { applicationId: app.id },
    update: { status: "PAID" },
    create: {
      applicantId: applicant.id,
      applicationId: app.id,
      status: "PAID",
      priceCents: 0,
      basePriceCents: 0,
      discountBps: 0,
    },
  });

  console.log("\n✅ Common App application ready (unlocked).");
  console.log("   Use this Application ID in the extension:");
  console.log("   " + app.id + "\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
