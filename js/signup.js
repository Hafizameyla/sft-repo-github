
document.addEventListener("DOMContentLoaded", function () {

    const eye = document.getElementById("eye-toggle");
    const codeInput = document.querySelector(".input-code input");

    if (!eye || !codeInput) {
        console.log("Eye element tidak ditemukan");
        return;
    }

    // kondisi awal wajib tertutup
    codeInput.setAttribute("type", "password");

    eye.onclick = function () {
        const hidden = codeInput.type === "password";

        codeInput.type = hidden ? "text" : "password";

        eye.classList.toggle("show", hidden);
    };

});
