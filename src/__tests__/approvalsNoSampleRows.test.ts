import { readFileSync } from 'fs';
import { join } from 'path';

// When the app's request list failed to load, Approvals filled itself with two made-up requests
// (Rohan Mehta's salary release with an Approve button, Nandni Shah's holiday) — on Afshin's phone
// they read as real approvals (2026-11-17). A failed load must say so and offer a retry; no screen
// may ship invented approvals.
const src = readFileSync(join(__dirname, '..', 'components', 'approvals', 'ApprovalsScreen.tsx'), 'utf8');

describe('Approvals never shows invented requests', () => {
  it('has no sample approvals to fall back on', () => {
    expect(src).not.toMatch(/DEMO_APPROVALS/);
    expect(src).not.toMatch(/Rohan Mehta|Nandni Shah/);
    expect(src).not.toMatch(/['"]demo-\d['"]/);
  });

  it('a failed load shows the error and can be pulled down to retry', () => {
    expect(src).toMatch(/setLoadError\(true\)/);
    expect(src).toMatch(/<RefreshControl/);
    expect(src).toMatch(/Pull down to try again/);
  });

  it('says when the ERP check could not reach the server, with a retry', () => {
    expect(src).toMatch(/erp\.state === 'error'/);
    expect(src).toMatch(/erp\.retry\(\)/);
  });
});
