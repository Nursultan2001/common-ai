const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const admin = await db.user.findFirst({ where: { email: "admin@demo.test" } });
  const applicant = await db.applicant.findFirst({ where: { ownerUserId: admin.id } });
  const reports = await db.gradeReport.findMany({
    where: { applicantId: applicant.id },
    include: { courses: true },
    orderBy: { grade: "asc" },
  });
  for (const r of reports) {
    console.log(`Grade ${r.grade}: scale=${r.gradingScale} sched=${r.schedule} year=${r.schoolYear} reportedAll=${r.reportedAll} -> ${r.courses.length} courses`);
    console.log("   [" + r.courses.map(c => c.courseName).join(" | ") + "]");
  }
  await db.$disconnect();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
