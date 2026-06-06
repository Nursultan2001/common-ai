import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = "password123";

// Seeds a demo agency + counselor + student + applicant so you can exercise the
// full flow (AI polish, checkout, autofill) immediately.
async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const org = await db.org.create({
    data: { name: "Demo Admissions Agency", type: "AGENCY", discountBps: 2000 }, // 20% off
  });

  const counselor = await db.user.create({
    data: {
      email: "counselor@demo.test",
      name: "Demo Counselor",
      role: "COUNSELOR",
      orgId: org.id,
      passwordHash,
    },
  });

  const student = await db.user.create({
    data: {
      email: "student@demo.test",
      name: "Demo Student",
      role: "STUDENT",
      orgId: org.id,
      passwordHash,
    },
  });

  const applicant = await db.applicant.create({
    data: {
      ownerUserId: student.id,
      orgId: org.id,
      profile: {
        create: {
          legalFirstName: "Aigerim",
          legalLastName: "Bekova",
          email: "student@demo.test",
          city: "Almaty",
          country: "Kazakhstan",
          highSchoolName: "NIS Almaty",
          graduationYear: 2026,
          intendedMajor: "Computer Science",
        },
      },
      activities: {
        create: [
          {
            category: "Academic",
            position: "Founder & President",
            organization: "School Robotics Club",
            rawDescription:
              "started the robotics club, got 30 members, we won 2nd place at the national robotics olympiad and i taught beginners arduino every saturday",
            hoursPerWeek: 6,
            weeksPerYear: 30,
          },
        ],
      },
      honors: {
        create: [
          {
            title: "National Robotics Olympiad 2nd place",
            level: "National",
            rawDescription: "team of 3, national level, 2025",
          },
        ],
      },
    },
  });

  const university = await db.university.create({
    data: {
      name: "Common App (core sections)",
      portalType: "COMMON_APP",
      supplementUrl: "https://apply.commonapp.org/",
      fieldMapKey: "common-app-core",
    },
  });

  const application = await db.application.create({
    data: { applicantId: applicant.id, universityId: university.id, status: "DRAFT" },
  });

  console.log("Seed complete.\n");
  console.log("Log in at /login with either:");
  console.log(`  student@demo.test   / ${DEMO_PASSWORD}`);
  console.log(`  counselor@demo.test / ${DEMO_PASSWORD}  (agency, 20% discount)`);
  console.log("\napplicationId:", application.id);
  console.log("\nGet your extension token from the dashboard (Browser extension card).");
  console.log("The application is LOCKED until paid — use 'Dev unlock' (dev only)");
  console.log("or the Stripe checkout to test autofill.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
