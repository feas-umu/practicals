/* =====================================================================
   SITE SETTINGS — the only file you normally need to edit.
   ===================================================================== */
window.REQ_CONFIG = {
  /* Paste the Web App URL from Google Apps Script here (Deploy → Manage
     deployments → Web app → Copy). Until you do, the site runs in PREVIEW
     mode: nothing is recorded and the PDF is marked PREVIEW. */
  API_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",

  /* Departments. Must match DEPARTMENTS in Code.gs (which also sets who approves). */
  DEPARTMENTS: ["Civil Engineering", "Water Engineering", "Mechanical Engineering", "Electrical Engineering"],

  /* Academic years offered: 2026/2027 and the next five. Must match FIRST_ACADEMIC_YEAR
     and ACADEMIC_YEARS_SHOWN in Code.gs. */
  FIRST_ACADEMIC_YEAR: 2026,
  ACADEMIC_YEARS_SHOWN: 6,

  SEMESTERS: ["Semester I", "Semester II"],
  LOCATIONS: ["Workshop", "Laboratory", "Field"],

  /* Lecturers must use an address at one of these domains. Must match ALLOWED_EMAIL_DOMAINS in Code.gs. */
  EMAIL_DOMAINS: ["umu.ac.ug"],

  MAX_SESSIONS: 30,
  MAX_ITEMS: 60,

  /* Printed on the PDF. */
  PRINT: {
    university: "Uganda Martyrs University",
    faculty: "Faculty of Engineering and Applied Sciences",
    campus: "Fort Portal Campus",
    title: "PRACTICAL MATERIALS SUBMISSION"
  }
};
