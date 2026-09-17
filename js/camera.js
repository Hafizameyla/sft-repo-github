const camera = document.getElementById("camera");
const canvas = document.getElementById("qr-canvas");
const statusText = document.getElementById("camera-status");
const cameraFrame = document.querySelector(".camera-frame");

const context = canvas.getContext("2d", {
    willReadFrequently: true
});

let activeStream = null;
let scanAnimationId = null;
let lastScanTime = 0;
let scanFinished = false;

const SCAN_INTERVAL = 120;


/* =========================================================
   CAMERA
   ========================================================= */

async function startCamera() {

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        showError(
            "Browser tidak mendukung akses kamera."
        );

        return;
    }


    try {

        /*
         * environment = prioritaskan kamera belakang.
         * ideal digunakan agar tetap punya fallback bila
         * perangkat hanya menyediakan satu kamera.
         */
        const stream =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    facingMode: {
                        ideal: "environment"
                    },

                    width: {
                        ideal: 1280
                    },

                    height: {
                        ideal: 720
                    }
                },

                audio: false
            });


        activeStream = stream;

        camera.srcObject = stream;


        await new Promise((resolve) => {

            if (camera.readyState >= 2) {
                resolve();
                return;
            }

            camera.addEventListener(
                "loadedmetadata",
                resolve,
                {
                    once: true
                }
            );

        });


        await camera.play();


        statusText.classList.remove(
            "error",
            "success"
        );

        statusText.textContent =
            "Arahkan QR Code ke dalam frame";


        startScanning();


    } catch (error) {

        console.error(
            "Camera error:",
            error
        );


        if (error.name === "NotAllowedError") {

            showError(
                "Izin kamera ditolak. Aktifkan izin kamera di browser."
            );

        } else if (error.name === "NotFoundError") {

            showError(
                "Kamera tidak ditemukan."
            );

        } else if (error.name === "NotReadableError") {

            showError(
                "Kamera sedang digunakan aplikasi lain."
            );

        } else {

            showError(
                "Kamera tidak dapat dibuka."
            );

        }

    }

}


/* =========================================================
   REAL-TIME SCANNER
   ========================================================= */

function startScanning() {

    if (scanFinished) {
        return;
    }


    scanAnimationId =
        requestAnimationFrame(
            scanFrame
        );

}


async function scanFrame(timestamp) {

    if (scanFinished) {
        return;
    }


    scanAnimationId =
        requestAnimationFrame(
            scanFrame
        );


    if (
        timestamp - lastScanTime <
        SCAN_INTERVAL
    ) {
        return;
    }


    lastScanTime = timestamp;


    if (
        camera.readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
        return;
    }


    const width =
        camera.videoWidth;

    const height =
        camera.videoHeight;


    if (
        width === 0 ||
        height === 0
    ) {
        return;
    }


    /*
     * Coba native BarcodeDetector lebih dulu.
     * Jika browser tidak mendukung, otomatis fallback ke jsQR.
     */
    const nativeResult =
        await scanWithBarcodeDetector();


    if (nativeResult) {

        handleQrResult(
            nativeResult
        );

        return;
    }


    const jsQrResult =
        scanWithJsQr();


    if (jsQrResult) {

        handleQrResult(
            jsQrResult
        );

    }

}


/* =========================================================
   NATIVE BARCODE DETECTOR
   ========================================================= */

async function scanWithBarcodeDetector() {

    if (!("BarcodeDetector" in window)) {
        return null;
    }


    try {

        if (!scanWithBarcodeDetector.detector) {

            scanWithBarcodeDetector.detector =
                new BarcodeDetector({
                    formats: [
                        "qr_code"
                    ]
                });

        }


        const codes =
            await scanWithBarcodeDetector.detector.detect(
                camera
            );


        if (codes.length > 0) {

            return (
                codes[0].rawValue ||
                ""
            ).trim();

        }


    } catch (error) {

        /*
         * Jangan matikan scanner bila implementasi browser
         * BarcodeDetector bermasalah. jsQR tetap menjadi fallback.
         */
        console.debug(
            "BarcodeDetector fallback:",
            error
        );

    }


    return null;

}


/* =========================================================
   jsQR FALLBACK
   ========================================================= */

function scanWithJsQr() {

    if (typeof window.jsQR !== "function") {
        return null;
    }


    const width =
        camera.videoWidth;

    const height =
        camera.videoHeight;


    /*
     * Turunkan resolusi analisis agar scan tetap ringan.
     * Aspect ratio video dipertahankan.
     */
    const targetWidth = 640;

    const scale =
        Math.min(
            1,
            targetWidth / width
        );


    canvas.width =
        Math.round(
            width * scale
        );

    canvas.height =
        Math.round(
            height * scale
        );


    context.drawImage(
        camera,
        0,
        0,
        canvas.width,
        canvas.height
    );


    const imageData =
        context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );


    const code =
        window.jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
            {
                inversionAttempts:
                    "attemptBoth"
            }
        );


    if (
        code &&
        code.data
    ) {

        return code.data.trim();

    }


    return null;

}


/* =========================================================
   QR FOUND
   ========================================================= */

function handleQrResult(data) {

    if (
        scanFinished ||
        !data
    ) {
        return;
    }


    scanFinished = true;


    if (scanAnimationId) {

        cancelAnimationFrame(
            scanAnimationId
        );

    }


    cameraFrame.classList.add(
        "scan-success"
    );


    statusText.classList.remove(
        "error"
    );

    statusText.classList.add(
        "success"
    );

    statusText.textContent =
        "QR berhasil dibaca. Menghubungkan...";


    /*
     * Simpan isi QR agar bisa digunakan homepage/backend nanti.
     * sessionStorage hanya bertahan selama tab browser masih aktif.
     */
    sessionStorage.setItem(
        "sencyeQrData",
        data
    );


    console.log(
        "QR SenCye:",
        data
    );


    stopCamera();


    /*
     * Saat ini setiap QR yang berhasil terbaca dianggap berhasil.
     * Validasi ID SenCye terhadap server/backend bisa ditambahkan
     * sebelum redirect ini.
     */
    setTimeout(
        () => {

            window.location.href =
                "homepage.html";

        },
        900
    );

}


/* =========================================================
   HELPERS
   ========================================================= */

function showError(message) {

    statusText.classList.remove(
        "success"
    );

    statusText.classList.add(
        "error"
    );

    statusText.textContent =
        message;

}


function stopCamera() {

    if (scanAnimationId) {

        cancelAnimationFrame(
            scanAnimationId
        );

        scanAnimationId = null;

    }


    if (!activeStream) {
        return;
    }


    activeStream
        .getTracks()
        .forEach(
            track => track.stop()
        );


    activeStream = null;

}


/* =========================================================
   PAGE EVENTS
   ========================================================= */

window.addEventListener(
    "DOMContentLoaded",
    startCamera
);


window.addEventListener(
    "pagehide",
    stopCamera
);


window.addEventListener(
    "beforeunload",
    stopCamera
);
