const transport = window.SenCyeTransport;
const config = window.SENCYE_CONFIG || {};

const streakBurst = document.getElementById("streak-burst");
const streakMask = document.getElementById("streak-mask");

const voiceButton = document.getElementById("voice-button");
const recordingPill = document.getElementById("recording-pill");
const recordingTime = document.getElementById("recording-time");

const callButton = document.getElementById("call-button");
const callModal = document.getElementById("call-modal");
const callStatus = document.getElementById("call-status");
const hangupButton = document.getElementById("hangup-button");
const remoteAudio = document.getElementById("remote-audio");

const sosButton = document.getElementById("sos-button");
const bikeButton = document.getElementById("bike-button");
const toast = document.getElementById("toast");

let toastTimer = null;

const incomingUserCall = document.getElementById("incoming-user-call");
const userAcceptCall = document.getElementById("user-accept-call");
const userDeclineCall = document.getElementById("user-decline-call");

const incomingCompanionVoice = document.getElementById("incoming-companion-voice");
const companionVoiceAudio = document.getElementById("companion-voice-audio");
const closeCompanionVoice = document.getElementById("close-companion-voice");

let userIncomingOffer = null;
let locationWatchId = null;


/* =========================================================
   BOOT
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    await transport.init();

    streakBurst.addEventListener("animationend", () => {
        streakBurst.hidden = true;
        streakMask.classList.add("reveal");
    }, { once: true });

    setupVoiceNote();
    setupCall();
    setupMiscButtons();
    setupIncomingFromCompanion();
    startLocationSharing();
});


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, duration = 2600) {
    clearTimeout(toastTimer);

    toast.textContent = message;
    toast.hidden = false;

    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, duration);
}


/* =========================================================
   HOLD TO RECORD VOICE NOTE
   ========================================================= */

let micStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let pointerIsDown = false;

function supportedMimeType() {
    const choices = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus"
    ];

    if (!window.MediaRecorder) {
        return "";
    }

    return choices.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function setupVoiceNote() {
    voiceButton.addEventListener("contextmenu", event => event.preventDefault());

    voiceButton.addEventListener("pointerdown", async event => {
        event.preventDefault();
        pointerIsDown = true;

        try {
            await beginRecording();

            if (!pointerIsDown) {
                cancelRecording();
            }
        } catch (error) {
            console.error(error);
            showToast("Mikrofon tidak dapat digunakan. Periksa izin browser.");
        }
    });

    window.addEventListener("pointerup", async () => {
        if (!pointerIsDown) return;

        pointerIsDown = false;
        await finishRecording();
    });

    window.addEventListener("pointercancel", () => {
        pointerIsDown = false;
        cancelRecording();
    });
}

async function beginRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error("MediaRecorder tidak didukung browser.");
    }

    micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        },
        video: false
    });

    const mimeType = supportedMimeType();

    mediaRecorder = new MediaRecorder(
        micStream,
        mimeType ? { mimeType } : undefined
    );

    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size > 0) {
            audioChunks.push(event.data);
        }
    });

    mediaRecorder.start(250);

    recordingStartedAt = Date.now();

    voiceButton.classList.add("recording");
    recordingPill.hidden = false;

    updateRecordingTimer();

    recordingTimer = setInterval(updateRecordingTimer, 250);
}

function updateRecordingTimer() {
    const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");

    recordingTime.textContent = `Merekam ${mm}:${ss}`;
}

async function finishRecording() {
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
        cleanupRecordingUi();
        return;
    }

    const durationMs = Date.now() - recordingStartedAt;

    if (durationMs < 450) {
        cancelRecording();
        showToast("Tahan tombol sedikit lebih lama untuk merekam.");
        return;
    }

    const recorder = mediaRecorder;

    const finished = new Promise(resolve => {
        recorder.addEventListener("stop", resolve, { once: true });
    });

    recorder.stop();
    await finished;

    const mimeType = recorder.mimeType || "audio/webm";
    const blob = new Blob(audioChunks, { type: mimeType });

    cleanupRecordingUi();

    try {
        await transport.sendVoiceNote(blob, durationMs);

        if (transport.getMode() === "supabase") {
            showToast("Voice note berhasil dikirim ke pendamping.");
        } else {
            showToast("Voice note dikirim dalam mode demo. Buka Dashboard Pendamping pada tab lain.");
        }
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

    cleanupRecordingUi();
}

function cleanupRecordingUi() {
    clearInterval(recordingTimer);
    recordingTimer = null;

    voiceButton.classList.remove("recording");
    recordingPill.hidden = true;

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
    }

    micStream = null;
    mediaRecorder = null;
    audioChunks = [];
}


/* =========================================================
   WEBRTC OUTGOING AUDIO CALL
   ========================================================= */

let peerConnection = null;
let callMicStream = null;
let activeCallId = null;
let pendingIce = [];

