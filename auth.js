(() => {
  "use strict";

  const ADMIN_PASSWORD_HASH = "3b612c75a7b5048a435fb6ec81e52ff92d6d795a8b5a9c17070f6a63c97a53b2";
  const ADMIN_SESSION_KEY = "fll6959_admin_session";

  const authState = {
    isAdmin: sessionStorage.getItem(ADMIN_SESSION_KEY) === "1",
    googleEnabled: false,
    googleLoginHandler: null
  };

  const elements = {
    modal: null,
    form: null,
    passwordInput: null,
    error: null,
    closeBtn: null,
    googleBtn: null,
    hotspot: null,
    openBtn: null
  };

  function init() {
    refreshElements();

    bindEvents();
    syncGoogleButton();

    if (!elements.modal || !elements.form || !elements.passwordInput || !elements.error) {
      console.warn("Auth UI initialized with missing elements.");
      return;
    }

    if (authState.isAdmin) {
      setTimeout(() => {
        dispatchAuthSuccess("session");
      }, 0);
    }
  }

  function bindEvents() {
    if (elements.form) {
      elements.form.addEventListener("submit", handlePasswordSubmit);
    }

    if (elements.closeBtn) {
      elements.closeBtn.addEventListener("click", closeModal);
    }

    if (elements.hotspot) {
      elements.hotspot.addEventListener("click", openModal);
    }

    if (elements.openBtn) {
      elements.openBtn.addEventListener("click", openModal);
    }

    if (elements.googleBtn) {
      elements.googleBtn.addEventListener("click", handleGoogleLogin);
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        openModal();
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        logout();
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target === elements.modal) {
        closeModal();
      }
    });

    window.addEventListener("admin:external-login-success", (event) => {
      const method = event && event.detail && event.detail.method ? event.detail.method : "google";
      completeExternalLogin(method);
    });

    const logoutButton = document.getElementById("btnLogout");
    if (logoutButton) {
      logoutButton.addEventListener("click", logout);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();

    const password = elements.passwordInput.value || "";
    hideError();

    if (!password.trim()) {
      showError("Enter a password.");
      return;
    }

    try {
      const hash = await sha256Hex(password);
      if (hash === ADMIN_PASSWORD_HASH) {
        markAdmin("password");
        closeModal();
        elements.passwordInput.value = "";
        return;
      }
      showError("Incorrect password.");
    } catch (error) {
      showError("Password check failed.");
    }
  }

  async function handleGoogleLogin() {
    hideError();

    if (!authState.googleEnabled || typeof authState.googleLoginHandler !== "function") {
      showError("Google login is unavailable.");
      return;
    }

    try {
      await authState.googleLoginHandler();
      markAdmin("google");
      closeModal();
    } catch (error) {
      const message = error && error.message ? error.message : "Google login failed.";
      showError(message);
    }
  }

  function markAdmin(method) {
    authState.isAdmin = true;
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    dispatchAuthSuccess(method);
  }

  function dispatchAuthSuccess(method) {
    window.dispatchEvent(
      new CustomEvent("admin:auth-success", {
        detail: { method }
      })
    );
  }

  function completeExternalLogin(method = "google") {
    markAdmin(method);
    closeModal();
    hideError();
  }

  function logout() {
    authState.isAdmin = false;
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.dispatchEvent(new CustomEvent("admin:auth-logout"));
    closeModal();
  }

  function openModal() {
    refreshElements();

    if (!elements.modal) {
      return;
    }

    hideError();
    elements.modal.classList.remove("hidden");
    requestAnimationFrame(() => {
      elements.passwordInput?.focus();
    });
  }

  function closeModal() {
    refreshElements();

    if (!elements.modal) {
      return;
    }

    elements.modal.classList.add("hidden");
    hideError();
  }

  function showError(message) {
    refreshElements();

    if (!elements.error) {
      return;
    }

    elements.error.textContent = message;
    elements.error.classList.remove("hidden");
  }

  function hideError() {
    refreshElements();

    if (!elements.error) {
      return;
    }

    elements.error.textContent = "";
    elements.error.classList.add("hidden");
  }

  function setGoogleEnabled(enabled) {
    authState.googleEnabled = Boolean(enabled);
    syncGoogleButton();
  }

  function syncGoogleButton() {
    refreshElements();

    if (!elements.googleBtn) {
      return;
    }

    elements.googleBtn.classList.toggle("hidden", !authState.googleEnabled);
  }

  function setGoogleLoginHandler(handler) {
    authState.googleLoginHandler = typeof handler === "function" ? handler : null;
  }

  function refreshElements() {
    elements.modal = elements.modal || document.getElementById("adminLoginModal");
    elements.form = elements.form || document.getElementById("adminLoginForm");
    elements.passwordInput = elements.passwordInput || document.getElementById("adminPassword");
    elements.error = elements.error || document.getElementById("loginError");
    elements.closeBtn = elements.closeBtn || document.getElementById("closeLoginModal");
    elements.googleBtn = elements.googleBtn || document.getElementById("googleLoginBtn");
    elements.hotspot = elements.hotspot || document.getElementById("adminHotspot");
    elements.openBtn = elements.openBtn || document.getElementById("openAdminLoginBtn");
  }

  async function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === "function") {
      const encoded = new TextEncoder().encode(text);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }

    return sha256Fallback(text);
  }

  function sha256Fallback(input) {
    const maxWord = Math.pow(2, 32);
    let ascii = unescape(encodeURIComponent(input));
    const asciiBitLength = ascii.length * 8;
    const words = [];
    let result = "";
    let i;
    let j;

    if (!sha256Fallback.h || !sha256Fallback.k) {
      const hash = [];
      const k = [];
      const isComposite = {};
      let primeCounter = 0;

      for (let candidate = 2; primeCounter < 64; candidate += 1) {
        if (!isComposite[candidate]) {
          for (i = 0; i < 313; i += candidate) {
            isComposite[i] = candidate;
          }
          hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
          k[primeCounter] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
          primeCounter += 1;
        }
      }

      sha256Fallback.h = hash;
      sha256Fallback.k = k;
    }

    const k = sha256Fallback.k;
    let hash = sha256Fallback.h.slice(0);

    ascii += "\x80";
    while ((ascii.length % 64) - 56) {
      ascii += "\x00";
    }

    for (i = 0; i < ascii.length; i += 1) {
      j = ascii.charCodeAt(i);
      if (j >> 8) {
        return "";
      }
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }

    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;

    for (j = 0; j < words.length; ) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash.slice(0);

      for (i = 0; i < 64; i += 1) {
        const w15 = w[i - 15];
        const w2 = w[i - 2];

        const a = hash[0];
        const e = hash[4];
        const temp1 =
          hash[7] +
          (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10))) |
                0);

        const temp2 =
          (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

        hash = [((temp1 + temp2) | 0), hash[0], hash[1], hash[2], ((hash[3] + temp1) | 0), hash[4], hash[5], hash[6]];
      }

      for (i = 0; i < 8; i += 1) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }

    for (i = 0; i < 8; i += 1) {
      for (j = 3; j + 1; j -= 1) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }

    return result;
  }

  window.AuthModule = {
    init,
    openModal,
    closeModal,
    isAdmin: () => authState.isAdmin,
    logout,
    completeExternalLogin,
    setGoogleEnabled,
    setGoogleLoginHandler,
    sha256Hex
  };

  document.addEventListener("DOMContentLoaded", init);
})();
