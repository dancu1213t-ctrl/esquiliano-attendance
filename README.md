# Esquiliano Attendance

Staff attendance and office workspace for Esquiliano Consulting & Bookkeeping.

[Open the app](https://attendance.esquilianoconsulting.com)

## Features

- Clock in and out, attendance history, schedules, and timesheet exports.
- Staff profiles, departments, and administrator controls.
- Loop conversations, notifications, and voice/video calls.
- Company portfolio, service pricing, sales records, and contract PDFs.
- Subscription tracking and payment receipt review.

## Technology

The app uses HTML, CSS, and JavaScript without a frontend build step. GitHub Pages serves the app. Supabase provides authentication, database access, realtime updates, and server functions. LiveKit carries call audio and video. Portfolio sample folders open in Google Drive.

## Project layout

| Location | Purpose |
| --- | --- |
| `index.html`, `app.js`, `app.css` | App shell, navigation, and attendance |
| `loop*` | Conversations, calls, sounds, and audio output |
| `portfolio*` | Portfolio, sales, contracts, and PDF downloads |
| `staff*`, `schedule.js`, `departments*` | Staff management and schedules |
| `workspace*`, `subscriptions.js` | Client work and subscriptions |
| `extensions/loop-listening/` | Browser listening-status extension |
| `supabase/` | Database migrations, server functions, and database tests |
| `tests/` | Client regression tests |
| `assets/`, `vendor/` | Images and third-party libraries |
| `sw.js`, `manifest.webmanifest` | Installable app and shell caching |

Feature files stay beside the app entry point because the deployed pages load them directly. File paths, script order, and service-worker asset versions are part of the deployment.

## Local development

1. Clone the repository and open it in VS Code.
2. Serve the repository root with a local HTTP server, such as VS Code Live Server.
3. Open `index.html` through that server. Camera, location, and notifications require a secure context and browser permission.

`config.js` points to the configured backend. Local sessions can access real company data; use a separate test project for development that changes records. Public registration is not enabled. Administrators manage staff accounts in the app.

## Formatting and tests

Use Node.js 22 or later. Install the development tools and the isolated DOM test dependency:

```sh
npm ci
npm install --prefix tmp/test-runtime jsdom@26.1.0 --no-save --ignore-scripts
npm run format:check
npm test
```

Run `npm run format` to format source files. Formatting uses two-space indentation, consistent line breaks, and the checked-in Prettier configuration. Vendor assets, temporary files, and database migrations are excluded.

Client tests do not replace browser checks or the transactional database tests in `supabase/tests/`. Calls, device permissions, and push delivery also need checks on the receiving devices.

## Deployment

GitHub Pages publishes the root of `main`. The custom hostname is stored in `CNAME`. Changes to backend functions or the database require a separate deployment. Keep asset query versions and the service-worker cache version aligned when changing runtime behavior.

Only publishable client configuration belongs in `config.js`. Service-role keys, private push keys, and LiveKit secrets belong in backend secrets, never in GitHub or browser code.

## Documentation

- [Portfolio and permissions](PORTFOLIO.md)
- [Sales, signatures, and contracts](PORTFOLIO-CONTRACTS.md)
- [Calling setup](CALLING.md)
- [Implementation notes](docs/implementation-notes.md)

Third-party code and its license notices remain in `vendor/`.