function setupCall() {
    callButton.addEventListener("click", startOutgoingCall);
    hangupButton.addEventListener("click", () => hangup(true));

    transport.onSignal(async signal => {
        if (!signal || !activeCallId || signal.callId !== activeCallId) {
            return;
        }

        try {
            if (signal.type === "answer") {
                await peerConnection.setRemoteDescription(signal.description);
                callStatus.textContent = "Terhubung";
                await flushPendingIce();
            }

            if (signal.type === "ice" && signal.candidate) {
                if (peerConnection?.remoteDescription) {
                    await peerConnection.addIceCandidate(signal.candidate);
                } else {
                    pendingIce.push(signal.candidate);
                }
            }

            if (signal.type === "decline") {
                showToast("Panggilan ditolak pendamping.");
                hangup(false);
            }

            if (signal.type === "hangup") {
                showToast("Panggilan berakhir.");
                hangup(false);
            }
        } catch (error) {
            console.error("Call signal error:", error);
        }
    });
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
            senderRole: "user",
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
            showToast("Mode demo: buka Dashboard Pendamping di tab lain untuk menerima panggilan.", 3500);
        }

    } catch (error) {
        console.error(error);
        showToast("Panggilan tidak dapat dimulai. Periksa izin mikrofon.");
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
                senderRole: "user",
                candidate: event.candidate.toJSON()
            }).catch(() => showToast('Koneksi panggilan terputus.'));
        }
    });

    pc.addEventListener("track", event => {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => {});
    });

    pc.addEventListener("connectionstatechange", () => {
        if (!peerConnection) return;

        const state = peerConnection.connectionState;

        if (state === "connected") {
            callStatus.textContent = "Terhubung";
        }

        if (["failed", "disconnected", "closed"].includes(state)) {
            if (activeCallId) {
                showToast("Koneksi panggilan terputus.");
                hangup(false);
            }
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

function hangup(notifyOtherSide) {
    const callId = activeCallId;

    if (notifyOtherSide && callId) {
        transport.sendSignal({
            type: "hangup",
            callId
        }).catch(() => {});
    }

    if (peerConnection) {
        peerConnection.close();
    }

    if (callMicStream) {
        callMicStream.getTracks().forEach(track => track.stop());
    }

    peerConnection = null;
    callMicStream = null;
    activeCallId = null;
    pendingIce = [];

    remoteAudio.srcObject = null;
    callModal.hidden = true;
    callStatus.textContent = "Memanggil...";
}


/* =========================================================
   PLACEHOLDERS
   ========================================================= */

function setupMiscButtons() {
    sosButton.addEventListener("click", () => {
        showToast("Tombol darurat siap dihubungkan ke alur SOS berikutnya.");
    });


}

window.addEventListener("pagehide", () => {
    cleanupRecordingUi();
    hangup(false);
});


/* =========================================================
   LIVE LOCATION USER -> MONITORING PENDAMPING
   ========================================================= */

function startLocationSharing() {
    if (!navigator.geolocation) {
        return;
    }

    locationWatchId = navigator.geolocation.watchPosition(
        position => {
            transport.sendLocation({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                speed: position.coords.speed,
                heading: position.coords.heading,
                timestamp: position.timestamp,
                source: "user"
            }).catch(console.error);
        },
        error => {
            console.warn("Location sharing:", error);
            if (error.code === error.PERMISSION_DENIED) {
                showToast("Aktifkan izin lokasi agar pendamping dapat melakukan live tracking.", 3600);
            }
        },
        {
            enableHighAccuracy: true,
            maximumAge: 2500,
            timeout: 12000
        }
    );
}


/* =========================================================
   PENDAMPING -> USER: INCOMING CALL & VOICE NOTE
   ========================================================= */

function setupIncomingFromCompanion() {
    userAcceptCall?.addEventListener("click", acceptCallFromCompanion);
    userDeclineCall?.addEventListener("click", declineCallFromCompanion);

    closeCompanionVoice?.addEventListener("click", () => {
        incomingCompanionVoice.hidden = true;
        companionVoiceAudio.pause();
        companionVoiceAudio.removeAttribute("src");
    });

    transport.onVoiceNote(note => {
        if (!note || note.senderRole !== "companion") {
            return;
        }

        const url =
            note.audioUrl ||
            (note.blob ? URL.createObjectURL(note.blob) : null);

        if (!url) return;

        companionVoiceAudio.src = url;
        incomingCompanionVoice.hidden = false;

        showToast("Voice note baru dari pendamping.");
    });

    transport.onSignal(async signal => {
        if (!signal) return;

        if (signal.type === "offer" && signal.senderRole === "companion") {
            if (activeCallId) {
                await transport.sendSignal({
                    type: "decline",
                    callId: signal.callId,
                    senderRole: "user"
                });
                return;
            }

            userIncomingOffer = signal;
            activeCallId = signal.callId;
            pendingIce = [];

            incomingUserCall.hidden = false;
        }
    });
}

async function acceptCallFromCompanion() {
    if (!userIncomingOffer || !activeCallId) return;

    try {
        callMicStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            },
            video: false
        });

        peerConnection = createPeerConnection(activeCallId);

        callMicStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, callMicStream);
        });

        await peerConnection.setRemoteDescription(
            userIncomingOffer.description
        );

        await flushPendingIce();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        await transport.sendSignal({
            type: "answer",
            callId: activeCallId,
            senderRole: "user",
            description: peerConnection.localDescription
        });

        incomingUserCall.hidden = true;
        callModal.hidden = false;
        callStatus.textContent = "Terhubung";

    } catch (error) {
        console.error(error);
        showToast("Tidak dapat menerima panggilan pendamping.");
        hangup(false);
    }
}

async function declineCallFromCompanion() {
    if (activeCallId) {
        await transport.sendSignal({
            type: "decline",
            callId: activeCallId,
            senderRole: "user"
        });
    }

    incomingUserCall.hidden = true;
    userIncomingOffer = null;
    activeCallId = null;
}

/* override pagehide tambahan */
window.addEventListener("pagehide", () => {
    if (locationWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
});
