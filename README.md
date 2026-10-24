# Esquiliano Attendance

Independent HTML/CSS/JavaScript PWA. GitHub Pages hosts the UI; the Esquiliano Supabase project handles Auth, Postgres, Realtime and Edge Functions. No SwiftShop or consulting-site source is used.

## Deployment

Publish main from repository root using GitHub Pages. CNAME: attendance.swiftshopow.com. Squarespace DNS: attendance CNAME dancu1213t-ctrl.github.io. Enable HTTPS when GitHub finishes issuing its certificate.

The browser config contains only the publishable key, project URL and public VAPID key. Never put a service-role key or private VAPID key in GitHub. The push private key lives in Supabase Edge Function Secrets. Serve HTTPS for camera, GPS, installation and push.

## Database

Apply all numbered files in supabase/migrations once to the Esquiliano project only. They create att_* tables and authenticated RPCs, with RLS on every table. The existing office coordinates, 100 m radius, 50 m maximum GPS uncertainty, Belize time, 8 AM–4 PM shift and 10-minute grace are defaults. The clock RPC computes time and location on the server, serializes employee submissions, rejects repeated actions and supports idempotent request IDs. Phone GPS reports can be spoofed; this is a proximity check, not a certified anti-fraud device.

Deploy supabase/functions/attendance-admin. Its handler verifies the user token with Auth and checks the active admin profile before privileged actions. Legacy gateway JWT verification is off because the handler accepts the project's current Auth JWTs. CORS is restricted to the app domain. ATTENDANCE_ORIGINS can contain a comma-separated temporary test origin. VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY enable push; VAPID_SUBJECT defaults to the company contact. Default Supabase server secrets are supplied by the platform.

## Accounts

The first administrator is ESQ0001. Its code was selected privately by the owner; it is not included in this repository. Auth emails use employee-id@attendance.esquiliano.invalid as an internal identifier, not a mailbox. New users are created from Admin > People with codes of 8–32 characters. No public registration UI is provided. Reset codes from Edit person. Disable a person with Status > Inactive; attendance history remains. At least one active administrator is retained. Admin and employee sessions have different browser storage keys. Profile lets a signed-in administrator switch between their two profiles without logging the employee out.

## Notifications

Supabase Realtime delivers inbox updates while open, with a 30-second refresh fallback. Server-generated attendance confirmations and administrator messages also use Web Push through the Edge Function. Push delivery depends on browser permission and an active subscription; iPhone users must install the app on their Home Screen. Notifications contain employee names and attendance status, so only enable them on a trusted device. No email or SMS is sent. Notification retries and bulk queued delivery are not scheduled; the sender invokes delivery immediately after saving.

## Mobile

Install from the browser menu. The service worker caches only the app shell, never database responses, photos or attendance records. Attendance requires an internet connection. QR scanning uses the camera or an uploaded photo, with a 3-minute local scan window. The admin can print or replace the wall QR. Codes from the old Apps Script site do not work in this app; print a new QR from Admin.

## Validation

JavaScript syntax checks, desktop and 320/390/430 px layout review, and transactional database checks cover profile/event/notification isolation, admin-only QR access, distance, accuracy, device reuse/revocation, current profile names, action sequencing and request deduplication. Database test fixtures are rolled back. Actual iOS/Android camera, GPS and push delivery still need an on-device test after HTTPS is ready.

The former Google Sheet remains the legacy archive. Accounts, photos and historical records have not been imported automatically; the owner can add accounts using the new People screen. The Apps Script deployment remains available during transition.

## Welcome and job roles

The root address opens the branded welcome page. Explicit view links and office QR scans enter the requested app screen directly. All six job roles are stored in att_profiles.job_role and appear in profiles and the People list. They do not affect administrator access; the existing role field continues to control permissions. Apply migration 202610230003_job_roles.sql and deploy the accompanying admin function when updating an independent installation.

Push delivery works when the app is closed on supported, opted-in devices; a powered-off phone cannot display notifications. The current push-service TTL is five minutes. Messages remain in the database inbox even if a push expires. iPhone users need the Home Screen installation and notification permission. No claim of guaranteed delivery is made.
