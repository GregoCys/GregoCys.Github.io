# GregoCys Portfolio — QA Review (PR #3)

## Scope
Review of the new feature branch only. The live `main` branch is unchanged by this work.

## Automated / source-level checks completed
- Verified the current feature branch contains the root HTML pages, six sanitized interview assessments, two CrackMe analyses, two original GregoGuard research articles, two report pages, and three professional engineering case studies.
- Inspected internal page, asset, and in-page anchor targets across **22 published HTML pages**; no missing internal targets were found.
- Confirmed all 22 content pages include a focusable skip-to-content control and a matching `main-content` target.
- Checked main website pages for missing `alt` attributes on `img` elements; none were detected.
- Added responsive navigation styles and improved menu behavior: `aria-expanded` state, Escape-to-close, focus return, and safe handling on pages without a footer year.
- Added print styles for an accessible HTML résumé and a directly downloadable PDF résumé at `assets/Brandon_Scott_Gregory_Resume.pdf`.
- Confirmed the résumé PDF file exists as a Git blob in the feature branch.
- Preserved existing `CNAME`, GitHub Pages workflow, and deployment settings.
- Credential cards link to the owner's Credly collection rather than implying individual badge URLs have been verified.

## Manual checks recommended before merging
- Test at approximately 375px, 768px, and 1440px widths in a real browser and inspect menu layout and horizontal overflow.
- Keyboard-only navigation: Tab from the top; use skip link; open menu; press Escape; verify focus and visible outlines.
- Browser print/Save as PDF for `resume.html` and direct PDF download.
- Test contact and external links; confirm per-badge Credly details and certification status.
- Run automated accessibility tools (for example axe or Lighthouse) against a deployed preview.
- Confirm that publishing even sanitized interview assessment summaries is allowed by the employer's challenge terms.

## Editorial constraints
- Engineering workstreams are generalized and do not claim unsupported organization-wide deployments, metrics, or security outcomes.
- Interview assessments are clearly separated from independent CrackMes and professional security engineering work.
- No original company-branded interview PDF, extracted private key, screenshot, or challenge answer has been uploaded.
