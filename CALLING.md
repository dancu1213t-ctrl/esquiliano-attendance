# Loop calling
LiveKit project: Esquiliano Loop (Build, no payment method required).
Room media uses LiveKit; call invitations, device claiming, history and attendance remain in Supabase.
The Build plan stops new requests at its free quota. No paid plan is configured by this integration.

## Backend
Deploy supabase/functions/loop-call-token/index.ts with verify_jwt=false as specified in config.toml.
The function independently checks the user JWT, active profile, accepted/connected call, device ownership and heartbeat freshness. Join tokens last 120 seconds and grant only that call's room, microphone, and camera for video calls.
LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET belong exclusively in Supabase secrets. Never put them in config.js or source control.
The client uses livekit-client 2.24.1 from jsDelivr with a SHA-384 integrity pin.

## Client
Existing sessions must reload to receive the LiveKit client.
Audio output uses setSinkId/selectAudioOutput when supported. Unsupported mobile browsers use OS audio routing; the UI gives the phone/speaker/Bluetooth instructions rather than pretending to switch outputs.
Incoming alerts use existing push notifications. Browsers still control locked-screen delivery, notification sounds and media permissions.
No recording, AI agents, transcription or telephony numbers are configured.

## Checks
node tests/loop-calls.cjs
node tests/loop-audio-output.cjs
node tests/loop-call-token.cjs
