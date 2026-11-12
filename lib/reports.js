// Generated files of the scripts (candidates, review decisions, caches, audit reports): all in reports/,
// the only ignored folder (see .gitignore). Created on first use.
import { mkdirSync } from "node:fs";

export const REPORTS = "reports";
export const report = (name) => { mkdirSync(REPORTS, { recursive: true }); return `${REPORTS}/${name}`; };
