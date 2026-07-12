// Legacy GitHub list facade tests assume the pre-index path. Production default
// is index-on; force false in unit tests unless a case sets the env explicitly.
if (process.env.DASHBOARD_READ_FROM_INDEX === undefined) {
  process.env.DASHBOARD_READ_FROM_INDEX = "false";
}
