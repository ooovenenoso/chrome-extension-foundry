// MVP — wire TIP_LINKS at build time from STRIPE_LINKS.md.
const TIP_LINKS = { tip3: '#', tip5: '#', tip10: '#' };
for (const [k, v] of Object.entries(TIP_LINKS)) {
  const el = document.getElementById(k);
  if (el) el.href = v;
}
