(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const buttons = [$('start-route'), $('destination-route')];
    const labels = [document.querySelector('.start-location-text'), document.querySelector('.destination-text')];
    const dialog = $('location-dialog');
    const status = $('route-status');
    const speechStatus = $('speech-status');
    const line = $('route-line');
    const geometry = $('route-geometry');
    const marker = $('bike-marker');
    const summary = document.querySelector('.route-summary');
    const names = {undip:'Universitas Diponegoro', bulusan:'Bulusan'};
    let locations = ['', ''];
    let slot = 0;
    let recognition = null;
    let recognitionTimer = null;
    let frame = null;
    let restoreFocus = null;
    const storageKey = 'sencyeRouteSelection';

    function stopListening() {
      clearTimeout(recognitionTimer);
      const previous = recognition;
      recognition = null;
      if (previous) { try { previous.abort(); } catch (_) {} }
      buttons.forEach(button => button.classList.remove('listening'));
    }
    function closeDialog() {
      stopListening();
      dialog.hidden = true;
      restoreFocus?.focus();
    }
    function save() { try { localStorage.setItem(storageKey, JSON.stringify(locations)); } catch (_) {} }
    function refresh(animate = true) {
      cancelAnimationFrame(frame);
      labels.forEach((label, i) => { label.textContent = names[locations[i]] || (i ? 'Pilih tujuan' : 'Pilih lokasi awal'); });
      geometry.setAttribute('visibility','hidden');
      summary.hidden = true;
      save();
      if (!locations.every(Boolean)) {
        status.textContent = 'Tentukan titik awal dan tujuan.';
        return;
      }
      if (locations[0] === locations[1]) {
        status.textContent = 'Titik awal dan tujuan harus berbeda.';
        return;
      }
      const length = line.getTotalLength();
      const reverse = locations[0] === 'bulusan';
      geometry.setAttribute('visibility','visible');
      line.style.strokeDasharray = String(length);
      const setFrame = progress => {
        line.style.strokeDashoffset = String((reverse ? -1 : 1) * length * (1 - progress));
        const point = line.getPointAtLength(length * (reverse ? 1-progress : progress));
        marker.setAttribute('transform',`translate(${point.x} ${point.y})`);
      };
      const finish = () => {
        status.textContent = `${names[locations[0]]} → ${names[locations[1]]}`;
        summary.hidden = false;
      };
      if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setFrame(1); finish(); return;
      }
      setFrame(0);
      status.textContent = 'Menyiapkan rute…';
      let started;
      function draw(now) {
        if (started === undefined) started = now;
        const progress = Math.min(1, (now - started) / 3600);
        setFrame(progress);
        if (progress < 1) frame = requestAnimationFrame(draw);
        else finish();
      }
      frame = requestAnimationFrame(draw);
    }
    function selectLocation(value) {
      if (!names[value]) return;
      locations[slot] = value;
      closeDialog();
      refresh();
    }
    function applyTranscript(raw) {
      const text = raw.toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim();
      const undip = text.search(/\bundip\b|\bun dip\b|universitas diponegoro/);
      const bulusan = text.search(/\bbulusan\b|\bbulu san\b/);
      if (undip !== -1 && bulusan !== -1) {
        locations = undip < bulusan ? ['undip','bulusan'] : ['bulusan','undip'];
        closeDialog(); refresh(); return true;
      }
      if (undip !== -1 || bulusan !== -1) {
        selectLocation(undip !== -1 ? 'undip' : 'bulusan'); return true;
      }
      return false;
    }
    function listen() {
      stopListening();
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!window.isSecureContext) {
        speechStatus.textContent = 'Buka melalui HTTPS untuk menggunakan mic, atau pilih lokasi di bawah.'; return;
      }
      if (!SpeechRecognition) {
        speechStatus.textContent = 'Pengenalan suara belum tersedia di browser ini. Pilih lokasi di bawah.'; return;
      }
      const current = new SpeechRecognition();
      recognition = current;
      current.lang = 'id-ID';
      current.interimResults = false;
      current.continuous = false;
      current.maxAlternatives = 3;
      current.onstart = () => {
        if (recognition !== current) return;
        buttons[slot].classList.add('listening');
        speechStatus.textContent = 'Mendengarkan… Ucapkan UNDIP atau Bulusan.';
      };
      current.onresult = event => {
        if (recognition !== current) return;
        const alternatives = event.results[event.resultIndex || 0];
        let matched = false;
        for (let i=0; i<alternatives.length; i++) {
          if (applyTranscript(alternatives[i].transcript)) { matched = true; break; }
        }
        if (!matched) {
          stopListening();
          speechStatus.textContent = 'Lokasi belum dikenali. Ucapkan UNDIP atau Bulusan, atau pilih di bawah.';
        }
      };
      current.onerror = event => {
        if (recognition !== current) return;
        stopListening();
        const messages = {
          'not-allowed':'Izin mic ditolak. Aktifkan izin mikrofon pada pengaturan situs.',
          'service-not-allowed':'Layanan pengenalan suara tidak diizinkan di browser ini.',
          'audio-capture':'Mikrofon tidak tersedia atau sedang dipakai.',
          network:'Koneksi pengenalan suara bermasalah. Periksa internet atau pilih lokasi.',
          'no-speech':'Belum terdengar suara. Coba lagi atau pilih lokasi.',
          'language-not-supported':'Bahasa Indonesia belum didukung layanan suara ini.'
        };
        speechStatus.textContent = messages[event.error] || 'Ucapan belum terbaca. Coba lagi atau pilih lokasi.';
      };
      current.onend = () => {
        if (recognition !== current) return;
        stopListening();
        speechStatus.textContent = 'Perekaman selesai. Coba lagi atau pilih lokasi.';
      };
      speechStatus.textContent = 'Izinkan mikrofon bila diminta…';
      try {
        // Start synchronously inside the tap event; avoid losing the user gesture on mobile.
        current.start();
        recognitionTimer = setTimeout(() => {
          if (recognition !== current) return;
          stopListening();
          speechStatus.textContent = 'Belum ada hasil suara. Coba lagi atau pilih lokasi.';
        }, 15000);
      } catch (_) {
        stopListening();
        speechStatus.textContent = 'Mic belum dapat dimulai. Coba lagi atau pilih lokasi.';
      }
    }
    function openDialog(index, useSpeech) {
      slot = index;
      restoreFocus = document.activeElement;
      $('location-title').textContent = index ? 'Titik Tujuan' : 'Titik Awal';
      dialog.hidden = false;
      speechStatus.textContent = 'Pilih tempat atau gunakan mikrofon.';
      $('retry-speech').focus();
      if (useSpeech) listen();
    }
    buttons.forEach((button,index) => button.addEventListener('click', () => openDialog(index,true)));
    $('edit-route').addEventListener('click', () => openDialog(locations[0] ? 1 : 0,false));
    document.querySelectorAll('[data-location]').forEach(button => button.addEventListener('click', () => selectLocation(button.dataset.location)));
    $('retry-speech').addEventListener('click',listen);
    $('close-location').addEventListener('click',closeDialog);
    $('replay-route').addEventListener('click',() => refresh());
    dialog.addEventListener('keydown',event => {
      if (event.key === 'Escape') closeDialog();
      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('button')];
        const index = focusable.indexOf(document.activeElement);
        if ((!event.shiftKey && index === focusable.length-1) || (event.shiftKey && index === 0)) {
          event.preventDefault(); focusable[event.shiftKey ? focusable.length-1 : 0].focus();
        }
      }
    });
    window.addEventListener('pagehide', () => { stopListening(); cancelAnimationFrame(frame); });
    document.addEventListener('visibilitychange', () => { if(document.hidden) stopListening(); });
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if(Array.isArray(saved) && saved.length === 2 && saved.every(value => !value || names[value])) locations = saved;
    } catch (_) {}
    refresh(false);
  });
})();
