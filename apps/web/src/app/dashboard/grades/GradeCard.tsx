"use client";

import { useState } from "react";
import {
  saveGradeReportAction,
  addGradeCourseAction,
  updateGradeCourseAction,
  deleteGradeCourseAction,
} from "@/lib/actions/grades";

const SUBJECTS = [
  "Pre-Algebra", "Algebra", "Geometry", "Trigonometry", "Pre-Calculus",
  "Calculus", "Math (Other)", "Biology", "Chemistry", "Physics",
  "Earth/Environmental Science", "Science (Other)", "English",
  "History/Social Science", "Foreign/World Language",
  "Physical Education/Health", "Art (Visual or Performing)",
  "Computer Science", "Religion", "Other/Elective",
];
const LEVELS = [
  "Regular/Standard", "Accelerated", "Advanced", "Advanced Placement (AP)",
  "AS/A-level/International A-level, Cambridge AICE", "College Prep",
  "Dual Enrollment", "Enriched", "GCSE, IGCSE", "Gifted", "High Honors",
  "Honors", "Intensive", "International Baccalaureate (IB)", "Pre-IB",
  "Regents", "N/A",
];
const SCHOOL_YEARS = Array.from({ length: 26 }, (_, i) => {
  const start = 2025 - i;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
});
const GRADING_SCALES = ["A-F", "1-100", "0.0-4.0", "0.0-5.0", "1-7", "1-10", "1-11", "1-20", "Other"];
const SCHEDULES = ["Semesters", "Trimesters", "Quarters", "Yearly", "Other"];

// Which grade/credit columns Common App shows for each schedule (harvested live).
const TERM_COLS: Record<string, { key: string; label: string }[]> = {
  Yearly: [{ key: "Final", label: "Final" }],
  Semesters: [{ key: "1", label: "S1" }, { key: "2", label: "S2" }, { key: "Final", label: "Final" }],
  Trimesters: [{ key: "1", label: "T1" }, { key: "2", label: "T2" }, { key: "3", label: "T3" }, { key: "Final", label: "Final" }],
  Quarters: [{ key: "1", label: "Q1" }, { key: "2", label: "Q2" }, { key: "3", label: "Q3" }, { key: "4", label: "Q4" }, { key: "Final", label: "Final" }],
  Other: [{ key: "Final", label: "Final" }],
};
const termsFor = (schedule?: string | null) => (schedule ? TERM_COLS[schedule] ?? [] : []);

export type CourseT = {
  id: string; subject: string | null; courseName: string | null; courseLevel: string | null;
  grade1: string | null; grade2: string | null; grade3: string | null; grade4: string | null; gradeFinal: string | null;
  credit1: string | null; credit2: string | null; credit3: string | null; credit4: string | null; creditFinal: string | null;
  creditNA: boolean;
};
export type ReportT = {
  id: string; grade: string; schoolName: string | null; schoolYear: string | null;
  gradingScale: string | null; schedule: string | null; reportedAll: boolean;
  courses: CourseT[];
};

function Sel({ label, name, value, options, flex = "1 1 160px" }:
  { label: string; name: string; value?: string | null; options: string[]; flex?: string }) {
  return (
    <div style={{ flex }}>
      <label>{label}</label>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

// Grade + credit inputs for each term of the (live) schedule.
function TermFields({ cols, c }: { cols: { key: string; label: string }[]; c?: CourseT }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "flex-end", marginTop: 6 }}>
      {cols.map((t) => (
        <div key={t.key} style={{ flex: "0 0 82px" }}>
          <label style={{ fontSize: 11 }}>{t.label} grade</label>
          <input name={`grade${t.key}`} defaultValue={(c as unknown as Record<string, string | null>)?.[`grade${t.key}`] ?? ""} placeholder="e.g. A" />
          <input name={`credit${t.key}`} defaultValue={(c as unknown as Record<string, string | null>)?.[`credit${t.key}`] ?? ""} placeholder="credit" style={{ marginTop: 4 }} />
        </div>
      ))}
      <label style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto", paddingBottom: 8 }}>
        <input type="checkbox" name="creditNA" defaultChecked={c?.creditNA} style={{ width: "auto" }} /> N/A
      </label>
    </div>
  );
}

