/* Seed the admin (admin@demo.test) applicant with a complete, coherent TEST
 * profile across every section, plus a PAID test application, so the Common App
 * autofill can be driven end to end. Idempotent: re-running replaces the data.
 *
 *   node apps/web/scripts/seedAdminTest.cjs
 */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const D = (s) => new Date(s + "T00:00:00.000Z");

async function main() {
  const admin = await db.user.findFirst({ where: { email: "admin@demo.test" } });
  if (!admin) throw new Error("admin@demo.test not found");

  let applicant = await db.applicant.findFirst({ where: { ownerUserId: admin.id } });
  if (!applicant) {
    applicant = await db.applicant.create({
      data: { ownerUserId: admin.id, orgId: admin.orgId ?? null },
    });
  }
  const aid = applicant.id;

  // ---- MasterProfile ----
  const profile = {
    legalFirstName: "Aibek", middleName: "N", legalLastName: "Sultanov",
    suffix: "", preferredName: "Aibek", sharePreferredName: "Yes",
    hasFormerName: "No", formerLastName: null,
    dateOfBirth: D("2008-05-14"), birthCity: "Turkistan", birthCountry: "Kazakhstan",
    email: "aibek.sultanov@example.com", phone: "7012345678",
    phoneType: "Mobile", phoneCountryCode: "Kazakhstan",
    alternatePhone: "No other telephone", alternatePhoneNumber: null, alternatePhoneCountryCode: null,
    addressLine1: "12 Tauke Khan Avenue", addressLine2: "Apt 4",
    city: "Turkistan", state: "Turkistan Region", postalCode: "161200", country: "Kazakhstan",
    citizenship: "Kazakhstan", citizenshipStatus: "Citizen of non-U.S. country",
    yearsInUS: "0", holdsUSVisa: "No", intendsUSVisa: "Yes", visaType: "F-1  Student",
    gender: "Male", legalSex: "Male", pronouns: "He/Him",
    armedForces: "None", hispanicLatino: "No", raceEthnicity: "Asian",
    highSchoolName: "Nazarbayev Intellectual School of Turkistan",
    graduationYear: 2026, dateOfEntry: D("2022-09-01"), graduationDate: D("2026-05-30"), classSize: 120,
    highSchoolNotListed: "Yes", highSchoolCountry: "Kazakhstan", highSchoolType: "Independent",
    highSchoolAddress1: "1 Bekzat Sattarkhanov Avenue", highSchoolAddress2: "", highSchoolAddress3: "",
    highSchoolCity: "Turkistan", highSchoolState: "", highSchoolZip: "161200",
    isBoardingSchool: "Yes", didGraduate: "Yes", progression: "No change in progression",
    gpa: 3.9, gpaScale: 4.0, classRankReporting: "Decile", decileRank: "Top 10%",
    rankWeighting: "Unweighted", gpaWeighting: "Unweighted", courseScheduleSystem: "Semester",
    satTotal: 1500, actComposite: null,
    intendedMajor: "Computer Science", highestDegree: "Master's (MA, MS)", careerInterest: "Engineer",
    enrollmentPlan: "Applying as a first-year student and plan to start college in 2025 or 2026",
    alternateMailingAddress: "No alternate address",
    feeWaiverEligible: "No", feeWaiverSignature: null, ustriveMentor: "No",
    parentsMaritalStatus: "Married", permanentHomeWith: "Both Parents", hasChildren: "No",
    responsibilities: "Working at a paid job to contribute to my household’s income",
    circumstances: "Commuting 60 minutes or more to and from school each day",
    addlInfoText: "During 11th grade I balanced school with a part-time job after my father's hours were cut, which briefly affected my grades in the fall semester.",
    addlQualificationsText: "I am a self-taught full-stack developer and have shipped two small web apps used by my classmates.",
    transcriptAccess: "Yes",
  };
  await db.masterProfile.upsert({ where: { applicantId: aid }, update: profile, create: { applicantId: aid, ...profile } });

  // ---- reset children ----
  await db.gradeCourse.deleteMany({ where: { report: { applicantId: aid } } });
  await db.gradeReport.deleteMany({ where: { applicantId: aid } });
  await db.$transaction([
    db.parent.deleteMany({ where: { applicantId: aid } }),
    db.sibling.deleteMany({ where: { applicantId: aid } }),
    db.language.deleteMany({ where: { applicantId: aid } }),
    db.otherSchool.deleteMany({ where: { applicantId: aid } }),
    db.course.deleteMany({ where: { applicantId: aid } }),
    db.activity.deleteMany({ where: { applicantId: aid } }),
    db.honor.deleteMany({ where: { applicantId: aid } }),
    db.essay.deleteMany({ where: { applicantId: aid } }),
  ]);

  // ---- Parents ----
  await db.parent.createMany({ data: [
    { applicantId: aid, order: 0, parentType: "Mother", relationship: "Mother", isLiving: "Yes",
      prefix: "Mrs.", firstName: "Gulnara", middleInitial: "A", lastName: "Sultanova", suffix: "",
      email: "gulnara.sultanova@example.com", phoneType: "Mobile", phoneCountryCode: "Kazakhstan",
      phoneNumber: "7019876543", occupation: "Teacher or administrator (secondary)", employmentStatus: "Employed",
      educationLevel: "Graduate school",
      parentCollegeEmployment: "Not employed at a college/university", parentInstitutionsAttended: "1" },
    { applicantId: aid, order: 1, parentType: "Father", relationship: "Father", isLiving: "Yes",
      prefix: "Mr.", firstName: "Nurlan", middleInitial: "B", lastName: "Sultanov", suffix: "",
      email: "nurlan.sultanov@example.com", phoneType: "Mobile", phoneCountryCode: "Kazakhstan",
      phoneNumber: "7017654321", occupation: "Engineer", employmentStatus: "Employed",
      educationLevel: "Graduated from college/university",
      parentCollegeEmployment: "Not employed at a college/university", parentInstitutionsAttended: "1" },
  ]});

  // ---- Siblings ----
  await db.sibling.create({ data: { applicantId: aid, order: 0, firstName: "Dana", lastName: "Sultanova", ageOrGrade: "14" } });

  // ---- Languages ----
  await db.language.createMany({ data: [
    { applicantId: aid, order: 0, name: "Kazakh", proficiency: "First Language, Speak, Read, Write, Spoken at Home" },
    { applicantId: aid, order: 1, name: "Russian", proficiency: "Speak, Read, Write" },
    { applicantId: aid, order: 2, name: "English", proficiency: "Speak, Read, Write" },
  ]});

  // ---- Other secondary schools ----
  await db.otherSchool.create({ data: {
    applicantId: aid, order: 0, name: "Turkistan Lyceum No. 5", notListed: "Yes", country: "Kazakhstan",
    type: "Public", address1: "5 Yassawi Street", city: "Turkistan", state: "", zip: "161200",
    fromDate: D("2019-09-01"), toDate: D("2022-06-01"), reasonLeft: "Admitted to Nazarbayev Intellectual School after a competitive entrance exam.",
  }});

  // ---- Current-year courses (4/24) ----
  const curCourses = [
    ["Calculus", "AP Calculus BC", "Advanced Placement (AP)", "Full Year"],
    ["Physics", "AP Physics C: Mechanics", "Advanced Placement (AP)", "Full Year"],
    ["English", "English Literature", "Honors", "Full Year"],
    ["Computer Science", "AP Computer Science A", "Advanced Placement (AP)", "Full Year"],
    ["History/Social Science", "World History", "Honors", "Full Year"],
  ];
  await db.course.createMany({ data: curCourses.map(([subject, name, level, schedule], i) => ({
    applicantId: aid, order: i, subject, name, level, schedule,
  }))});

  // ---- Grade transcripts 9-12 ----
  const gradeYears = { "9": "2022-23", "10": "2023-24", "11": "2024-25", "12": "2025-26" };
  const gradeCourses = {
    "9": [["Algebra", "Algebra I", "Honors"], ["Biology", "Biology", "Honors"], ["English", "English 9", "Honors"]],
    "10": [["Geometry", "Geometry", "Honors"], ["Chemistry", "Chemistry", "Honors"], ["English", "English 10", "Honors"]],
    "11": [["Pre-Calculus", "Pre-Calculus", "Honors"], ["Physics", "Physics", "Honors"], ["Computer Science", "Intro to CS", "Advanced Placement (AP)"]],
    "12": [["Calculus", "AP Calculus BC", "Advanced Placement (AP)"], ["Computer Science", "AP Computer Science A", "Advanced Placement (AP)"], ["English", "English Literature", "Honors"]],
  };
  for (const grade of ["9", "10", "11", "12"]) {
    const rep = await db.gradeReport.create({ data: {
      applicantId: aid, grade, schoolName: "Nazarbayev Intellectual School of Turkistan",
      schoolYear: gradeYears[grade], gradingScale: "0.0-4.0", schedule: "Semesters", reportedAll: true,
    }});
    await db.gradeCourse.createMany({ data: gradeCourses[grade].map(([subject, courseName, courseLevel], i) => ({
      gradeReportId: rep.id, order: i, subject, courseName, courseLevel,
    }))});
  }

  // ---- Activities (APPROVED so they autofill) ----
  const acts = [
    { category: "Computer/Technology", position: "Founder & President", organization: "School Coding Club",
      gradeLevels: "10, 11, 12", timing: "During school year", hoursPerWeek: 5, weeksPerYear: 30, collegeIntent: "Yes",
      raw: "I started our school's coding club, taught Python to 20 members weekly, and led a team to a national hackathon.",
      polished: "Founded the school coding club; teach Python weekly to 20+ members and led a team to the national hackathon finals." },
    { category: "Community Service (Volunteer)", position: "Volunteer Tutor", organization: "Turkistan Public Library",
      gradeLevels: "11, 12", timing: "During school year", hoursPerWeek: 3, weeksPerYear: 28, collegeIntent: "Yes",
      raw: "I tutor younger students in math and science for free at the local library every week.",
      polished: "Volunteer weekly tutoring younger students in math and science at the public library." },
    { category: "Athletics: Club", position: "Team Captain", organization: "School Basketball Team",
      gradeLevels: "9, 10, 11, 12", timing: "During school year", hoursPerWeek: 6, weeksPerYear: 20, collegeIntent: "No",
      raw: "I have played on the school basketball team since 9th grade and became captain in 11th grade.",
      polished: "Four-year varsity basketball player; elected team captain in 11th grade." },
  ];
  for (let i = 0; i < acts.length; i++) {
    const a = acts[i];
    await db.activity.create({ data: {
      applicantId: aid, orderIndex: i, category: a.category, position: a.position, organization: a.organization,
      gradeLevels: a.gradeLevels, timing: a.timing, hoursPerWeek: a.hoursPerWeek, weeksPerYear: a.weeksPerYear,
      collegeIntent: a.collegeIntent, rawDescription: a.raw, polishedDescription: a.polished, status: "APPROVED",
    }});
  }

  // ---- Honors (APPROVED) ----
  const honors = [
    { title: "National Mathematics Olympiad — Bronze Medal", gradeLevels: "11", level: "National",
      raw: "Won a bronze medal at the national math olympiad in 11th grade.",
      polished: "Bronze Medal, Republican (National) Mathematics Olympiad" },
    { title: "Principal's Honor Roll", gradeLevels: "9, 10, 11, 12", level: "School",
      raw: "On the honor roll every year of high school.",
      polished: "Principal's Honor Roll (all four years)" },
  ];
  for (let i = 0; i < honors.length; i++) {
    const h = honors[i];
    await db.honor.create({ data: {
      applicantId: aid, orderIndex: i, title: h.title, gradeLevels: h.gradeLevels, level: h.level,
      rawDescription: h.raw, polishedTitle: h.polished, status: "APPROVED",
    }});
  }

  // ---- Personal essay (APPROVED) ----
  const PROMPT1 = "Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.";
  const essayText = `The first program I ever wrote was a calculator that only worked half the time. I was thirteen, hunched over a secondhand laptop in our apartment in Turkistan, and I had no idea why my code kept breaking. There was no one in my family to ask — my parents are a teacher and an engineer, but neither had written a line of code. So I did the only thing I could: I broke the problem into smaller and smaller pieces until each one was small enough to understand.

That habit changed how I see everything. When I founded our school's coding club, most members had never opened a terminal. Instead of overwhelming them, I started with one working line and built up. When our hackathon project collapsed the night before the deadline, I didn't panic; I isolated the failing function, the way I'd once isolated my broken calculator. We finished third in the country.

I used to think being self-taught meant being alone. Now I think it means being responsible for your own curiosity — and then handing that curiosity to someone else. That is the kind of engineer, and person, I want to become.`;
  await db.essay.create({ data: {
    applicantId: aid, kind: "PERSONAL_STATEMENT", prompt: PROMPT1, wordLimit: 650,
    studentNotes: "wrote my first buggy program at 13, self-taught, started coding club, hackathon, want to study CS",
    draft: essayText, finalText: essayText, status: "APPROVED",
  }});

  // ---- TestScores (SAT + IELTS) ----
  const ts = {
    selfReportScores: "Yes", internationalLeavingExam: "No",
    testsToReport: "SAT Tests, ACT Tests, IELTS",
    satPastCount: "1", satFutureSittings: "0",
    satReadingWriting: "720", satReadingWritingDate: D("2025-10-04"),
    satMath: "780", satMathDate: D("2025-10-04"), satEssayReport: "No",
    actPastCount: "1", actFutureSittings: "0",
    actComposite: "34", actCompositeDate: D("2025-09-13"),
    actEnglish: "35", actEnglishDate: D("2025-09-13"),
    actMath: "33", actMathDate: D("2025-09-13"),
    actReading: "34", actReadingDate: D("2025-09-13"),
    actReportScience: "Yes", actScience: "34", actScienceDate: D("2025-09-13"),
    actReportWriting: "No",
    ieltsTimesTaken: 1, ieltsListening: "8.0", ieltsReading: "7.5", ieltsWriting: "7.0",
    ieltsSpeaking: "7.5", ieltsOverall: "7.5", ieltsDate: D("2025-09-20"),
    ssleCount: 0,
  };
  await db.testScores.upsert({ where: { applicantId: aid }, update: ts, create: { applicantId: aid, ...ts } });

  // ---- Test university + PAID application so the extension can fetch data ----
  const uni = await db.university.upsert({
    where: { name: "Purdue University" },
    update: { portalType: "COMMON_APP", fieldMapKey: "common-app-core" },
    create: { name: "Purdue University", portalType: "COMMON_APP", fieldMapKey: "common-app-core" },
  });
  let app = await db.application.findFirst({ where: { applicantId: aid, universityId: uni.id } });
  if (!app) app = await db.application.create({ data: { applicantId: aid, universityId: uni.id, status: "DRAFT" } });
  await db.entitlement.upsert({
    where: { applicationId: app.id },
    update: { status: "PAID" },
    create: { applicantId: aid, applicationId: app.id, status: "PAID", priceCents: 0, basePriceCents: 500 },
  });

  console.log("Seeded admin applicant:", aid);
  console.log("APPLICATION ID (paste into the extension):", app.id);
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
