# Sale pages and contracts

## Government Documents

The customer and payment section offers Birth Certificate (BZD 130), Death Certificate (BZD 130), Marriage Certificate (BZD 150), Birth Registration (BZD 130), Death Registration (BZD 130), Marriage Registration (BZD 150), Visa Application (BZD 100), and quote-based Late Registration, Apostille, and Translation. An agreed positive quote per request is required for quote-based services.

One sale can contain one to three requests of the selected service, with separate applicant details. Applicant, mother, and father ID availability are recorded with an ID number/reference when available. Each unavailable ID requires a reason and one declaration at BZD 20. The form shows the fee breakdown and calculated BZD total. The server independently validates details and recomputes prices and declaration counts, retaining the existing sale access rules and duplicate-request protection. ID image uploads are not part of this version.

Saved details appear in Sale details and in an appendix to the downloaded contract PDF. Existing contracts and non-government sale flows remain available. The Government Documents price list is also published under the category; calculation rates are defined in the client catalog and the database validator and must be changed together.

Profile signature drawing records dots immediately on pointer contact, retains coalesced movement samples and the final pointer-up segment, and ignores secondary pointers. The signature dialog locks background scrolling and restores the original page position when closed.

Migration: `supabase/migrations/20261121152833_government_services_and_declarations.sql`. Regression checks: `tests/portfolio-gov-docs.cjs`, `tests/portfolio-signature-pad.cjs`, `tests/contract-document.cjs`, and rollback-only `supabase/tests/government-services.sql`.

## Contract workflow

Record a sale opens an in-app page, not a modal. Cancel, browser Back and successful saves return to the original Portfolio context. Unsaved form fields are held only in memory and cleared on an account switch. Existing sales remain readable; older records have no invented contract.

The six service categories have replaceable mock contract wording. The form shows one paper-style contract. Every placeholder is an editable inline field, including auto-populated customer details, fees, dates and the prepared-by name. Matching sale fields stay synchronized. The actual signer's account identity remains recorded separately from editable contract wording. There are no scope, deliverables or other separate contract text areas. Administrators edit the title, header, body and footer in Portfolio → Manage → Contract template, and can insert named blanks anywhere. A token such as `{{custom_reference_1}}` creates a fillable field; typing an underscore line (____) in the admin editor automatically converts it into a named blank when saved. Repeated names share values. All blanks and edited header/footer text carry into the saved snapshot and editable PDF. Limits: 100 distinct blanks, 4,000 characters per header/footer, 12,000 body characters. Each save advances its version; an open sale rejects a stale version. Category sales access remains enforced on the server.

The main Download contract PDF produces a print-ready copy: form appearances are painted into the page, and form fields/annotations are removed so PDF viewers cannot add colored input highlights. Download editable copy remains available separately with AcroForm fields. Neither download changes the saved record or signature. The logo and all entered text are retained.

This version edits the built-in text templates. It does not upload or automatically map external PDF/image templates. Future PDF imports should read actual AcroForm fields across every page; blank-looking areas in flat PDFs/images require explicit mapping, not a claim of reliable automatic field detection.

Profile → Your signature accepts a drawing or an existing PNG/JPG/WebP, normalized to PNG. Each account reads only its own reusable signature. Saving a sale requires explicit confirmation to use it. The server copies the authenticated staff member's signature, name, contract text/version, fields and bank details into the sale snapshot. Later profile/template edits do not rewrite historical contracts. This is a signature image, not a certificate-based digital signature. Mock wording is clearly labeled until replaced.

Payment method currently offers IFT only, as requested. Atlantic Bank details are text. Sale records offer View details → Download contract PDF. PDFs use A4 pages, editable AcroForm fields, dynamic continuation pages, an embedded signature image and record reference/page footers. Changes made to a downloaded PDF do not update the database. Excel/CSV include payment method, contract date and template version. PDF library: pdf-lib 1.17.1 (MIT), vendored from its official jsDelivr distribution; SHA-256 0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f.

Migrations: `supabase/migrations/202611170034_portfolio_contracts.sql`, `202611170035_contract_document_layout.sql` and `202611170036_editable_contract_blanks.sql`. They add owner-only profile signatures, admin-managed templates and nullable contract fields for legacy sales. The sale RPC remains authenticated, access-checked and idempotent. Document-shaped contracts use `document-v1`; older form-shaped snapshots remain downloadable. Tests against the deployed database use a transaction that is rolled back; no synthetic sale or signature is retained.

Validation:

```
node tests/portfolio.cjs
npm install --prefix tmp/test-runtime jsdom@26.1.0 --no-save --ignore-scripts
node tests/portfolio-contracts.cjs
node tests/portfolio-template-editor.cjs
node tests/portfolio-contract-pdf.cjs
node tests/contract-document.cjs
python tests/verify-contract-pdfs.py
pdftoppm -png tmp/pdfs/Marketing.pdf tmp/pdfs/marketing-preview
```
