const transport = window.SenCyeTransport;
const config = window.SENCYE_CONFIG || {};

const mapElement = document.getElementById("google-map");
const mapMessage = document.getElementById("map-message");
const liveSpeed = document.getElementById("live-speed");
const speedValue = liveSpeed.querySelector("span");

const recordingPanel = document.getElementById("monitor-recording");
const recordingTime = document.getElementById("monitor-record-time");

const callModal = document.getElementById("monitor-call-modal");
const callStatus = document.getElementById("monitor-call-status");
const hangupButton = document.getElementById("monitor-hangup");
const remoteAudio = document.getElementById("monitor-remote-audio");

const toast = document.getElementById("monitor-toast");

let googleMap = null;
let userMarker = null;
let trackPolyline = null;
let path = [];
let toastTimer = null;

let micStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let activeVoiceButton = null;

let peerConnection = null;
let callMicStream = null;
let activeCallId = null;
let incomingOffer = null;
let voiceObjectUrl = null;
let pendingIce = [];

document.addEventListener("DOMContentLoaded", async () => {
    await transport.init();

    setupSwipeRows();
    setupTelephoneCardTap();
    setupVoiceActions();
    setupCallActions();
    setupIncomingSignals();
    setupLiveLocation();

    loadGoogleMaps();
});


/* =========================================================
   GOOGLE MAPS
   ========================================================= */

function loadGoogleMaps() {
    if (!config.GOOGLE_MAPS_API_KEY) {
        mapMessage.textContent =
            "Menunggu lokasi pengguna…";
        return;
    }

    if (window.google?.maps) {
        initGoogleMap();
        return;
    }

    const callbackName = "__sencyeInitGoogleMap";

    window[callbackName] = () => {
        initGoogleMap();
        delete window[callbackName];
    };

    const script = document.createElement("script");

    script.src =
        "https://maps.googleapis.com/maps/api/js" +
        `?key=${encodeURIComponent(config.GOOGLE_MAPS_API_KEY)}` +
        `&callback=${callbackName}` +
        "&v=weekly";

    script.async = true;
    script.defer = true;

    script.addEventListener("error", () => {
        mapMessage.textContent =
            "Google Maps gagal dimuat. Periksa API key, billing, dan restriction key.";
    });

    document.head.appendChild(script);
}

function initGoogleMap() {
    const defaultCenter = {
        lat: -7.0503,
        lng: 110.4407
    };

    googleMap = new google.maps.Map(mapElement, {
        center: defaultCenter,
        zoom: 15,
        mapId: config.GOOGLE_MAP_ID || undefined,
        disableDefaultUI: true,
        gestureHandling: "greedy"
    });

    trackPolyline = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: "#4822d8",
        strokeOpacity: 1,
        strokeWeight: 6,
        map: googleMap
    });

    mapElement.classList.add("ready");
    mapMessage.textContent = "Menunggu lokasi user...";
}

