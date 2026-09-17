(() => {
    const config = window.SENCYE_CONFIG || {};

    const listeners = {
        signal: new Set(),
        voice: new Set(),
        location: new Set()
    };

    let companionId = null;
    let mode = "demo";
    let bc = null;
    let supabaseClient = null;
    let realtimeChannel = null;
    let initialized = false;
    let initialization = null;
    let channelReady = false;
    let connectionError = null;

    function normalizeId(value) {
        const v = String(value || "").trim();
        return v || config.DEMO_COMPANION_ID || "SENCYE-DEMO-001";
    }

    function getCompanionId() {
        const qr = sessionStorage.getItem("sencyeQrData");
        const saved = localStorage.getItem("sencyeCompanionId");
        return normalizeId(qr || saved);
    }

    function channelName(id) {
        return "sencye-" + normalizeId(id).replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    function hasSupabaseConfig() {
        return Boolean(
            config.SUPABASE_URL &&
            config.SUPABASE_ANON_KEY &&
            window.supabase &&
            typeof window.supabase.createClient === "function"
        );
    }

    async function init(forcedCompanionId = null) {
        await window.SENCYE_CONFIG_READY;
        if (initialization) {
            await initialization;
            if (!forcedCompanionId || normalizeId(forcedCompanionId) === companionId) return;
        }
        initialization = initialize(forcedCompanionId).catch(error => {
            connectionError = error;
            mode = 'offline';
            initialized = true;
        });
        try { await initialization; } finally { initialization = null; }
    }

    async function initialize(forcedCompanionId = null) {
        const requestedId = normalizeId(forcedCompanionId || getCompanionId());

        if (initialized && requestedId === companionId) {
            return;
        }

        await close();

        companionId = requestedId;

        if (forcedCompanionId) {
            localStorage.setItem("sencyeCompanionId", companionId);
        } else if (sessionStorage.getItem("sencyeQrData")) {
            localStorage.setItem("sencyeCompanionId", companionId);
        }

        if (hasSupabaseConfig()) {
            mode = "supabase";

            supabaseClient = window.supabase.createClient(
                config.SUPABASE_URL,
                config.SUPABASE_ANON_KEY
            );

            realtimeChannel = supabaseClient
                .channel(channelName(companionId))
                .on("broadcast", { event: "signal" }, ({ payload }) => {
                    listeners.signal.forEach(cb => cb(payload));
                })
                .on("broadcast", { event: "voice-note" }, ({ payload }) => {
                    listeners.voice.forEach(cb => cb(payload));
                })
                .on("broadcast", { event: "location-update" }, ({ payload }) => {
                    listeners.location.forEach(cb => cb(payload));
                });

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Koneksi pendamping belum siap. Muat ulang untuk mencoba lagi.')), 12000);
                realtimeChannel.subscribe(status => {
                    channelReady = status === 'SUBSCRIBED';
                    if (channelReady) { clearTimeout(timer); connectionError = null; resolve(); }
                    else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
                        clearTimeout(timer);
                        connectionError = new Error('Koneksi pendamping terputus. Periksa internet dan muat ulang.');
                        reject(connectionError);
                    }
                });
            });
        } else {
            mode = "demo";

            if ("BroadcastChannel" in window) {
                bc = new BroadcastChannel(channelName(companionId));

                bc.addEventListener("message", event => {
                    const message = event.data || {};

                    if (message.kind === "signal") {
                        listeners.signal.forEach(cb => cb(message.payload));
                    }

                    if (message.kind === "voice-note") {
                        listeners.voice.forEach(cb => cb(message.payload));
                    }

                    if (message.kind === "location-update") {
                        listeners.location.forEach(cb => cb(message.payload));
                    }
                });
            }
        }

        initialized = true;
    }

    async function sendBroadcast(event, kind, payload) {
        await init();
        assertConnected();

        const message = {
            ...payload,
            companionId,
            sentAt: Date.now()
        };

        if (mode === "supabase" && realtimeChannel) {
            const result = await realtimeChannel.send({
                type: "broadcast", event, payload: message
            });
            if (result !== 'ok') throw new Error('Pesan belum terkirim. Periksa koneksi.');
        } else if (bc) {
            bc.postMessage({
                kind,
                payload: message
            });
        }

        return message;
    }

    async function sendSignal(payload) {
        return sendBroadcast("signal", "signal", payload);
    }

    async function sendLocation(payload) {
        return sendBroadcast(
            "location-update",
            "location-update",
            {
                ...payload,
                source: payload.source || "user"
            }
        );
    }

    async function sendVoiceNote(blob, durationMs = 0, senderRole = "user") {
        await init();
        assertConnected();

        if (mode === "supabase" && supabaseClient) {
            const mime = blob.type || "audio/webm";
            const ext =
                mime.includes("mp4") ? "m4a" :
                mime.includes("ogg") ? "ogg" :
                "webm";

            const fileName =
                `${companionId}/${senderRole}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

            const { error: uploadError } =
                await supabaseClient.storage
                    .from(config.VOICE_BUCKET || "voice-notes")
                    .upload(fileName, blob, {
                        contentType: mime,
                        upsert: false
                    });

            if (uploadError) {
                throw uploadError;
            }

            const { data: urlData } =
                supabaseClient.storage
                    .from(config.VOICE_BUCKET || "voice-notes")
                    .getPublicUrl(fileName);

            const audioUrl = urlData.publicUrl;

            const row = {
                companion_id: companionId,
                audio_url: audioUrl,
                duration_ms: durationMs,
                sender_role: senderRole,
                created_at: new Date().toISOString()
            };

            const { data: insertData, error: insertError } =
                await supabaseClient
                    .from("voice_notes")
                    .insert(row)
                    .select()
                    .single();

            if (insertError) {
                throw insertError;
            }

            const payload = {
                id: insertData.id,
                audioUrl,
                durationMs,
                senderRole: insertData.sender_role || senderRole,
                createdAt: insertData.created_at,
                companionId
            };

            if (realtimeChannel) {
                const result = await realtimeChannel.send({type:'broadcast', event:'voice-note', payload});
                if (result !== 'ok') throw new Error('Rekaman tersimpan, tetapi notifikasi belum terkirim.');
            }

            return payload;
        }

        const payload = {
            id: crypto.randomUUID(),
            blob,
            durationMs,
            senderRole,
            createdAt: new Date().toISOString(),
            companionId
        };

        if (bc) {
            bc.postMessage({
                kind: "voice-note",
                payload
            });
        }

        return payload;
    }

    async function loadVoiceNotes(limit = 20) {
        await init();

        if (mode !== "supabase" || !supabaseClient) {
            return [];
        }

        const { data, error } =
            await supabaseClient
                .from("voice_notes")
                .select("id, audio_url, duration_ms, sender_role, created_at")
                .eq("companion_id", companionId)
                .order("created_at", { ascending: false })
                .limit(limit);

        if (error) {
            throw error;
        }

        return (data || []).map(item => ({
            id: item.id,
            audioUrl: item.audio_url,
            durationMs: item.duration_ms || 0,
            senderRole: item.sender_role || "user",
            createdAt: item.created_at,
            companionId
        }));
    }

    function onSignal(callback) {
        listeners.signal.add(callback);
        return () => listeners.signal.delete(callback);
    }

    function onVoiceNote(callback) {
        listeners.voice.add(callback);
        return () => listeners.voice.delete(callback);
    }

    function onLocation(callback) {
        listeners.location.add(callback);
        return () => listeners.location.delete(callback);
    }

    function assertConnected() {
        if (mode === 'offline' || (mode === 'supabase' && !channelReady)) throw connectionError || new Error('Koneksi pendamping belum tersedia.');
        if (mode === 'demo' && !bc) throw new Error('Browser tidak mendukung koneksi lokal.');
    }

    async function close() {
        initialized = false;
        channelReady = false;
        connectionError = null;

        if (bc) {
            bc.close();
            bc = null;
        }

        if (supabaseClient && realtimeChannel) {
            try {
                await supabaseClient.removeChannel(realtimeChannel);
            } catch (_) {}
        }

        realtimeChannel = null;
        supabaseClient = null;
    }

    window.SenCyeTransport = {
        init,
        close,
        sendSignal,
        sendVoiceNote,
        sendLocation,
        loadVoiceNotes,
        onSignal,
        onVoiceNote,
        onLocation,
        getCompanionId: () => companionId || getCompanionId(),
        getMode: () => mode,
        getConnectionError: () => connectionError?.message || ""
    };
})();
