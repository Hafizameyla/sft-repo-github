const transport = window.SenCyeTransport;
const config = window.SENCYE_CONFIG || {};

const pairId = document.getElementById("pair-id");
const pairInput = document.getElementById("pair-input");
const pairSave = document.getElementById("pair-save");
const qrContainer = document.getElementById("pair-qr");
const transportMode = document.getElementById("transport-mode");

const voiceList = document.getElementById("voice-list");
const voiceCount = document.getElementById("voice-count");

const incomingCall = document.getElementById("incoming-call");
const acceptCall = document.getElementById("accept-call");
const declineCall = document.getElementById("decline-call");
const callState = document.getElementById("call-state");
const remoteAudio = document.getElementById("remote-audio");

const toast = document.getElementById("companion-toast");

let currentId =
    localStorage.getItem("sencyeCompanionId") ||
    config.DEMO_COMPANION_ID ||
    "SENCYE-DEMO-001";

let voiceTotal = 0;

let peerConnection = null;
let micStream = null;
let incomingOffer = null;
let activeCallId = null;
let pendingIce = [];
let toastTimer = null;

document.addEventListener("DOMContentLoaded", boot);

async function boot() {
    pairInput.value = currentId;
    pairId.textContent = currentId;
    renderQr(currentId);

    await transport.init(currentId);

    transportMode.textContent =
        transport.getMode() === 'supabase'
            ? 'Terhubung ke pendamping'
            : transport.getMode() === 'offline' ? 'Koneksi gagal. Periksa internet dan muat ulang.' : 'Koneksi antar-HP belum diaktifkan' ;

    transport.onVoiceNote(addVoiceNote);
    transport.onSignal(handleSignal);

    pairSave.addEventListener("click", changePairingId);
    acceptCall.addEventListener("click", acceptIncomingCall);
    declineCall.addEventListener("click", declineIncomingCall);
    document.getElementById('companion-hangup').addEventListener('click',() => closeCall(true));

    try {
        const existing = await transport.loadVoiceNotes(20);
        existing.reverse().forEach(addVoiceNote);
    } catch (error) {
        console.error(error);
    }
}

function renderQr(value) {
    qrContainer.innerHTML = "";

    if (!window.QRCode) {
        qrContainer.textContent = value;
        return;
    }

    new QRCode(qrContainer, {
        text: value,
        width: 132,
        height: 132,
        correctLevel: QRCode.CorrectLevel.M
    });
}

async function changePairingId() {
    const value = pairInput.value.trim();

    if (!/^[A-Za-z0-9_-]{3,64}$/.test(value)) {
        showToast("Gunakan kode 3–64 karakter: huruf, angka, tanda hubung atau garis bawah.");
        return;
    }

    currentId = value;

    localStorage.setItem("sencyeCompanionId", currentId);
    sessionStorage.removeItem("sencyeQrData");

    pairId.textContent = currentId;
    renderQr(currentId);

    await transport.init(currentId);

    transportMode.textContent =
        transport.getMode() === 'supabase'
            ? 'Terhubung ke pendamping'
            : transport.getMode() === 'offline' ? 'Koneksi gagal. Periksa internet dan muat ulang.' : 'Koneksi antar-HP belum diaktifkan' ;

    showToast("Pairing ID diperbarui.");
}

function addVoiceNote(note) {
    if (!note) return;

    const empty = voiceList.querySelector(".empty-state");
    if (empty) empty.remove();

    const audioUrl =
        note.audioUrl ||
        (note.blob ? URL.createObjectURL(note.blob) : null);

    if (!audioUrl) return;

    voiceTotal += 1;
    voiceCount.textContent = `${voiceTotal} pesan`;

    const item = document.createElement("article");
    item.className = "voice-item";

    const duration =
        note.durationMs
            ? `${Math.max(1, Math.round(note.durationMs / 1000))} dtk`
            : "voice note";

    const time =
        new Date(note.createdAt || Date.now())
            .toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit"
            });

    item.innerHTML = `
        <div class="voice-meta">
            <span>Dari pengguna · ${duration}</span>
            <span>${time}</span>
        </div>
        <audio controls preload="metadata" src="${audioUrl}"></audio>
    `;

    voiceList.prepend(item);

    showToast("Voice note baru diterima.");
}


/* =========================================================
   INCOMING WEBRTC CALL
   ========================================================= */

async function handleSignal(signal) {
    if (!signal || signal.senderRole === "companion") return;

    try {
        if (signal.type === "offer") {
            if (activeCallId) {
                await transport.sendSignal({
                    type: "decline",
                    callId: signal.callId
                });
                return;
            }

            incomingOffer = signal;
            activeCallId = signal.callId;
            pendingIce = [];

            incomingCall.hidden = false;
            callState.textContent = "Panggilan masuk";
        }

        if (signal.type === "ice" && signal.callId === activeCallId && signal.candidate) {
            if (peerConnection?.remoteDescription) {
                await peerConnection.addIceCandidate(signal.candidate);
            } else {
                pendingIce.push(signal.candidate);
            }
        }

        if (signal.type === "hangup" && signal.callId === activeCallId) {
            showToast("Pengguna mengakhiri panggilan.");
            closeCall(false);
        }
    } catch (error) {
        console.error("Signal error:", error);
    }
}

async function acceptIncomingCall() {
    if (!incomingOffer || !activeCallId) return;

    try {
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            },
            video: false
        });

        peerConnection = createPeerConnection(activeCallId);

        micStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, micStream);
        });

        await peerConnection.setRemoteDescription(
            incomingOffer.description
        );

        await flushPendingIce();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        await transport.sendSignal({
            type: "answer",
            callId: activeCallId,
            description: peerConnection.localDescription
        });

        incomingCall.hidden = true;
        document.getElementById('companion-hangup').hidden = false;
        callState.textContent = "Menghubungkan…";

    } catch (error) {
        console.error(error);
        showToast("Tidak dapat menerima panggilan. Periksa izin mikrofon.");
        closeCall(true);
    }
}

async function declineIncomingCall() {
    if (activeCallId) {
        await transport.sendSignal({
            type: "decline",
            callId: activeCallId
        });
    }

    closeCall(false);
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
                candidate: event.candidate.toJSON()
            });
        }
    });

    pc.addEventListener("track", event => {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => {});
    });

    pc.addEventListener("connectionstatechange", () => {
        const state = pc.connectionState;

        if (state === "connected") {
            callState.textContent = "Terhubung";
        }

        if (["failed", "disconnected", "closed"].includes(state) && activeCallId) {
            closeCall(false);
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

function closeCall(notify) {
    const callId = activeCallId;

    if (notify && callId) {
        transport.sendSignal({
            type: "hangup",
            callId
        }).catch(() => {});
    }

    if (peerConnection) peerConnection.close();
    if (micStream) micStream.getTracks().forEach(track => track.stop());

    peerConnection = null;
    micStream = null;
    incomingOffer = null;
    activeCallId = null;
    pendingIce = [];

    incomingCall.hidden = true;
    document.getElementById('companion-hangup').hidden = true;
    remoteAudio.srcObject = null;
    callState.textContent = "Siap menerima";
}

function showToast(message) {
    clearTimeout(toastTimer);

    toast.textContent = message;
    toast.hidden = false;

    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 2400);
}

window.addEventListener("pagehide", () => {
    closeCall(false);
});
