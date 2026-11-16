# Company Portfolio

The Portfolio navigation item uses the existing app font and colors. Administration → Portfolio controls opens the management page.

Marketing, Accounting and Government Documents are available. HR, Business Intelligence and IT start as Coming soon. Marketing has Videos & Reels, Flyers and Websites folders, with no fabricated URLs or pricing. Accounting starts with portfolio links disabled.

Administrators manage categories, availability, folders, individual Google Drive folder URLs, services, pricing and employee access. Archiving is reversible from Manage. Google Drive sharing remains controlled in Google Drive; the app does not change Drive permissions.

New employees receive no category access until an administrator assigns View only or View & record sales. Administrators have full access. Employees can only read their own sales in categories they can access. Administrators can review all submissions. Access is enforced in PostgreSQL RLS and mutation functions, including direct API requests.

Sales save to `pf_sales`, linked to the category and submitting user. Each sale uses an idempotent UUID. Sales records support customer/date filters and separate Excel/CSV exports for the selected category. Exports read the database records; they do not write to an external Google Sheet. CSV cells are escaped against spreadsheet formulas. Exports over 20,000 matching rows require a narrower filter.

Apply `supabase/migrations/202611160032_company_portfolio.sql` before publishing the frontend. No additional secrets, billing services or third-party libraries are needed.

Validation: `node tests/portfolio.cjs`, session regression tests, JavaScript syntax checks. Live rollback-only database tests covered unassigned-category isolation, administrator-only management, view-only sale rejection, authorized sales, unsafe Drive URL rejection, idempotency, customer-record isolation, and immediate access revocation. Test rows and test access changes were rolled back.