export function GradeCard({ grade, report }: { grade: string; report?: ReportT }) {
  // Live schedule: switching this instantly changes the grade/credit columns
  // on every course form below — no save needed.
  const [schedule, setSchedule] = useState<string>(report?.schedule ?? "");
  const cols = termsFor(schedule);

  return (
    <div className="card">
      <h2>{grade}th grade</h2>
      <form action={saveGradeReportAction}>
        <input type="hidden" name="grade" value={grade} />
        <div className="row">
          <div style={{ flex: "1 1 220px" }}>
            <label>School name</label>
            <input name="schoolName" defaultValue={report?.schoolName ?? ""} placeholder="Use the high school where you received credit" />
          </div>
          <Sel label="School year" name="schoolYear" value={report?.schoolYear} options={SCHOOL_YEARS} flex="1 1 130px" />
          <Sel label="Grading scale" name="gradingScale" value={report?.gradingScale} options={GRADING_SCALES} flex="1 1 130px" />
          <div style={{ flex: "1 1 130px" }}>
            <label>Schedule</label>
            <select name="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
              <option value="">— Select —</option>
              {SCHEDULES.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input type="checkbox" name="reportedAll" defaultChecked={report?.reportedAll} style={{ width: "auto" }} />
          I have reported all of my courses for this grade
        </label>
        <button className="primary" type="submit">Save {grade}th-grade transcript</button>
      </form>

      {cols.length === 0 && (
        <p className="muted" style={{ marginTop: 10 }}>
          Pick a <strong>Schedule</strong> above — the grade &amp; credit columns
          for that schedule appear on each course. (Save the transcript to keep it.)
        </p>
      )}

      {report?.courses.map((c, i) => (
        <div key={c.id} className="card" style={{ background: "rgba(255,255,255,0.02)", marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong>Course {i + 1}{c.courseName ? ` — ${c.courseName}` : ""}</strong>
            <form action={deleteGradeCourseAction}>
              <input type="hidden" name="courseId" value={c.id} />
              <button style={{ marginTop: 0 }}>Delete</button>
            </form>
          </div>
          <form action={updateGradeCourseAction}>
            <input type="hidden" name="courseId" value={c.id} />
            <div className="row">
              <Sel label="Subject" name="subject" value={c.subject} options={SUBJECTS} flex="1 1 160px" />
              <div style={{ flex: "1 1 200px" }}>
                <label>Course name</label>
                <input name="courseName" defaultValue={c.courseName ?? ""} placeholder="exactly as on transcript" />
              </div>
              <Sel label="Course level" name="courseLevel" value={c.courseLevel} options={LEVELS} flex="1 1 160px" />
            </div>
            {cols.length > 0 && <TermFields cols={cols} c={c} />}
            <button className="primary" type="submit">Save course {i + 1}</button>
          </form>
        </div>
      ))}

      <form action={addGradeCourseAction} style={{ marginTop: 12 }}>
        <input type="hidden" name="grade" value={grade} />
        <h3 style={{ marginBottom: 4 }}>Add a course</h3>
        <div className="row">
          <Sel label="Subject" name="subject" options={SUBJECTS} flex="1 1 160px" />
          <div style={{ flex: "1 1 200px" }}>
            <label>Course name</label>
            <input name="courseName" placeholder="exactly as on transcript" />
          </div>
          <Sel label="Course level" name="courseLevel" options={LEVELS} flex="1 1 160px" />
        </div>
        {cols.length > 0 && <TermFields cols={cols} />}
        <button type="submit">Add course to {grade}th grade</button>
      </form>
    </div>
  );
}
