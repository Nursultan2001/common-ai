import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Creates a free admin account wired up for testing the extension end-to-end:
//  - admin user (login below)
//  - an applicant + a filled profile (so autofill has real data to place)
//  - a "Local Test Form" university using the localhost-test field map
//  - an application that is already PAID (free) so autofill is unlocked
//
// Run: npm run make-admin --workspace=apps/web

const db = new PrismaClient();

const EMAIL = "admin@demo.test";
const PASSWORD = "admin12345";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const admin = await db.user.upsert({
    where: { email: EMAIL },
    update: { role: "ADMIN", passwordHash },
    create: { email: EMAIL, name: "Admin Tester", role: "ADMIN", passwordHash },
  });

  let applicant = await db.applicant.findFirst({ where: { ownerUserId: admin.id } });
  if (!applicant) {
    applicant = await db.applicant.create({ data: { ownerUserId: admin.id } });
  }

  await db.masterProfile.upsert({
    where: { applicantId: applicant.id },
    update: {},
    create: {
      applicantId: applicant.id,
      legalFirstName: "Admin",
      legalLastName: "Tester",
      preferredName: "Admin",
      dateOfBirth: new Date("2007-05-01"),
      email: EMAIL,
      phone: "+1 555 0100",
      city: "Almaty",
      country: "Kazakhstan",
      highSchoolName: "Demo High School",
      graduationYear: 2026,
      intendedMajor: "Computer Science",
    },
  });

  const university = await db.university.upsert({
    where: { name: "Local Test Form" },
    update: { fieldMapKey: "localhost-test", portalType: "DIRECT" },
    create: {
      name: "Local Test Form",
      portalType: "DIRECT",
      supplementUrl: "http://localhost:3000/dev/testform",
      fieldMapKey: "localhost-test",
    },
  });

  const application = await db.application.upsert({
    where: {
      applicantId_universityId: {
        applicantId: applicant.id,
        universityId: university.id,
      },
    },
    update: {},
    create: { applicantId: applicant.id, universityId: university.id, status: "DRAFT" },
  });

  await db.entitlement.upsert({
    where: { applicationId: application.id },
    update: { status: "PAID" },
    create: {
      applicantId: applicant.id,
      applicationId: application.id,
      status: "PAID",
      priceCents: 0,
      basePriceCents: 0,
      discountBps: 0,
    },
  });

  console.log("\n✅ Free admin account ready.\n");
  console.log("  Log in at  http://localhost:3000/login");
  console.log(`  Email:     ${EMAIL}`);
  console.log(`  Password:  ${PASSWORD}`);
  console.log(`\n  Test applicationId (already unlocked, free): ${application.id}`);
  console.log("\n  Test page for the extension: http://localhost:3000/dev/testform");
  console.log("  Get your token from the dashboard → 'Browser extension' card.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
