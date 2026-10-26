// Force update — pure version maths. The backend names the oldest version allowed to run
// (GET /api/app-version); anything below it gets the blocking "Update required" screen.

// Compares dotted versions part by part as numbers ("1.10.0" > "1.9.3"). Missing parts count as 0
// ("1.2" == "1.2.0"); any non-digit suffix on a part is ignored ("1.2.0-beta" == "1.2.0").
export function compareVersions(a: string, b: string): number {
  const pa = a.trim().split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.trim().split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// True only when both versions are known and the installed one is older than the minimum. An
// unknown version (no minimum set, or the app cannot read its own) never blocks anyone.
export function isUpdateRequired(current: string | null | undefined, minVersion: string | null | undefined): boolean {
  if (!current || !minVersion) return false;
  return compareVersions(current, minVersion) < 0;
}
