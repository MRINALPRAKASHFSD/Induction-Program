export const CLUB_REGISTRATION_OPEN_DATE = "2026-08-22T00:00:00+05:30";

export function isClubRegistrationOpen(): boolean {
  return new Date() >= new Date(CLUB_REGISTRATION_OPEN_DATE);
}

export const SCHOOLS = [
  { id: "all",   code: "ALL",   name: "All Schools (General Session)" },
  { id: "soet",  code: "SOET",  name: "School of Engineering & Technology" },
  { id: "somc",  code: "SOMC",  name: "School of Management & Commerce" },
  { id: "sols",  code: "SOLS",  name: "School of Legal Studies" },
  { id: "smas",  code: "SMAS",  name: "School of Medical & Allied Sciences" },
  { id: "sola",  code: "SOLA",  name: "School of Liberal Arts" },
  { id: "sbas",  code: "SBAS",  name: "School of Basic & Applied Sciences" },
  { id: "soad",  code: "SOAD",  name: "School of Architecture & Design" },
  { id: "sprs",  code: "SPRS",  name: "School of Physiotherapy & Rehabilitation Sciences" },
  { id: "semc",  code: "SEMC",  name: "School of Emerging Media & Creator Economy" },
  { id: "sas",   code: "SAS",   name: "School of Agricultural Sciences" },
  { id: "phd",   code: "PHD",   name: "PhD (All Disciplines)" },
];

export const PROGRAM_LEVELS = [
  "Undergraduate Programmes",
  "Postgraduate Programmes",
  "Doctoral Programmes",
  "Diploma Programmes",
];

export const ACADEMIC_SESSIONS = [
  "Session 2026–2027",
];