function updateMapLocation(location) {
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
        return;
    }

    const point = {
        lat: Number(location.lat),
        lng: Number(location.lng)
    };

    path.push(point);

    if (path.length > 300) {
        path.shift();
    }

    if (googleMap) {
        if (!userMarker) {
            userMarker = new google.maps.Marker({
                position: point,
                map: googleMap,
                title: "User SenCye"
            });
        } else {
            userMarker.setPosition(point);
        }

        trackPolyline.setPath(path);
        googleMap.panTo(point);

        mapMessage.hidden = true;
    }

    if (!googleMap) {
        mapMessage.hidden = false;
        mapMessage.textContent = `Lokasi pengguna: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    }

    const speedKmh =
        Number.isFinite(location.speed) && location.speed !== null
            ? Math.max(0, location.speed * 3.6)
            : 0;

    speedValue.textContent = speedKmh.toFixed(0);
    liveSpeed.hidden = false;
}

function setupLiveLocation() {
    transport.onLocation(location => {
        if (location?.source === "user") {
            updateMapLocation(location);
        }
    });
}


/* =========================================================
   SWIPE LEFT TO REVEAL ACTIONS
   ========================================================= */

function setupSwipeRows() {

    document
        .querySelectorAll(".swipe-row")
        .forEach(row => {

            const card =
                row.querySelector(
                    ".swipe-card"
                );


            let startX = 0;
            let startY = 0;

            let currentX = 0;

            let dragging = false;


            card.addEventListener(
                "pointerdown",
                event => {

                    startX =
                        event.clientX;

                    startY =
                        event.clientY;

                    currentX =
                        startX;

                    dragging = true;


                    card.setPointerCapture?.(
                        event.pointerId
                    );

                }
            );


            card.addEventListener(
                "pointermove",
                event => {

                    if (!dragging) {
                        return;
                    }


                    currentX =
                        event.clientX;


                    const dx =
                        currentX -
                        startX;


                    const dy =
                        event.clientY -
                        startY;


                    /*
                     * Kalau gerakan lebih dominan vertikal,
                     * biarkan browser melakukan scroll.
                     */
                    if (
                        Math.abs(dy) >
                        Math.abs(dx)
                    ) {
                        return;
                    }


                    const alreadyOpen =
                        row.classList.contains(
                            "open"
                        );


                    let translate =
                        alreadyOpen
                            ? -126 + dx
                            : dx;


                    translate =
                        Math.max(
                            -126,
                            Math.min(
                                0,
                                translate
                            )
                        );


                    card.style.transition =
                        "none";


                    card.style.transform =
                        `translateX(${translate}px)`;

                }
            );


            card.addEventListener(
                "pointerup",
                event => {

                    if (!dragging) {
                        return;
                    }


                    dragging = false;


                    const dx =
                        event.clientX -
                        startX;


                    const dy =
                        event.clientY -
                        startY;


                    card.style.transition = "";

                    card.style.transform = "";


                    if (
                        Math.abs(dx) >
                        Math.abs(dy)
                    ) {

                        if (dx < -32) {

                            document
                                .querySelectorAll(
                                    ".swipe-row.open"
                                )
                                .forEach(
                                    other => {

                                        if (
                                            other !==
                                            row
                                        ) {
                                            other.classList.remove(
                                                "open"
                                            );
                                        }

                                    }
                                );


                            row.classList.add(
                                "open"
                            );

                        }


                        if (dx > 32) {

                            row.classList.remove(
                                "open"
                            );

                        }

                    }

                }
            );


            card.addEventListener(
                "pointercancel",
                () => {

                    dragging = false;

                    card.style.transition = "";
                    card.style.transform = "";

                }
            );

        });

}


/* =========================================================
   PENDAMPING -> USER VOICE NOTE
   Hold tombol mic setelah notification digeser.
   ========================================================= */

function setupVoiceActions() {
    document.querySelectorAll(".swipe-voice").forEach(button => {
        button.addEventListener("contextmenu", event => event.preventDefault());

        button.addEventListener("pointerdown", async event => {
            event.preventDefault();
            activeVoiceButton = button;

            try {
                await beginRecording();
                if (activeVoiceButton !== button) cancelRecording();
            } catch (error) {
                console.error(error);
                showToast("Mikrofon tidak dapat digunakan.");
                activeVoiceButton = null;
            }
        });
    });

    window.addEventListener("pointerup", async () => {
        if (!activeVoiceButton) return;

        activeVoiceButton = null;
        await finishRecording();
    });

    window.addEventListener("pointercancel", () => {
        activeVoiceButton = null;
        cancelRecording();
    });
}

async function beginRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error("MediaRecorder tidak didukung.");
    }

    micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true
        },
        video: false
    });

    const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus"
    ];

    const mimeType =
        types.find(type => MediaRecorder.isTypeSupported(type)) || "";

    mediaRecorder = new MediaRecorder(
        micStream,
        mimeType ? { mimeType } : undefined
    );

    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", event => {
        if (event.data?.size) {
            audioChunks.push(event.data);
        }
    });

    mediaRecorder.start(250);

    recordingStartedAt = Date.now();
    recordingPanel.hidden = false;

    updateRecordingTimer();
    recordingTimer = setInterval(updateRecordingTimer, 250);
}

function updateRecordingTimer() {
    const sec = Math.floor((Date.now() - recordingStartedAt) / 1000);

    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");

    recordingTime.textContent = `Merekam ${mm}:${ss}`;
}

async function finishRecording() {
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
        cleanupRecording();
        return;
    }

    const durationMs = Date.now() - recordingStartedAt;

    if (durationMs < 450) {
        cancelRecording();
        showToast("Tahan tombol voice note sedikit lebih lama.");
        return;
    }

    const recorder = mediaRecorder;

    const stopped = new Promise(resolve => {
        recorder.addEventListener("stop", resolve, { once: true });
    });

    recorder.stop();
    await stopped;

    const blob = new Blob(audioChunks, {
        type: recorder.mimeType || "audio/webm"
    });

    cleanupRecording();

    try {
        await transport.sendVoiceNote(
            blob,
            durationMs,
            "companion"
        );

        showToast(transport.getMode() === "supabase" ? "Voice note dikirim ke user." : "Rekaman dikirim ke tab browser ini. Koneksi antar-HP belum aktif.");
    } catch (error) {
        console.error(error);
        showToast("Voice note gagal dikirim.");
    }
}

function cancelRecording() {
    try {
        if (mediaRecorder?.state === "recording") {
            mediaRecorder.stop();
        }
    } catch (_) {}

    cleanupRecording();
}

function cleanupRecording() {
    clearInterval(recordingTimer);
    recordingTimer = null;

    recordingPanel.hidden = true;

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
    }

    micStream = null;
    mediaRecorder = null;
    audioChunks = [];
}


/* =========================================================
   PENDAMPING -> USER AUDIO CALL
   ========================================================= */

function setupCallActions() {
    document.querySelectorAll(".swipe-call").forEach(button => {
        button.addEventListener("click", startOutgoingCall);
    });

    hangupButton.addEventListener("click", () => hangup(true));
}

function setupIncomingSignals() {
    document.getElementById('monitor-accept').addEventListener('click', acceptUserCall);
    document.getElementById('monitor-decline').addEventListener('click', () => {
        if (activeCallId) transport.sendSignal({type:'decline',callId:activeCallId,senderRole:'companion'}).catch(() => {});
        hangup(false);
    });
    document.getElementById('monitor-close-voice').addEventListener('click', () => {
        const player = document.getElementById('monitor-voice-player');
        player.pause(); player.removeAttribute('src');
        document.getElementById('monitor-incoming-voice').hidden = true;
        if (voiceObjectUrl) URL.revokeObjectURL(voiceObjectUrl);
        voiceObjectUrl = null;
    });
    transport.onVoiceNote(note => {
        if (note?.senderRole !== 'user') return;
        if (voiceObjectUrl) URL.revokeObjectURL(voiceObjectUrl);
        voiceObjectUrl = note.blob ? URL.createObjectURL(note.blob) : null;
        const source = note.audioUrl || voiceObjectUrl;
        if (!source) return;
        document.getElementById('monitor-voice-player').src = source;
        document.getElementById('monitor-incoming-voice').hidden = false;
    });
    transport.onSignal(async signal => {
        if (signal?.type === 'offer' && signal.senderRole === 'user') {
            if (activeCallId) {
                transport.sendSignal({type:'decline',callId:signal.callId,senderRole:'companion'}).catch(() => {});
                return;
            }
            incomingOffer = signal;
            activeCallId = signal.callId;
            pendingIce = [];
            callStatus.textContent = 'Pengguna menelepon';
            callModal.hidden = false;
            document.getElementById('monitor-incoming-actions').hidden = false;
            hangupButton.hidden = true;
            return;
        }
        if (!signal || !activeCallId || signal.callId !== activeCallId) {
            return;
        }

        try {
            if (signal.type === "answer") {
                await peerConnection.setRemoteDescription(signal.description);
                await flushPendingIce();
                callStatus.textContent = "Terhubung";
            }

            if (signal.type === "ice" && signal.candidate) {
                if (peerConnection?.remoteDescription) {
                    await peerConnection.addIceCandidate(signal.candidate);
                } else {
                    pendingIce.push(signal.candidate);
                }
            }

            if (signal.type === "decline") {
                showToast("User menolak panggilan.");
                hangup(false);
            }

            if (signal.type === "hangup") {
                showToast("Panggilan selesai.");
                hangup(false);
            }
        } catch (error) {
            console.error(error);
        }
    });
}

async function acceptUserCall() {
    if (!incomingOffer || !activeCallId) return;
    const callId = activeCallId;
    document.getElementById('monitor-accept').disabled = true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
        if (activeCallId !== callId) { stream.getTracks().forEach(track => track.stop()); return; }
        callMicStream = stream;
        peerConnection = createPeerConnection(callId);
        stream.getTracks().forEach(track => peerConnection.addTrack(track,stream));
        await peerConnection.setRemoteDescription(incomingOffer.description);
        await flushPendingIce();
        await peerConnection.setLocalDescription(await peerConnection.createAnswer());
        await transport.sendSignal({type:'answer',callId,senderRole:'companion',description:peerConnection.localDescription});
        callStatus.textContent = 'Menghubungkan…';
        document.getElementById('monitor-incoming-actions').hidden = true;
        hangupButton.hidden = false;
    } catch (_) { showToast('Panggilan gagal. Periksa izin mic dan koneksi.'); hangup(true); }
    finally { document.getElementById('monitor-accept').disabled = false; }
}

async function startOutgoingCall() {
    if (activeCallId) return;

    try {
        callMicStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            },
            video: false
        });

        activeCallId = crypto.randomUUID();
        pendingIce = [];

        peerConnection = createPeerConnection(activeCallId);

        callMicStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, callMicStream);
        });

        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true
        });

        await peerConnection.setLocalDescription(offer);

        callStatus.textContent = "Memanggil...";
        callModal.hidden = false;

        await transport.sendSignal({
            type: "offer",
            callId: activeCallId,
            senderRole: "companion",
            description: peerConnection.localDescription
        });

        const outgoingId = activeCallId;
        setTimeout(() => {
            if (activeCallId === outgoingId && peerConnection?.connectionState !== 'connected') {
                hangup(true);
                showToast('Panggilan belum tersambung. Pastikan halaman penerima terbuka.');
            }
        }, 30000);

        if (transport.getMode() === "demo") {
            showToast("Mode demo: Homepage user harus terbuka di tab browser yang sama.", 3400);
        }

    } catch (error) {
        console.error(error);
        showToast("Panggilan tidak dapat dimulai.");
        hangup(false);
    }
}

function createPeerConnection(callId) {
    const pc = new RTCPeerConnection({
        iceServers: config.ICE_SERVERS || []
    });

    pc.addEventListener("icecandidate", event => {
        if (event.candidate) {
            transport.sendSignal({
                type: "ice",
                callId,
                senderRole: "companion",
                candidate: event.candidate.toJSON()
            }).catch(() => showToast('Koneksi panggilan terputus.'));
        }
    });

    pc.addEventListener("track", event => {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => {});
    });

    pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "connected") {
            callStatus.textContent = "Terhubung";
        }

        if (
            ["failed", "disconnected", "closed"].includes(pc.connectionState) &&
            activeCallId
        ) {
            hangup(false);
        }
    });

    return pc;
}

async function flushPendingIce() {
    if (!peerConnection?.remoteDescription) return;

    for (const candidate of pendingIce) {
        await peerConnection.addIceCandidate(candidate);
    }

    pendingIce = [];
}

function hangup(notify) {
    const callId = activeCallId;

    if (notify && callId) {
        transport.sendSignal({
            type: "hangup",
            callId,
            senderRole: "companion"
        }).catch(() => {});
    }

    if (peerConnection) peerConnection.close();
    if (callMicStream) callMicStream.getTracks().forEach(track => track.stop());

    peerConnection = null;
    callMicStream = null;
    activeCallId = null;
    incomingOffer = null;
    document.getElementById('monitor-incoming-actions').hidden = true;
    hangupButton.hidden = false;
    pendingIce = [];

    remoteAudio.srcObject = null;
    callModal.hidden = true;
    callStatus.textContent = "Memanggil...";
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, duration = 2500) {
    clearTimeout(toastTimer);

    toast.textContent = message;
    toast.hidden = false;

    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, duration);
}

window.addEventListener("pagehide", () => {
    cleanupRecording();
    hangup(false);
});




/* =========================================================
   TELEPON CARD: TAP = CALL, SWIPE = ACTION MENU
   ========================================================= */

function setupTelephoneCardTap() {

    const row =
        document.querySelector(
            '[data-notification="call"]'
        );


    const card =
        row?.querySelector(
            ".swipe-card"
        );


    if (!row || !card) {
        return;
    }


    let tapStartX = 0;
    let tapStartY = 0;


    card.addEventListener(
        "pointerdown",
        event => {

            tapStartX =
                event.clientX;

            tapStartY =
                event.clientY;

        }
    );


    card.addEventListener(
        "pointerup",
        event => {

            const dx =
                Math.abs(
                    event.clientX -
                    tapStartX
                );


            const dy =
                Math.abs(
                    event.clientY -
                    tapStartY
                );


            if (
                dx < 8 &&
                dy < 8 &&
                !row.classList.contains(
                    "open"
                )
            ) {

                startOutgoingCall();

            }

        }
    );

}
