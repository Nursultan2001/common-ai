const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const u = await db.user.findFirst({ where: { role: "ADMIN" } }) || await db.user.findFirst();
  if (!u) { console.log("no user"); process.exit(0); }
  let a = await db.applicant.findFirst({ where: { intakeClientName: "TEST Client (preview)" } });
  if (!a) a = await db.applicant.create({ data: { ownerUserId: u.id, orgId: u.orgId ?? null, intakeToken: "testtoken123preview", intakeClientName: "TEST Client (preview)" } });
  console.log("TOKEN:", a.intakeToken);
  process.exit(0);
})();
