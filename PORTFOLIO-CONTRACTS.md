# Sale pages and contracts

Record a sale opens an in-app page, not a modal. Cancel, browser Back and successful saves return to the original Portfolio context. Unsaved form fields are held only in memory and cleared on an account switch. Existing sales remain readable; older records have no invented contract.

The six service categories have replaceable mock contract wording. Administrators replace the title and body in Portfolio → Manage → Contract template. Each save advances its version; an open sale rejects a stale version. Category sales access remains enforced on the server. Coming-soon portfolio categories can be used for a contract by authorized staff without publishing their portfolio content.

Profile → Your signature accepts a drawing or an existing PNG/JPG/WebP, normalized to PNG. Each account reads only its own reusable signature. Saving a sale requires explicit confirmation to use it. The server copies the authenticated staff member's signature, name, contract text/version, fields and bank details into the sale snapshot. Later profile/template edits do not rewrite historical contracts. This is a signature image, not a certificate-based digital signature. Mock wording is clearly labeled until replaced.

Payment method currently offers IFT only, as requested. Atlantic Bank details are text. Sale records offer View details → Download contract PDF. PDFs use A4 pages, editable AcroForm fields, dynamic continuation pages, an embedded signature image and record reference/page footers. Changes made to a downloaded PDF do not update the database. Excel/CSV include payment method, contract date and template version. PDF library: pdf-lib 1.17.1 (MIT), vendored from its official jsDelivr distribution; SHA-256 0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f.

Migration: `supabase/migrations/202611170034_portfolio_contracts.sql`. It adds owner-only profile signatures, admin-managed templates and nullable contract fields for legacy sales. The sale RPC remains authenticated, access-checked and idempotent. Tests against the deployed database use a transaction that is rolled back; no synthetic sale or signature is retained.

Validation:

```
node tests/portfolio.cjs
npm install --prefix tmp/test-runtime jsdom@26.1.0 --no-save --ignore-scripts
node tests/portfolio-contracts.cjs
node tests/portfolio-contract-pdf.cjs
python tests/verify-contract-pdfs.py
pdftoppm -png tmp/pdfs/Marketing.pdf tmp/pdfs/marketing-preview
```
