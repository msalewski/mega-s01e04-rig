# Digest preview

`pnpm preview <output-file>` starts rig on a temporary loopback HTTP port and saves the
2026-10-28 digest as one self-contained HTML file. With no argument, the output is
`../private/preview/index.html`, outside this checkout. Never commit or attach that HTML.
The command reads the local ignored `.env`; `LANE_MARKER` appears only in the captured banner.

The manually dispatched `Publish digest preview` workflow checks the app, captures HTML in
the runner's temporary directory and deploys it to GitHub Pages. It does not run on pushes.
Its temporary upload artifact is removed after deployment (or a deployment failure).
The uploaded artifact also has a one-day retention limit if cleanup cannot finish.

Before the first run, obtain the owner's approval for Pages publication, configure Pages to
use GitHub Actions, and set the course marker as the repository secret `LANE_MARKER`.
The workflow token reads source, writes Pages, requests the Pages identity token and deletes
its temporary Actions artifact. Only the template's sample data and marker are published.

After the review arrives, obtain separate approval, then dispatch the same workflow with
`include_marker=false`. This replaces the same URL with a page showing `no marker set`.
Verify the live response before closing the cleanup issue and archiving the plan.
