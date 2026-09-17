/*
 * SenCye configuration.
 *
 * MODE DEMO:
 * Biarkan SUPABASE_URL dan SUPABASE_ANON_KEY kosong.
 * Voice note + WebRTC call dapat diuji antara Homepage dan Dashboard
 * Pendamping pada browser/origin yang sama menggunakan BroadcastChannel.
 *
 * MODE ANTAR-PERANGKAT:
 * Isi SUPABASE_URL + SUPABASE_ANON_KEY, lalu jalankan schema.sql.
 * Jangan pernah menaruh SERVICE_ROLE_KEY di frontend.
 */
window.SENCYE_CONFIG = {
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",

    DEMO_COMPANION_ID: "SENCYE-DEMO-001",

    VOICE_BUCKET: "voice-notes",

    /*
     * Google Maps JavaScript API.
     * Isi API key browser di bawah dan batasi key hanya untuk domain
     * Vercel/localhost milik SenCye.
     */
    GOOGLE_MAPS_API_KEY: "",
    GOOGLE_MAP_ID: "DEMO_MAP_ID",

    ICE_SERVERS: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302"
            ]
        }

        /*
         * Untuk deployment lintas jaringan yang lebih andal,
         * tambahkan TURN server milikmu di sini.
         *
         * {
         *   urls: "turn:turn.example.com:3478",
         *   username: "...",
         *   credential: "..."
         * }
         */
    ]
};

// Mutate the existing config object, so all page scripts see the loaded values.
window.SENCYE_CONFIG_READY = (async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/config', {cache:'no-store', signal:controller.signal});
    if (!response.ok) return;
    const data = await response.json();
    if (data.SUPABASE_URL && data.SUPABASE_ANON_KEY) {
      window.SENCYE_CONFIG.SUPABASE_URL = data.SUPABASE_URL;
      window.SENCYE_CONFIG.SUPABASE_ANON_KEY = data.SUPABASE_ANON_KEY;
    }
  } catch (_) { /* Plain static hosting can still use js/config.js directly. */ }
  finally { clearTimeout(timeout); }
})();
