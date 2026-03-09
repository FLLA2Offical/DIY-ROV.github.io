(() => {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyD7OGk__Ig7Hd287B4EsTKFPivDKyAwu24",
    authDomain: "fll6959-site-builder.firebaseapp.com",
    projectId: "fll6959-site-builder",
    storageBucket: "fll6959-site-builder.firebasestorage.app",
    messagingSenderId: "111919999070",
    appId: "1:111919999070:web:6b0cdbf2ea2f9ef0736ccf"
  };

  const STORAGE_KEY = "fll6959_site_builder_state_v1";
  const CLOUD_COLLECTION = "fll6959SiteBuilder";
  const CLOUD_PUBLIC_DOC_ID = "published";
  const SAVE_DEBOUNCE_MS = 450;
  const SAVE_OP_TIMEOUT_MS = 15000;
  const AUTO_SAVE_ENABLED = false;
  const AUTO_SAVE_DELAY_MS = 9000;
  const DEFAULT_CANVAS_HEIGHT = 920;
  const DEFAULT_SITE_NAME = "Team 69309 Collegiate Dutchmen";
  const ADMIN_EMAIL_HASH_ALLOWLIST = [
    "51e4a7b04c774ff36a20cb3e9b0b113d42eb7ca952a017011a897eec2b19b8c6",
    "61729876c1a924caca603a08887dc053b529b5b2cf94c0ce286a987b0141181c",
    "bbb28ffe5e460c2d60e355cd06408a8ec20eee033b601de4abbd24d7c339772b"
  ];

  const DEFAULT_THEME = {
    primary: "#12b9c9",
    background: "#eff6ff",
    text: "#0f172a",
    button: "#0ea5e9"
  };

  const state = {
    pages: [],
    currentPageId: "",
    theme: { ...DEFAULT_THEME },
    siteName: DEFAULT_SITE_NAME,
    browserTitle: DEFAULT_SITE_NAME,
    adminMode: false,
    selectedSectionId: null
  };

  const firebaseState = {
    enabled: false,
    auth: null,
    db: null,
    storage: null,
    user: null
  };

  const elements = {};

  let dragPayload = null;
  let saveTimer = null;
  let fadeObserver = null;
  let authLogoutBridgeBound = false;
  let pendingCloudImageUploads = 0;
  let lastUnauthorizedAdminEmail = "";
  let hasUnsavedChanges = false;
  let pointerEdit = null;
  let cloudRetryTimer = null;

  const imageUploadContext = {
    mode: "image",
    sectionId: null,
    blockId: null
  };

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindEvents();
    loadInitialState();
    applyTheme(state.theme);
    applySiteBranding();
    render();

    initFirebaseSupport();

    if (window.AuthModule && window.AuthModule.isAdmin()) {
      enableAdminMode();
    }
  });

  function cacheElements() {
    elements.siteContent = document.getElementById("siteContent");
    elements.pageTabs = document.getElementById("pageTabs");
    elements.adminBadge = document.getElementById("adminStateBadge");
    elements.adminToolbar = document.getElementById("adminToolbar");
    elements.pageSelect = document.getElementById("pageSelect");
    elements.siteHeading = document.getElementById("siteHeading");

    elements.btnAddSection = document.getElementById("btnAddSection");
    elements.btnAddTitle = document.getElementById("btnAddTitle");
    elements.btnAddText = document.getElementById("btnAddText");
    elements.btnAddImage = document.getElementById("btnAddImage");
    elements.btnAddGallery = document.getElementById("btnAddGallery");
    elements.btnAddButton = document.getElementById("btnAddButton");
    elements.btnChangeColors = document.getElementById("btnChangeColors");
    elements.btnAddPage = document.getElementById("btnAddPage");
    elements.btnDeleteSection = document.getElementById("btnDeleteSection");
    elements.btnEditSiteName = document.getElementById("btnEditSiteName");
    elements.btnEditBanner = document.getElementById("btnEditBanner");
    elements.btnChangeBannerImage = document.getElementById("btnChangeBannerImage");
    elements.btnSave = document.getElementById("btnSave");
    elements.btnRenamePage = document.getElementById("btnRenamePage");
    elements.btnDeletePage = document.getElementById("btnDeletePage");
    elements.saveStatus = document.getElementById("saveStatus");

    elements.colorPanel = document.getElementById("colorPanel");
    elements.closeColorPanel = document.getElementById("closeColorPanel");
    elements.closeColorPanelBtn = document.getElementById("closeColorPanelBtn");
    elements.primaryColorInput = document.getElementById("primaryColorInput");
    elements.backgroundColorInput = document.getElementById("backgroundColorInput");
    elements.textColorInput = document.getElementById("textColorInput");
    elements.buttonColorInput = document.getElementById("buttonColorInput");

    elements.imageUploadModal = document.getElementById("imageUploadModal");
    elements.imageDropzone = document.getElementById("imageDropzone");
    elements.imageInput = document.getElementById("imageInput");
    elements.imageModalTitle = document.getElementById("imageModalTitle");
    elements.imageUploadHint = document.getElementById("imageUploadHint");
    elements.closeImageUploadModal = document.getElementById("closeImageUploadModal");
    elements.chooseImagesBtn = document.getElementById("chooseImagesBtn");

    elements.toastContainer = document.getElementById("toastContainer");
  }

  function bindEvents() {
    window.addEventListener("admin:auth-success", () => {
      enableAdminMode();
    });

    window.addEventListener("admin:auth-logout", () => {
      disableAdminMode();
    });

    if (elements.siteContent) {
      elements.siteContent.addEventListener("click", handleSiteClick);
      elements.siteContent.addEventListener("dblclick", handleSiteDoubleClick);
      elements.siteContent.addEventListener("input", handleEditableInput);
      elements.siteContent.addEventListener("mousedown", handlePointerEditStart);
      elements.siteContent.addEventListener("dragstart", handleDragStart);
      elements.siteContent.addEventListener("dragover", handleDragOver);
      elements.siteContent.addEventListener("drop", handleDrop);
      elements.siteContent.addEventListener("dragend", clearDragState);
    }

    window.addEventListener("mousemove", handlePointerEditMove);
    window.addEventListener("mouseup", handlePointerEditEnd);

    if (elements.pageTabs) {
      elements.pageTabs.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-page-id]");
        if (!tab) {
          return;
        }

        switchPage(tab.dataset.pageId);
      });
    }

    if (elements.pageSelect) {
      elements.pageSelect.addEventListener("change", (event) => {
        switchPage(event.target.value);
      });
    }

    bindToolbarActions();
    bindColorPanelEvents();
    bindImageModalEvents();
  }

  function bindToolbarActions() {
    bindIfPresent(elements.btnAddSection, "click", addSection);
    bindIfPresent(elements.btnAddTitle, "click", addTitleBlock);
    bindIfPresent(elements.btnAddText, "click", addTextBlock);
    bindIfPresent(elements.btnAddImage, "click", () => openImageModal("image"));
    bindIfPresent(elements.btnAddGallery, "click", () => openImageModal("gallery"));
    bindIfPresent(elements.btnAddButton, "click", addButtonBlock);
    bindIfPresent(elements.btnChangeColors, "click", openColorPanel);
    bindIfPresent(elements.btnAddPage, "click", addPage);
    bindIfPresent(elements.btnDeleteSection, "click", deleteSelectedSection);
    bindIfPresent(elements.btnEditSiteName, "click", editSiteName);
    bindIfPresent(elements.btnEditBanner, "click", editBannerTitle);
    bindIfPresent(elements.btnChangeBannerImage, "click", changeBannerImage);
    bindIfPresent(elements.btnSave, "click", () => persistState({ manual: true }));
    bindIfPresent(elements.btnRenamePage, "click", renameCurrentPage);
    bindIfPresent(elements.btnDeletePage, "click", deleteCurrentPage);
  }

  function bindColorPanelEvents() {
    bindIfPresent(elements.closeColorPanel, "click", closeColorPanel);
    bindIfPresent(elements.closeColorPanelBtn, "click", closeColorPanel);

    [
      [elements.primaryColorInput, "primary"],
      [elements.backgroundColorInput, "background"],
      [elements.textColorInput, "text"],
      [elements.buttonColorInput, "button"]
    ].forEach(([input, key]) => {
      if (!input) {
        return;
      }

      input.addEventListener("input", (event) => {
        state.theme[key] = event.target.value;
        applyTheme(state.theme);
        queueSave();
      });
    });

    if (elements.colorPanel) {
      elements.colorPanel.addEventListener("click", (event) => {
        if (event.target === elements.colorPanel) {
          closeColorPanel();
        }
      });
    }
  }

  function bindImageModalEvents() {
    bindIfPresent(elements.chooseImagesBtn, "click", () => {
      elements.imageInput?.click();
    });

    bindIfPresent(elements.closeImageUploadModal, "click", closeImageModal);

    if (elements.imageInput) {
      elements.imageInput.addEventListener("change", async (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) {
          return;
        }

        await processImageFiles(files);
        event.target.value = "";
      });
    }

    if (elements.imageDropzone) {
      elements.imageDropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        elements.imageDropzone.classList.add("drag-over");
      });

      elements.imageDropzone.addEventListener("dragleave", () => {
        elements.imageDropzone.classList.remove("drag-over");
      });

      elements.imageDropzone.addEventListener("drop", async (event) => {
        event.preventDefault();
        elements.imageDropzone.classList.remove("drag-over");

        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length) {
          return;
        }

        await processImageFiles(files);
      });
    }

    if (elements.imageUploadModal) {
      elements.imageUploadModal.addEventListener("click", (event) => {
        if (event.target === elements.imageUploadModal) {
          closeImageModal();
        }
      });
    }
  }

  async function initFirebaseSupport() {
    const configured = isFirebaseConfigured();

    if (!configured) {
      configureAuthModuleGoogle(false);
      return;
    }

    if (typeof window.firebase === "undefined") {
      configureAuthModuleGoogle(false);
      showToast("Firebase SDK unavailable. Local storage mode enabled.");
      return;
    }

    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
      }

      firebaseState.auth = window.firebase.auth();
      firebaseState.db = window.firebase.firestore();
      firebaseState.storage = window.firebase.storage();
      firebaseState.enabled = true;

      configureAuthModuleGoogle(true);
      bindAuthLogoutBridge();

      await loadPublishedState();
      await applyGoogleRedirectResult();

      firebaseState.auth.onAuthStateChanged(async (user) => {
        firebaseState.user = user || null;

        if (firebaseState.user) {
          await loadStateFromCloud();
          if (await isAllowedAdminUser(firebaseState.user)) {
            if (window.AuthModule && typeof window.AuthModule.completeExternalLogin === "function") {
              if (!window.AuthModule.isAdmin()) {
                window.AuthModule.completeExternalLogin("google");
              }
            } else {
              window.dispatchEvent(
                new CustomEvent("admin:external-login-success", {
                  detail: { method: "google" }
                })
              );
            }
          } else {
            setVisitorForUnauthorizedGoogle(firebaseState.user);
          }
        }
      });
    } catch (error) {
      console.error("Firebase init failed:", error);
      firebaseState.enabled = false;
      configureAuthModuleGoogle(false);
      showToast("Firebase failed to initialize. Local storage mode enabled.");
    }
  }

  function configureAuthModuleGoogle(enabled) {
    if (!window.AuthModule) {
      return;
    }

    window.AuthModule.setGoogleEnabled(enabled);

    if (enabled) {
      window.AuthModule.setGoogleLoginHandler(handleGoogleLogin);
    } else {
      window.AuthModule.setGoogleLoginHandler(null);
    }
  }

  function bindAuthLogoutBridge() {
    if (authLogoutBridgeBound) {
      return;
    }

    authLogoutBridgeBound = true;
    window.addEventListener("admin:auth-logout-request", async () => {
      if (!firebaseState.auth || !firebaseState.auth.currentUser) {
        firebaseState.user = null;
        return;
      }

      try {
        await firebaseState.auth.signOut();
      } catch (error) {
        console.error("Firebase sign-out failed:", error);
      } finally {
        firebaseState.user = null;
      }
    });
  }

  async function handleGoogleLogin() {
    if (!firebaseState.enabled || !firebaseState.auth) {
      throw new Error("Google login requires Firebase config.");
    }

    const provider = new window.firebase.auth.GoogleAuthProvider();

    try {
      const result = await firebaseState.auth.signInWithPopup(provider);
      if (!result || !result.user) {
        throw new Error("Google login failed.");
      }

      firebaseState.user = result.user;
      await loadStateFromCloud();
      if (await isAllowedAdminUser(firebaseState.user)) {
        if (window.AuthModule && typeof window.AuthModule.completeExternalLogin === "function" && !window.AuthModule.isAdmin()) {
          window.AuthModule.completeExternalLogin("google");
        }
      } else {
        setVisitorForUnauthorizedGoogle(firebaseState.user);
        return;
      }
      showToast("Google login connected.");
      return;
    } catch (error) {
      const code = error && error.code ? String(error.code) : "";
      const needsRedirectFallback =
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request";

      if (!needsRedirectFallback) {
        throw new Error(getGoogleLoginErrorMessage(error));
      }
    }

    await firebaseState.auth.signInWithRedirect(provider);
  }

  async function applyGoogleRedirectResult() {
    if (!firebaseState.auth) {
      return;
    }

    try {
      const result = await firebaseState.auth.getRedirectResult();
      if (result && result.user) {
        firebaseState.user = result.user;
        await loadStateFromCloud();
        if (await isAllowedAdminUser(firebaseState.user)) {
          if (window.AuthModule && typeof window.AuthModule.completeExternalLogin === "function") {
            window.AuthModule.completeExternalLogin("google");
          } else {
            window.dispatchEvent(
              new CustomEvent("admin:external-login-success", {
                detail: { method: "google" }
                })
            );
          }
          showToast("Google login connected.");
        } else {
          setVisitorForUnauthorizedGoogle(firebaseState.user);
        }
      }
    } catch (error) {
      console.error("Google redirect login failed:", error);
    }
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  async function isAllowedAdminUser(user) {
    const email = normalizeEmail(user && user.email);
    if (!email) {
      return false;
    }

    const emailHash = await sha256Hex(email);
    if (!emailHash) {
      return false;
    }

    return ADMIN_EMAIL_HASH_ALLOWLIST.includes(emailHash);
  }

  async function sha256Hex(text) {
    if (!text) {
      return "";
    }

    if (window.AuthModule && typeof window.AuthModule.sha256Hex === "function") {
      return String(await window.AuthModule.sha256Hex(text));
    }

    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === "function") {
      const encoded = new TextEncoder().encode(text);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }

    return "";
  }

  function setVisitorForUnauthorizedGoogle(user) {
    const email = normalizeEmail(user && user.email);
    if (window.AuthModule && typeof window.AuthModule.setVisitorMode === "function") {
      window.AuthModule.setVisitorMode();
    }

    disableAdminMode();
    if (state.pages.length > 0) {
      state.currentPageId = state.pages[0].id;
    }
    state.selectedSectionId = null;
    render();

    if (email && email !== lastUnauthorizedAdminEmail) {
      lastUnauthorizedAdminEmail = email;
      showToast("Signed in with Google, but this account is not allowed for admin.");
    }
  }

  function getGoogleLoginErrorMessage(error) {
    const code = error && error.code ? String(error.code) : "";

    if (code === "auth/unauthorized-domain") {
      return "Google login is blocked for this site domain. Add your GitHub Pages domain in Firebase Authentication > Authorized domains.";
    }

    if (code === "auth/popup-blocked") {
      return "Popup was blocked. Allow popups for this site and try again.";
    }

    if (code === "auth/network-request-failed") {
      return "Network issue during Google login. Check your connection and retry.";
    }

    if (code === "auth/operation-not-allowed") {
      return "Google sign-in is not enabled in Firebase Authentication.";
    }

    if (code === "auth/invalid-api-key") {
      return "Firebase API key is invalid for this build.";
    }

    if (error && error.message) {
      return error.message;
    }

    return "Google login failed.";
  }

  async function loadPublishedState() {
    if (!firebaseState.enabled || !firebaseState.db) {
      return;
    }

    try {
      const docRef = firebaseState.db.collection(CLOUD_COLLECTION).doc(CLOUD_PUBLIC_DOC_ID);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return;
      }

      const data = docSnap.data();
      if (!data || !data.state) {
        return;
      }

      const loaded = normalizePersistedState(data.state);
      if (!loaded) {
        return;
      }

      state.pages = loaded.pages;
      state.currentPageId = loaded.currentPageId;
      state.theme = loaded.theme;
      state.siteName = loaded.siteName;
      state.browserTitle = loaded.browserTitle;
      state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pages: state.pages,
          currentPageId: state.currentPageId,
          theme: state.theme,
          siteName: state.siteName,
          browserTitle: state.browserTitle,
          updatedAt: new Date().toISOString()
        })
      );

      applyTheme(state.theme);
      applySiteBranding();
      render();
    } catch (error) {
      console.error("Published load failed:", error);
    }
  }

  async function loadStateFromCloud() {
    if (!firebaseState.enabled || !firebaseState.db || !firebaseState.user) {
      return;
    }

    try {
      const docRef = firebaseState.db.collection(CLOUD_COLLECTION).doc(firebaseState.user.uid);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return;
      }

      const data = docSnap.data();
      if (!data || !data.state) {
        return;
      }

      const loaded = normalizePersistedState(data.state);
      if (!loaded) {
        return;
      }

      state.pages = loaded.pages;
      state.currentPageId = loaded.currentPageId;
      state.theme = loaded.theme;
      state.siteName = loaded.siteName;
      state.browserTitle = loaded.browserTitle;
      state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;

      applyTheme(state.theme);
      applySiteBranding();
      render();
      showToast("Loaded cloud version.");
    } catch (error) {
      console.error("Cloud load failed:", error);
    }
  }

  async function saveStateToCloud(payload) {
    if (!firebaseState.enabled || !firebaseState.db || !firebaseState.user) {
      return { accountSaved: false, publishedSaved: false };
    }

    let cloudPayload = payload;
    try {
      cloudPayload = JSON.parse(JSON.stringify(payload));
    } catch (error) {
      cloudPayload = payload;
    }

    if (payloadHasInlineImages(payload)) {
      if (pendingCloudImageUploads > 0) {
        return { accountSaved: false, publishedSaved: false, reason: "images-uploading" };
      }

      await replaceInlineImagesWithCloudUrls(cloudPayload);

      if (payloadHasInlineImages(cloudPayload)) {
        const quotaSafe = buildQuotaSafePayload(cloudPayload);
        if (quotaSafe) {
          cloudPayload = quotaSafe;
        } else {
          return { accountSaved: false, publishedSaved: false, reason: "inline-images" };
        }
      }
    }

    let accountSaved = false;
    let publishedSaved = false;

    try {
      const userDocRef = firebaseState.db.collection(CLOUD_COLLECTION).doc(firebaseState.user.uid);
      await withTimeout(
        userDocRef.set(
          {
            state: cloudPayload,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            team: "Team 69309 Collegiate Dutchmen"
          },
          { merge: true }
        ),
        SAVE_OP_TIMEOUT_MS,
        "Account cloud save timed out."
      );
      accountSaved = true;
    } catch (error) {
      console.error("Account cloud save failed:", error);
    }

    try {
      const publishedDocRef = firebaseState.db.collection(CLOUD_COLLECTION).doc(CLOUD_PUBLIC_DOC_ID);
      await withTimeout(
        publishedDocRef.set(
          {
            state: cloudPayload,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            team: "Team 69309 Collegiate Dutchmen",
            publishedBy: firebaseState.user.uid
          },
          { merge: true }
        ),
        SAVE_OP_TIMEOUT_MS,
        "Public publish save timed out."
      );
      publishedSaved = true;
    } catch (error) {
      console.error("Public publish save failed:", error);
    }

    return { accountSaved, publishedSaved };
  }

  function isFirebaseConfigured() {
    return Object.values(firebaseConfig).every((value) => String(value || "").trim().length > 0);
  }

  function loadInitialState() {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      const defaults = createDefaultState();
      state.pages = defaults.pages;
      state.currentPageId = defaults.currentPageId;
      state.theme = defaults.theme;
      state.siteName = defaults.siteName;
      state.browserTitle = defaults.browserTitle;
      state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizePersistedState(parsed);

      if (!normalized) {
        throw new Error("Invalid state");
      }

      state.pages = normalized.pages;
      state.currentPageId = normalized.currentPageId;
      state.theme = normalized.theme;
      state.siteName = normalized.siteName;
      state.browserTitle = normalized.browserTitle;
      state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;
    } catch (error) {
      console.warn("Using default state due to load error:", error);
      const defaults = createDefaultState();
      state.pages = defaults.pages;
      state.currentPageId = defaults.currentPageId;
      state.theme = defaults.theme;
      state.siteName = defaults.siteName;
      state.browserTitle = defaults.browserTitle;
      state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;
    }
  }

  function normalizePersistedState(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    if (!Array.isArray(candidate.pages) || !candidate.pages.length) {
      return null;
    }

    const normalizedPages = candidate.pages
      .map((page) => normalizePage(page))
      .filter((page) => page.sections.length > 0);

    if (!normalizedPages.length) {
      return null;
    }

    let currentPageId = String(candidate.currentPageId || "");
    if (!normalizedPages.find((page) => page.id === currentPageId)) {
      currentPageId = normalizedPages[0].id;
    }

    return {
      pages: normalizedPages,
      currentPageId,
      siteName: sanitizeText(candidate.siteName || DEFAULT_SITE_NAME) || DEFAULT_SITE_NAME,
      browserTitle: sanitizeText(candidate.browserTitle || candidate.siteName || DEFAULT_SITE_NAME) || DEFAULT_SITE_NAME,
      theme: {
        ...DEFAULT_THEME,
        ...(candidate.theme || {})
      }
    };
  }

  function normalizePage(page) {
    const normalized = {
      id: String(page?.id || uid("page")),
      name: String(page?.name || "Untitled Page"),
      sections: Array.isArray(page?.sections) ? page.sections.map((section) => normalizeSection(section)) : []
    };

    if (!normalized.sections.length) {
      normalized.sections = [createSimpleSection("New Section")];
    }

    return normalized;
  }

  function normalizeSection(section) {
    const normalized = {
      id: String(section?.id || uid("section")),
      name: String(section?.name || "Section"),
      layoutVersion: Number(section?.layoutVersion || 0),
      blocks: Array.isArray(section?.blocks) ? section.blocks.map((block) => normalizeBlock(block)).filter(Boolean) : []
    };

    if (!normalized.blocks.length) {
      normalized.blocks.push(createTitleBlock("Section Title"));
      normalized.blocks.push(createTextBlock("Add your text here."));
    }

    ensureSectionBlockLayout(normalized);

    return normalized;
  }

  function normalizeBlock(block) {
    if (!block || typeof block !== "object") {
      return null;
    }

    const common = {
      id: String(block.id || uid("block")),
      type: String(block.type || "text"),
      posX: toFiniteNumberOrNull(block.posX ?? block.offsetX),
      posY: toFiniteNumberOrNull(block.posY ?? block.offsetY),
      zIndex: toFiniteNumberOrNull(block.zIndex),
      boxWidthPx: toFiniteNumberOrNull(block.boxWidthPx),
      boxHeightPx: toFiniteNumberOrNull(block.boxHeightPx ?? block.boxMinHeightPx)
    };

    if (common.type === "title") {
      return {
        ...common,
        level: Number(block.level) === 1 ? 1 : 2,
        text: String(block.text || "Title")
      };
    }

    if (common.type === "text") {
      return {
        ...common,
        text: String(block.text || "")
      };
    }

    if (common.type === "image") {
      return {
        ...common,
        src: String(block.src || ""),
        alt: String(block.alt || "Image"),
        featured: Boolean(block.featured),
        widthPercent: clampNumber(block.widthPercent, 40, 100, 100),
        heightPx: clampNumber(block.heightPx, 180, 720, Boolean(block.featured) ? 470 : 420)
      };
    }

    if (common.type === "gallery") {
      const images = Array.isArray(block.images)
        ? block.images.map((img) => ({
            id: String(img.id || uid("img")),
            src: String(img.src || ""),
            alt: String(img.alt || "Gallery image")
          }))
        : [];

      return {
        ...common,
        images,
        imageHeightPx: clampNumber(block.imageHeightPx, 100, 520, 176)
      };
    }

    if (common.type === "button") {
      return {
        ...common,
        text: String(block.text || "Learn More"),
        url: String(block.url || "#")
      };
    }

    if (common.type === "team-cards" || common.type === "project-cards") {
      return {
        ...common,
        items: Array.isArray(block.items)
          ? block.items.map((item) => ({
              title: String(item.title || "Card"),
              subtitle: String(item.subtitle || ""),
              text: String(item.text || "")
            }))
          : []
      };
    }

    if (common.type === "timeline") {
      return {
        ...common,
        items: Array.isArray(block.items)
          ? block.items.map((item) => ({
              date: String(item.date || ""),
              title: String(item.title || ""),
              text: String(item.text || "")
            }))
          : []
      };
    }

    if (common.type === "sponsors") {
      return {
        ...common,
        logos: Array.isArray(block.logos)
          ? block.logos.map((logo) => ({
              name: String(logo.name || "Sponsor"),
              src: String(logo.src || "")
            }))
          : []
      };
    }

    return {
      ...common,
      text: String(block.text || "")
    };
  }

  function createDefaultState() {
    const homePage = createHomePage("Home");

    return {
      pages: [homePage],
      currentPageId: homePage.id,
      siteName: DEFAULT_SITE_NAME,
      browserTitle: DEFAULT_SITE_NAME,
      theme: { ...DEFAULT_THEME }
    };
  }

  function createHomePage(name) {
    const teamPhoto = svgPlaceholder("Team 69309 Robot Build", 1600, 820, "#0b1f35", "#18b8d2");

    const galleryImages = [
      svgPlaceholder("Drive Base", 600, 420, "#0b1f35", "#38bdf8"),
      svgPlaceholder("Attachment Testing", 600, 420, "#0f172a", "#2dd4bf"),
      svgPlaceholder("Coding Session", 600, 420, "#102a43", "#0ea5e9"),
      svgPlaceholder("Mission Run", 600, 420, "#1e293b", "#22d3ee"),
      svgPlaceholder("Pit Setup", 600, 420, "#0b1f35", "#14b8a6"),
      svgPlaceholder("Robot Inspection", 600, 420, "#082f49", "#38bdf8")
    ];

    const sponsorLogos = ["TechForge", "BuildLab", "RoboWorks", "CodeBridge"].map((nameLabel, index) => ({
      name: nameLabel,
      src: svgPlaceholder(nameLabel, 320, 180, index % 2 ? "#0f172a" : "#082f49", index % 2 ? "#0ea5e9" : "#14b8a6")
    }));

    return {
      id: uid("page"),
      name,
      sections: [
        {
          id: uid("section"),
          name: "Hero",
          blocks: [
            {
              id: uid("block"),
              type: "image",
              src: teamPhoto,
              alt: "Team 69309 Collegiate Dutchmen with robot",
              featured: true
            },
            createTitleBlock("Team 69309 Collegiate Dutchmen", 1),
            createTextBlock(
              "We design, code, and compete with purpose-built robots. Our team blends engineering, teamwork, and outreach to solve real challenges through FIRST LEGO League."
            ),
            createButtonBlock("See Our Projects", "#")
          ]
        },
        {
          id: uid("section"),
          name: "Team Introduction",
          blocks: [
            createTitleBlock("Team Introduction"),
            createTextBlock(
              "We are a student-led robotics team focused on mechanical design, autonomous programming, and innovation projects. Every season we iterate fast and learn by building."
            ),
            {
              id: uid("block"),
              type: "team-cards",
              items: [
                {
                  title: "Ava Johnson",
                  subtitle: "Mechanical Lead",
                  text: "Designs attachments and keeps the drivetrain competition ready."
                },
                {
                  title: "Noah Patel",
                  subtitle: "Programming Lead",
                  text: "Builds mission logic and autonomous control routines."
                },
                {
                  title: "Liam Rivera",
                  subtitle: "Strategy & Outreach",
                  text: "Coordinates match strategy, judging prep, and sponsor updates."
                }
              ]
            }
          ]
        },
        {
          id: uid("section"),
          name: "Robot Photos",
          blocks: [
            createTitleBlock("Robot Gallery"),
            createTextBlock("A quick look at our robot design process, test sessions, and competition runs."),
            {
              id: uid("block"),
              type: "gallery",
              images: galleryImages.map((src, index) => ({
                id: uid("img"),
                src,
                alt: "Robot gallery image " + (index + 1)
              }))
            }
          ]
        },
        {
          id: uid("section"),
          name: "Projects",
          blocks: [
            createTitleBlock("Projects"),
            {
              id: uid("block"),
              type: "project-cards",
              items: [
                {
                  title: "Autonomous Mission Engine",
                  subtitle: "Software",
                  text: "Reusable movement modules and sensor calibration workflow."
                },
                {
                  title: "Rapid Tool-Changer",
                  subtitle: "Mechanical",
                  text: "Swappable front attachments for multi-mission match strategy."
                },
                {
                  title: "Community STEM Lab",
                  subtitle: "Outreach",
                  text: "Hands-on robotics workshops for elementary students."
                }
              ]
            }
          ]
        },
        {
          id: uid("section"),
          name: "Competition Results",
          blocks: [
            createTitleBlock("Competition Timeline"),
            {
              id: uid("block"),
              type: "timeline",
              items: [
                {
                  date: "September 2025",
                  title: "Scrimmage Day",
                  text: "Top autonomous score and fast pit turnaround."
                },
                {
                  date: "November 2025",
                  title: "Regional Qualifier",
                  text: "2nd place Robot Performance and Innovation Project finalist."
                },
                {
                  date: "January 2026",
                  title: "State Invitational",
                  text: "Advanced to finals and won Teamwork Recognition."
                }
              ]
            }
          ]
        },
        {
          id: uid("section"),
          name: "Sponsors",
          blocks: [
            createTitleBlock("Sponsors"),
            createTextBlock("Our sponsors power prototyping materials, tournament travel, and community outreach."),
            {
              id: uid("block"),
              type: "sponsors",
              logos: sponsorLogos
            }
          ]
        },
        {
          id: uid("section"),
          name: "Contact",
          blocks: [
            createTitleBlock("Contact"),
            createTextBlock("Email us for collaboration, mentorship, or sponsorship opportunities."),
            createButtonBlock("Contact Team 69309", "mailto:robotics@collegiateschool.org")
          ]
        }
      ]
    };
  }

  function createSimpleSection(name) {
    return {
      id: uid("section"),
      name,
      blocks: [createTitleBlock(name), createTextBlock("Start writing your section content here.")]
    };
  }

  function createTitleBlock(text, level = 2) {
    return {
      id: uid("block"),
      type: "title",
      level,
      text
    };
  }

  function createTextBlock(text) {
    return {
      id: uid("block"),
      type: "text",
      text
    };
  }

  function createButtonBlock(text, url) {
    return {
      id: uid("block"),
      type: "button",
      text,
      url
    };
  }

  function render() {
    applySiteBranding();
    renderPageTabs();
    renderPageSelect();
    renderSections();
    updateAdminBadge();
  }

  function renderPageTabs() {
    if (!elements.pageTabs) {
      return;
    }

    elements.pageTabs.innerHTML = state.pages
      .map((page) => {
        const active = page.id === state.currentPageId ? "active" : "";
        return `<button type="button" class="page-tab ${active}" data-page-id="${escapeAttr(page.id)}">${escapeHtml(page.name)}</button>`;
      })
      .join("");
  }

  function renderPageSelect() {
    if (!elements.pageSelect) {
      return;
    }

    elements.pageSelect.innerHTML = state.pages
      .map((page) => `<option value="${escapeAttr(page.id)}">${escapeHtml(page.name)}</option>`)
      .join("");

    elements.pageSelect.value = state.currentPageId;
  }

  function renderSections() {
    if (!elements.siteContent) {
      return;
    }

    const page = getCurrentPage();
    if (!page) {
      elements.siteContent.innerHTML = "";
      return;
    }

    page.sections.forEach((section) => ensureSectionBlockLayout(section));

    const html = page.sections
      .map((section) => {
        const selectedClass = section.id === state.selectedSectionId ? "selected" : "";
        const controls = state.adminMode
          ? `<div class="section-controls">
              <button type="button" data-action="edit-section" class="section-control-btn">Edit</button>
              <button type="button" data-action="move-section" class="section-control-btn">Move</button>
              <button type="button" data-action="delete-section" class="section-control-btn danger">Delete</button>
            </div>`
          : "";

        const canvasHeight = getSectionCanvasHeight(section);
        return `
          <section class="builder-section fade-section ${selectedClass}" data-section-id="${escapeAttr(section.id)}" draggable="false">
            ${controls}
            <div class="section-header">
              <span class="section-chip">${escapeHtml(section.name)}</span>
            </div>
            <div class="section-content free-canvas" style="height:${canvasHeight}px">
              ${section.blocks.map((block) => renderBlock(block, section)).join("")}
            </div>
          </section>
        `;
      })
      .join("");

    elements.siteContent.innerHTML = html;
    setupFadeIn();
  }

  function renderBlock(block, section) {
    const imageResizeControls =
      block.type === "image"
        ? `<button type="button" class="section-control-btn" data-action="image-width-down" data-block-id="${escapeAttr(block.id)}">W-</button>
           <button type="button" class="section-control-btn" data-action="image-width-up" data-block-id="${escapeAttr(block.id)}">W+</button>
           <button type="button" class="section-control-btn" data-action="image-height-down" data-block-id="${escapeAttr(block.id)}">H-</button>
           <button type="button" class="section-control-btn" data-action="image-height-up" data-block-id="${escapeAttr(block.id)}">H+</button>`
        : "";

    const galleryResizeControls =
      block.type === "gallery"
        ? `<button type="button" class="section-control-btn" data-action="gallery-height-down" data-block-id="${escapeAttr(block.id)}">Tile-</button>
           <button type="button" class="section-control-btn" data-action="gallery-height-up" data-block-id="${escapeAttr(block.id)}">Tile+</button>`
        : "";

    const dragHandle = state.adminMode
      ? `<div class="block-admin-row">
          <button type="button" class="section-control-btn" data-action="edit-block" data-block-id="${escapeAttr(block.id)}">Edit</button>
          <button type="button" class="section-control-btn" data-action="layer-down" data-block-id="${escapeAttr(block.id)}">Back</button>
          <button type="button" class="section-control-btn" data-action="layer-up" data-block-id="${escapeAttr(block.id)}">Front</button>
          ${imageResizeControls}
          ${galleryResizeControls}
          <span class="block-handle" title="Drag block">Drag</span>
          <button type="button" class="section-control-btn danger" data-action="delete-block" data-block-id="${escapeAttr(
            block.id
          )}">Delete</button>
        </div>`
      : "";

    const runtimeStyle = buildBlockInlineStyle(block);
    const resizeGrip = state.adminMode
      ? `<span class="resize-grip" data-action="resize-block" data-block-id="${escapeAttr(block.id)}" title="Drag to resize"></span>`
      : "";
    const wrapperStart = `<div class="builder-block" style="${escapeAttr(runtimeStyle)}" data-block-id="${escapeAttr(
      block.id
    )}" data-section-id="${escapeAttr(section.id)}" draggable="false">${dragHandle}${resizeGrip}`;
    const wrapperEnd = "</div>";

    if (block.type === "title") {
      const textValue = escapeHtml(block.text || "Title");
      const editable = state.adminMode ? "true" : "false";

      if (block.level === 1) {
        return `${wrapperStart}<h2 class="title-large builder-editable" data-editable="true" data-block-id="${escapeAttr(
          block.id
        )}" data-field="text" contenteditable="${editable}">${textValue}</h2>${wrapperEnd}`;
      }

      return `${wrapperStart}<h3 class="title-medium builder-editable" data-editable="true" data-block-id="${escapeAttr(
        block.id
      )}" data-field="text" contenteditable="${editable}">${textValue}</h3>${wrapperEnd}`;
    }

    if (block.type === "text") {
      const editable = state.adminMode ? "true" : "false";
      const textValue = escapeHtml(block.text || "").replace(/\n/g, "<br />");

      return `${wrapperStart}<p class="body-text builder-editable" data-editable="true" data-block-id="${escapeAttr(
        block.id
      )}" data-field="text" contenteditable="${editable}">${textValue}</p>${wrapperEnd}`;
    }

    if (block.type === "image") {
      const imageClass = `${block.featured ? "rounded-3xl shadow-xl" : "rounded-2xl shadow-lg"} w-full object-cover`;
      return `${wrapperStart}<div class="builder-image-wrap h-full w-full"><img src="${escapeAttr(
        block.src
      )}" alt="${escapeAttr(
        block.alt || "Image"
      )}" class="${imageClass}" loading="lazy" style="height:100%;width:100%" /></div>${wrapperEnd}`;
    }

    if (block.type === "gallery") {
      const tileHeight = clampNumber(block.imageHeightPx, 100, 520, 176);
      return `${wrapperStart}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${(block.images || [])
            .map(
              (image) =>
                `<figure class="gallery-card"><img src="${escapeAttr(image.src)}" alt="${escapeAttr(
                  image.alt || "Gallery image"
                )}" class="w-full rounded-2xl object-cover" loading="lazy" style="height:${tileHeight}px" /></figure>`
            )
            .join("")}
        </div>
      ${wrapperEnd}`;
    }

    if (block.type === "button") {
      const safeUrl = block.url && block.url.trim() ? block.url : "#";
      return `${wrapperStart}
        <a href="${escapeAttr(safeUrl)}" class="builder-cta block-button-link" data-block-id="${escapeAttr(block.id)}">
          <span class="builder-editable" data-editable="true" data-block-id="${escapeAttr(
            block.id
          )}" data-field="text" contenteditable="${state.adminMode ? "true" : "false"}">${escapeHtml(block.text || "Button")}</span>
        </a>
      ${wrapperEnd}`;
    }

    if (block.type === "team-cards" || block.type === "project-cards") {
      return `${wrapperStart}
        <div class="grid gap-4 md:grid-cols-3">
          ${(block.items || [])
            .map(
              (item) => `
                <article class="content-card">
                  <h4 class="font-heading text-lg text-slate-900">${escapeHtml(item.title || "")}</h4>
                  <p class="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(
                    item.subtitle || ""
                  )}</p>
                  <p class="mt-3 text-sm text-slate-600">${escapeHtml(item.text || "")}</p>
                </article>
              `
            )
            .join("")}
        </div>
      ${wrapperEnd}`;
    }

    if (block.type === "timeline") {
      return `${wrapperStart}
        <div class="timeline-wrap">
          ${(block.items || [])
            .map(
              (item) => `
                <div class="timeline-item">
                  <p class="timeline-date">${escapeHtml(item.date || "")}</p>
                  <h4 class="font-heading text-base text-slate-900">${escapeHtml(item.title || "")}</h4>
                  <p class="mt-1 text-sm text-slate-600">${escapeHtml(item.text || "")}</p>
                </div>
              `
            )
            .join("")}
        </div>
      ${wrapperEnd}`;
    }

    if (block.type === "sponsors") {
      return `${wrapperStart}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          ${(block.logos || [])
            .map(
              (logo) => `
                <div class="sponsor-logo-card">
                  <img src="${escapeAttr(logo.src || "")}" alt="${escapeAttr(logo.name || "Sponsor")}" class="h-20 w-full rounded-xl object-cover" loading="lazy" />
                  <p class="mt-2 text-center text-sm font-semibold text-slate-700">${escapeHtml(logo.name || "")}</p>
                </div>
              `
            )
            .join("")}
        </div>
      ${wrapperEnd}`;
    }

    return `${wrapperStart}<p class="body-text">${escapeHtml(block.text || "")}</p>${wrapperEnd}`;
  }

  function buildBlockInlineStyle(block) {
    const canvasWidth = getSlideCanvasWidthEstimate();
    const x = clampNumber(block?.posX, 0, 2400, 12);
    const y = clampNumber(block?.posY, 0, 2400, 12);
    const zIndex = clampNumber(block?.zIndex, 1, 50, 1);
    const maxWidth = Math.max(320, canvasWidth - 24);
    const widthPx = clampNumber(block?.boxWidthPx, 240, maxWidth, getDefaultBlockWidth(block, canvasWidth));
    const heightPx = clampNumber(block?.boxHeightPx, 80, 1400, getDefaultBlockHeight(block));
    const fixedHeightBlock = block?.type === "image" || block?.type === "gallery";

    const styles = [
      "position:absolute",
      `left:${x}px`,
      `top:${y}px`,
      `z-index:${zIndex}`,
      `width:${widthPx}px`
    ];
    if (fixedHeightBlock) {
      styles.push(`height:${heightPx}px`);
    } else {
      styles.push(`min-height:${heightPx}px`);
    }
    return styles.join(";");
  }

  function ensureSectionBlockLayout(section) {
    if (!section || !Array.isArray(section.blocks)) {
      return;
    }

    const needsMigrationCenter = Number(section.layoutVersion || 0) < 4;
    const estimatedCanvasWidth = getSlideCanvasWidthEstimate();
    let cursorY = 24;
    section.blocks.forEach((block, index) => {
      if (!block || typeof block !== "object") {
        return;
      }

      const maxWidth = Math.max(320, estimatedCanvasWidth - 24);
      const defaultWidth = clampNumber(block.boxWidthPx, 240, maxWidth, getDefaultBlockWidth(block, estimatedCanvasWidth));
      const centeredX = Math.max(12, Math.round((estimatedCanvasWidth - defaultWidth) / 2));
      const minReadableWidth = Math.round(estimatedCanvasWidth * 0.68);

      if (needsMigrationCenter || !Number.isFinite(block.posX)) {
        block.posX = centeredX;
      }
      if (needsMigrationCenter || !Number.isFinite(block.posY)) {
        block.posY = cursorY;
      }
      if (needsMigrationCenter || !Number.isFinite(block.zIndex)) {
        block.zIndex = 1 + index;
      }
      if (!Number.isFinite(block.boxWidthPx)) {
        block.boxWidthPx = defaultWidth;
      }
      if (!Number.isFinite(block.boxHeightPx)) {
        block.boxHeightPx = getDefaultBlockHeight(block);
      }

      block.posX = clampNumber(block.posX, 0, 2400, 12);
      block.posY = clampNumber(block.posY, 0, 2400, cursorY);
      block.zIndex = clampNumber(block.zIndex, 1, 50, 1);
      block.boxWidthPx = clampNumber(block.boxWidthPx, 240, maxWidth, getDefaultBlockWidth(block, estimatedCanvasWidth));
      block.boxHeightPx = clampNumber(block.boxHeightPx, 80, 1400, getDefaultBlockHeight(block));

      if (needsMigrationCenter && block.type !== "button" && block.boxWidthPx < minReadableWidth) {
        block.boxWidthPx = clampNumber(getDefaultBlockWidth(block, estimatedCanvasWidth), 240, maxWidth, maxWidth);
      }

      if (needsMigrationCenter) {
        block.posX = Math.max(12, Math.round((estimatedCanvasWidth - block.boxWidthPx) / 2));
      }

      cursorY = Math.max(cursorY, block.posY + block.boxHeightPx + 14);
    });

    if (needsMigrationCenter) {
      section.layoutVersion = 4;
    }
  }

  function getSlideCanvasWidthEstimate() {
    const viewport = typeof window !== "undefined" ? Number(window.innerWidth || 0) : 0;
    if (!Number.isFinite(viewport) || viewport <= 0) {
      return 1100;
    }

    return clampNumber(viewport - 90, 760, 1700, 1100);
  }

  function getSectionCanvasHeight(section) {
    if (!section || !Array.isArray(section.blocks) || !section.blocks.length) {
      return DEFAULT_CANVAS_HEIGHT;
    }

    let maxBottom = DEFAULT_CANVAS_HEIGHT;
    section.blocks.forEach((block) => {
      if (!block || typeof block !== "object") {
        return;
      }

      const y = clampNumber(block.posY, 0, 2400, 12);
      const h = clampNumber(block.boxHeightPx, 80, 1400, getDefaultBlockHeight(block));
      maxBottom = Math.max(maxBottom, y + h + 24);
    });

    return maxBottom;
  }

  function getDefaultBlockHeight(block) {
    if (!block || typeof block !== "object") {
      return 180;
    }

    if (block.type === "title") {
      return 100;
    }
    if (block.type === "text") {
      return 190;
    }
    if (block.type === "button") {
      return 90;
    }
    if (block.type === "image") {
      return 320;
    }
    if (block.type === "gallery") {
      return 300;
    }

    return 220;
  }

  function getDefaultBlockWidth(block, canvasWidth) {
    const target = Math.round(canvasWidth * 0.88);
    if (!block || typeof block !== "object") {
      return target;
    }

    if (block.type === "button") {
      return Math.round(canvasWidth * 0.5);
    }

    return target;
  }

  function handleSiteClick(event) {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.preventDefault();
      handleSectionAction(actionButton);
      return;
    }

    const editableTarget = event.target.closest("[data-editable='true']");
    if (editableTarget && state.adminMode) {
      const editableSection = editableTarget.closest(".builder-section");
      if (editableSection) {
        selectSectionByElement(editableSection);
      }
      return;
    }

    const pageButton = event.target.closest(".block-button-link");
    if (pageButton && state.adminMode) {
      event.preventDefault();
      selectSectionByElement(pageButton.closest(".builder-section"));
      return;
    }

    const section = event.target.closest(".builder-section");
    if (section && state.adminMode) {
      selectSectionByElement(section);
    }
  }

  function handleSiteDoubleClick(event) {
    if (!state.adminMode) {
      return;
    }

    const image = event.target.closest(".builder-image-wrap img");
    if (image) {
      const blockElement = image.closest(".builder-block");
      const sectionElement = image.closest(".builder-section");
      const blockId = blockElement?.dataset.blockId;
      const sectionId = sectionElement?.dataset.sectionId;
      if (blockId && sectionId) {
        openReplaceImageModal(blockId, sectionId);
      }
      return;
    }

    const button = event.target.closest(".block-button-link");
    if (!button) {
      return;
    }

    const blockId = button.dataset.blockId;
    const block = findBlockById(blockId);
    if (!block || block.type !== "button") {
      return;
    }

    const newUrl = window.prompt("Button URL", block.url || "#");
    if (newUrl === null) {
      return;
    }

    block.url = newUrl.trim() || "#";
    queueSave();
    render();
  }

  function handleEditableInput(event) {
    if (!state.adminMode) {
      return;
    }

    const editable = event.target.closest("[data-editable='true']");
    if (!editable) {
      return;
    }

    const blockId = editable.dataset.blockId;
    const field = editable.dataset.field;
    if (!blockId || !field) {
      return;
    }

    const block = findBlockById(blockId);
    if (!block) {
      return;
    }

    const value = sanitizeText(editable.innerText);
    block[field] = value;
    queueSave();
  }

  function handleSectionAction(button) {
    const action = button.dataset.action;
    const sectionElement = button.closest(".builder-section");
    if (!sectionElement) {
      return;
    }

    const sectionId = sectionElement.dataset.sectionId;
    if (!sectionId) {
      return;
    }

    state.selectedSectionId = sectionId;

    if (action === "edit-section") {
      const section = getSectionById(sectionId);
      if (!section) {
        return;
      }

      const name = window.prompt("Section name", section.name);
      if (name === null) {
        return;
      }

      section.name = sanitizeText(name) || section.name;
      queueSave();
      render();
      return;
    }

    if (action === "move-section") {
      showToast("Drag the section to move it.");
      return;
    }

    if (action === "delete-section") {
      deleteSection(sectionId);
      return;
    }

    if (action === "delete-block") {
      const blockId = button.dataset.blockId;
      if (!blockId) {
        return;
      }

      deleteBlock(blockId, sectionId);
      return;
    }

    if (action === "edit-block") {
      const blockId = button.dataset.blockId;
      if (!blockId) {
        return;
      }

      editExistingBlock(blockId);
      return;
    }

    if (action === "layer-up") {
      adjustBlockLayer(button.dataset.blockId, 1);
      return;
    }

    if (action === "layer-down") {
      adjustBlockLayer(button.dataset.blockId, -1);
      return;
    }

    if (action === "image-width-down") {
      resizeImageBlock(button.dataset.blockId, -10, 0);
      return;
    }

    if (action === "image-width-up") {
      resizeImageBlock(button.dataset.blockId, 10, 0);
      return;
    }

    if (action === "image-height-down") {
      resizeImageBlock(button.dataset.blockId, 0, -30);
      return;
    }

    if (action === "image-height-up") {
      resizeImageBlock(button.dataset.blockId, 0, 30);
      return;
    }

    if (action === "gallery-height-down") {
      resizeGalleryBlock(button.dataset.blockId, -20);
      return;
    }

    if (action === "gallery-height-up") {
      resizeGalleryBlock(button.dataset.blockId, 20);
      return;
    }

    if (action === "resize-block") {
      return;
    }
  }

  function editExistingBlock(blockId) {
    const block = findBlockById(blockId);
    if (!block) {
      return;
    }

    if (block.type === "title" || block.type === "text") {
      const nextText = window.prompt("Edit text", block.text || "");
      if (nextText === null) {
        return;
      }
      block.text = sanitizeText(nextText) || block.text;
      queueSave();
      render();
      return;
    }

    if (block.type === "button") {
      const nextText = window.prompt("Button text", block.text || "Learn More");
      if (nextText === null) {
        return;
      }
      const nextUrl = window.prompt("Button URL", block.url || "#");
      if (nextUrl === null) {
        return;
      }
      block.text = sanitizeText(nextText) || block.text;
      block.url = nextUrl.trim() || "#";
      queueSave();
      render();
      return;
    }

    if (block.type === "image") {
      const nextAlt = window.prompt("Image alt text", block.alt || "Image");
      if (nextAlt !== null) {
        block.alt = sanitizeText(nextAlt) || block.alt;
      }
      const featured = window.confirm("Use hero (featured) image style?");
      block.featured = featured;
      queueSave();
      render();
      return;
    }

    showToast("This block can be edited by clicking text directly.");
  }

  function resizeImageBlock(blockId, widthDelta, heightDelta) {
    const block = findBlockById(blockId);
    if (!block || block.type !== "image") {
      return;
    }

    block.boxWidthPx = clampNumber(Number(block.boxWidthPx || 520) + Number(widthDelta || 0), 180, 1600, 520);
    block.boxHeightPx = clampNumber(Number(block.boxHeightPx || 320) + Number(heightDelta || 0), 80, 1400, 320);
    queueSave();
    applyLiveBlockStyle(block.id);
  }

  function resizeGalleryBlock(blockId, heightDelta) {
    const block = findBlockById(blockId);
    if (!block || block.type !== "gallery") {
      return;
    }

    block.boxHeightPx = clampNumber(Number(block.boxHeightPx || 300) + Number(heightDelta || 0), 80, 1400, 300);
    queueSave();
    applyLiveBlockStyle(block.id);
  }

  function adjustBlockLayer(blockId, delta) {
    const block = findBlockById(blockId);
    if (!block) {
      return;
    }

    block.zIndex = clampNumber(Number(block.zIndex || 1) + Number(delta || 0), 1, 50, 1);
    queueSave();
    render();
  }

  function handlePointerEditStart(event) {
    if (!state.adminMode) {
      return;
    }

    const resizeHandle = event.target.closest("[data-action='resize-block']");
    if (resizeHandle) {
      const blockId = resizeHandle.dataset.blockId;
      const blockElement = resizeHandle.closest(".builder-block");
      const block = findBlockById(blockId);
      if (!block || !blockElement) {
        return;
      }

      const rect = blockElement.getBoundingClientRect();
      pointerEdit = {
        mode: "resize",
        blockId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: Number(block.boxWidthPx || rect.width),
        startHeight: Number(block.boxHeightPx || rect.height)
      };
      blockElement.classList.add("editing-live");
      event.preventDefault();
      return;
    }

    const dragHandle = event.target.closest(".block-handle");
    if (!dragHandle) {
      return;
    }

    const blockElement = dragHandle.closest(".builder-block");
    if (!blockElement) {
      return;
    }

    const blockId = blockElement.dataset.blockId;
    const block = findBlockById(blockId);
    if (!block) {
      return;
    }

    pointerEdit = {
      mode: "drag",
      blockId,
      startX: event.clientX,
      startY: event.clientY,
      startXPos: Number(block.posX || 0),
      startYPos: Number(block.posY || 0)
    };
    blockElement.classList.add("editing-live");
    event.preventDefault();
  }

  function handlePointerEditMove(event) {
    if (!pointerEdit || !state.adminMode) {
      return;
    }

    const block = findBlockById(pointerEdit.blockId);
    if (!block) {
      return;
    }

    const deltaX = event.clientX - pointerEdit.startX;
    const deltaY = event.clientY - pointerEdit.startY;

    if (pointerEdit.mode === "drag") {
      block.posX = clampNumber(pointerEdit.startXPos + deltaX, 0, 2400, 12);
      block.posY = clampNumber(pointerEdit.startYPos + deltaY, 0, 2400, 12);
    } else if (pointerEdit.mode === "resize") {
      block.boxWidthPx = clampNumber(pointerEdit.startWidth + deltaX, 180, 1600, pointerEdit.startWidth);
      block.boxHeightPx = clampNumber(pointerEdit.startHeight + deltaY, 80, 1400, pointerEdit.startHeight);
    }

    applyLiveBlockStyle(block.id);
  }

  function handlePointerEditEnd() {
    if (!pointerEdit) {
      return;
    }

    document.querySelectorAll(".builder-block.editing-live").forEach((node) => node.classList.remove("editing-live"));
    pointerEdit = null;
    queueSave();
  }

  function applyLiveBlockStyle(blockId) {
    const block = findBlockById(blockId);
    const node = document.querySelector(`.builder-block[data-block-id="${blockId}"]`);
    if (!block || !node) {
      return;
    }

    node.setAttribute("style", buildBlockInlineStyle(block));
    const sectionElement = node.closest(".builder-section");
    const sectionId = sectionElement?.dataset.sectionId;
    const section = sectionId ? getSectionById(sectionId) : null;
    const canvas = sectionElement?.querySelector(".section-content.free-canvas");
    if (section && canvas) {
      canvas.style.height = `${getSectionCanvasHeight(section)}px`;
    }
  }

  function handleDragStart(event) {
    if (!state.adminMode) {
      return;
    }

    const block = event.target.closest(".builder-block");
    if (block) {
      dragPayload = {
        type: "block",
        blockId: block.dataset.blockId,
        fromSectionId: block.dataset.sectionId
      };
      block.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragPayload.blockId || "");
      return;
    }

    const section = event.target.closest(".builder-section");
    if (section) {
      dragPayload = {
        type: "section",
        sectionId: section.dataset.sectionId
      };
      section.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragPayload.sectionId || "");
    }
  }

  function handleDragOver(event) {
    if (!state.adminMode || !dragPayload) {
      return;
    }

    event.preventDefault();
    clearDropTargets();

    if (dragPayload.type === "section") {
      const section = event.target.closest(".builder-section");
      if (section && section.dataset.sectionId !== dragPayload.sectionId) {
        section.classList.add("drop-target");
      }
      return;
    }

    const block = event.target.closest(".builder-block");
    if (block && block.dataset.blockId !== dragPayload.blockId) {
      block.classList.add("drop-target-block");
      return;
    }

    const section = event.target.closest(".builder-section");
    if (section) {
      section.classList.add("drop-target");
    }
  }

  function handleDrop(event) {
    if (!state.adminMode || !dragPayload) {
      return;
    }

    event.preventDefault();

    if (dragPayload.type === "section") {
      dropSection(event);
    } else {
      dropBlock(event);
    }

    clearDragState();
  }

  function dropSection(event) {
    const targetSection = event.target.closest(".builder-section");
    const page = getCurrentPage();

    if (!targetSection || !page) {
      return;
    }

    const targetSectionId = targetSection.dataset.sectionId;
    if (!targetSectionId || targetSectionId === dragPayload.sectionId) {
      return;
    }

    const fromIndex = page.sections.findIndex((section) => section.id === dragPayload.sectionId);
    const toIndex = page.sections.findIndex((section) => section.id === targetSectionId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }

    const rect = targetSection.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;

    const [moved] = page.sections.splice(fromIndex, 1);
    let nextIndex = toIndex;

    if (insertAfter) {
      nextIndex += 1;
    }

    if (fromIndex < nextIndex) {
      nextIndex -= 1;
    }

    page.sections.splice(nextIndex, 0, moved);
    state.selectedSectionId = moved.id;

    queueSave();
    render();
  }

  function dropBlock(event) {
    const page = getCurrentPage();
    if (!page || !dragPayload.blockId) {
      return;
    }

    const targetBlockElement = event.target.closest(".builder-block");
    if (targetBlockElement && targetBlockElement.dataset.blockId === dragPayload.blockId) {
      return;
    }

    const sourceSection = getSectionById(dragPayload.fromSectionId);
    if (!sourceSection) {
      return;
    }

    const sourceIndex = sourceSection.blocks.findIndex((block) => block.id === dragPayload.blockId);
    if (sourceIndex < 0) {
      return;
    }

    const [movedBlock] = sourceSection.blocks.splice(sourceIndex, 1);

    const targetSectionElement = event.target.closest(".builder-section");
    if (!targetSectionElement) {
      sourceSection.blocks.splice(sourceIndex, 0, movedBlock);
      return;
    }

    const destinationSection = getSectionById(targetSectionElement.dataset.sectionId);
    if (!destinationSection) {
      sourceSection.blocks.splice(sourceIndex, 0, movedBlock);
      return;
    }

    if (targetBlockElement) {
      const targetBlockId = targetBlockElement.dataset.blockId;
      let insertionIndex = destinationSection.blocks.findIndex((block) => block.id === targetBlockId);
      if (insertionIndex < 0) {
        destinationSection.blocks.push(movedBlock);
      } else {
        const rect = targetBlockElement.getBoundingClientRect();
        const insertAfter = event.clientY > rect.top + rect.height / 2;
        if (insertAfter) {
          insertionIndex += 1;
        }

        if (destinationSection.id === sourceSection.id && sourceIndex < insertionIndex) {
          insertionIndex -= 1;
        }

        destinationSection.blocks.splice(Math.max(0, insertionIndex), 0, movedBlock);
      }
    } else {
      destinationSection.blocks.push(movedBlock);
    }

    state.selectedSectionId = destinationSection.id;
    queueSave();
    render();
  }

  function clearDropTargets() {
    document.querySelectorAll(".drop-target, .drop-target-block").forEach((el) => {
      el.classList.remove("drop-target", "drop-target-block");
    });
  }

  function clearDragState() {
    dragPayload = null;
    document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    clearDropTargets();
  }

  function addSection() {
    const page = getCurrentPage();
    if (!page) {
      return;
    }

    const name = window.prompt("Section name", "New Section");
    if (name === null) {
      return;
    }

    const section = createSimpleSection(sanitizeText(name) || "New Section");
    page.sections.push(section);
    state.selectedSectionId = section.id;

    queueSave();
    render();
  }

  function addTitleBlock() {
    const section = getSelectedSection();
    if (!section) {
      return;
    }

    const text = window.prompt("Title text", "New Title");
    if (text === null) {
      return;
    }

    section.blocks.push(createTitleBlock(sanitizeText(text) || "New Title"));
    queueSave();
    render();
  }

  function addTextBlock() {
    const section = getSelectedSection();
    if (!section) {
      return;
    }

    const text = window.prompt("Text", "Add your content here.");
    if (text === null) {
      return;
    }

    section.blocks.push(createTextBlock(sanitizeText(text) || "Add your content here."));
    queueSave();
    render();
  }

  function addButtonBlock() {
    const section = getSelectedSection();
    if (!section) {
      return;
    }

    const text = window.prompt("Button text", "Learn More");
    if (text === null) {
      return;
    }

    const url = window.prompt("Button link", "#");
    if (url === null) {
      return;
    }

    section.blocks.push(createButtonBlock(sanitizeText(text) || "Learn More", url.trim() || "#"));
    queueSave();
    render();
  }

  function editSiteName() {
    const nextName = window.prompt("Website name (browser tab title)", state.browserTitle || state.siteName || DEFAULT_SITE_NAME);
    if (nextName === null) {
      return;
    }

    state.browserTitle = sanitizeText(nextName) || state.browserTitle || state.siteName || DEFAULT_SITE_NAME;
    queueSave();
    render();
    showToast("Website name updated.");
  }

  function editBannerTitle() {
    const nextBanner = window.prompt("Banner title", state.siteName || DEFAULT_SITE_NAME);
    if (nextBanner === null) {
      return;
    }

    state.siteName = sanitizeText(nextBanner) || state.siteName || DEFAULT_SITE_NAME;
    queueSave();
    render();
    showToast("Banner title updated.");
  }

  function changeBannerImage() {
    const found = findBannerImageBlock(true);
    if (!found) {
      showToast("Could not prepare banner image.");
      return;
    }

    openReplaceImageModal(found.block.id, found.section.id);
  }

  function deleteSelectedSection() {
    if (!state.selectedSectionId) {
      showToast("Select a section first.");
      return;
    }

    deleteSection(state.selectedSectionId);
  }

  function deleteSection(sectionId) {
    const page = getCurrentPage();
    if (!page) {
      return;
    }

    if (page.sections.length === 1) {
      showToast("At least one section is required.");
      return;
    }

    const section = getSectionById(sectionId);
    if (!section) {
      return;
    }

    const confirmed = window.confirm(`Delete section "${section.name}"?`);
    if (!confirmed) {
      return;
    }

    page.sections = page.sections.filter((entry) => entry.id !== sectionId);
    state.selectedSectionId = page.sections[0]?.id || null;

    queueSave();
    render();
  }

  function deleteBlock(blockId, sectionId) {
    const section = getSectionById(sectionId);
    if (!section) {
      return;
    }

    section.blocks = section.blocks.filter((block) => block.id !== blockId);
    if (!section.blocks.length) {
      section.blocks.push(createTextBlock("Section content"));
    }

    queueSave();
    render();
  }

  function openImageModal(mode) {
    if (!state.adminMode) {
      return;
    }

    const section = getSelectedSection();
    if (!section) {
      showToast("Create or select a section first.");
      return;
    }

    imageUploadContext.mode = mode;
    imageUploadContext.sectionId = section.id;
    imageUploadContext.blockId = null;

    if (elements.imageModalTitle) {
      elements.imageModalTitle.textContent = mode === "gallery" ? "Upload Gallery Images" : "Upload Image";
    }

    if (elements.imageUploadHint) {
      elements.imageUploadHint.textContent =
        mode === "gallery"
          ? "Drop multiple images to create a gallery block."
          : "Drop one image to add it to the selected section.";
    }

    if (elements.imageUploadModal) {
      elements.imageUploadModal.classList.remove("hidden");
    }
  }

  function openReplaceImageModal(blockId, sectionId) {
    if (!state.adminMode || !blockId || !sectionId) {
      return;
    }

    imageUploadContext.mode = "replace";
    imageUploadContext.sectionId = sectionId;
    imageUploadContext.blockId = blockId;

    if (elements.imageModalTitle) {
      elements.imageModalTitle.textContent = "Replace Banner Image";
    }

    if (elements.imageUploadHint) {
      elements.imageUploadHint.textContent = "Drop one image to replace the current banner image.";
    }

    if (elements.imageUploadModal) {
      elements.imageUploadModal.classList.remove("hidden");
    }
  }

  function closeImageModal() {
    elements.imageUploadModal?.classList.add("hidden");
    elements.imageDropzone?.classList.remove("drag-over");
    imageUploadContext.mode = "image";
    imageUploadContext.sectionId = null;
    imageUploadContext.blockId = null;
  }

  async function processImageFiles(files) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      showToast("No image files found.");
      return;
    }

    const section = getSectionById(imageUploadContext.sectionId) || getSelectedSection();
    if (!section) {
      showToast("Select a section first.");
      return;
    }

    if (imageUploadContext.mode === "replace") {
      const targetBlockId = imageUploadContext.blockId;
      const targetBlock = findBlockById(targetBlockId);
      if (!targetBlock || targetBlock.type !== "image") {
        showToast("Banner image target not found.");
        return;
      }

      const file = imageFiles[0];
      const localSource = await buildImageSource(file, "banner");
      targetBlock.src = localSource.src;
      targetBlock.alt = file.name || targetBlock.alt || "Banner image";

      queueSave();
      render();
      closeImageModal();
      showToast("Banner image replaced.");
      uploadFileInBackground(file, "banner", (cloudUrl) => {
        const refreshedTarget = findBlockById(targetBlockId);
        if (!refreshedTarget || refreshedTarget.type !== "image") {
          return;
        }
        refreshedTarget.src = cloudUrl;
        queueSave();
        persistState({ manual: false });
        render();
        showToast("Banner uploaded.");
      });
      return;
    }

    if (imageUploadContext.mode === "gallery") {
      const galleryBlock = {
        id: uid("block"),
        type: "gallery",
        images: []
      };

      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];
        const uploaded = await buildImageSource(file, `gallery-${index + 1}`);
        galleryBlock.images.push({
          id: uid("img"),
          src: uploaded.src,
          alt: file.name || "Gallery image"
        });
      }

      section.blocks.push(galleryBlock);
      queueSave();
      render();
      closeImageModal();
      showToast("Gallery added.");

      imageFiles.forEach((file, index) => {
        uploadFileInBackground(file, `gallery-${index + 1}`, (cloudUrl) => {
          const refreshedGallery = findBlockById(galleryBlock.id);
          if (!refreshedGallery || refreshedGallery.type !== "gallery" || !Array.isArray(refreshedGallery.images) || !refreshedGallery.images[index]) {
            return;
          }
          refreshedGallery.images[index].src = cloudUrl;
          queueSave();
          persistState({ manual: false });
          render();
        });
      });
      return;
    }

    const file = imageFiles[0];
    const uploaded = await buildImageSource(file, "image");
    const imageBlock = {
      id: uid("block"),
      type: "image",
      src: uploaded.src,
      alt: file.name || "Uploaded image",
      featured: false
    };

    section.blocks.push(imageBlock);
    queueSave();
    render();
    closeImageModal();
    showToast("Image added.");
    uploadFileInBackground(file, "image", (cloudUrl) => {
      const refreshedImage = findBlockById(imageBlock.id);
      if (!refreshedImage || refreshedImage.type !== "image") {
        return;
      }
      refreshedImage.src = cloudUrl;
      queueSave();
      persistState({ manual: false });
      render();
      showToast("Image uploaded.");
    });
  }

  async function buildImageSource(file, hint = "upload") {
    const base64 = await fileToDataUrl(file);
    return { src: base64, cloud: false, hint };
  }

  function uploadFileInBackground(file, hint, onDone) {
    if (!hasCloudSync()) {
      return;
    }

    runCloudImageUpload(file)
      .then((cloudUrl) => {
        if (!cloudUrl || typeof onDone !== "function") {
          return;
        }
        onDone(cloudUrl);
      })
      .catch((error) => {
        console.error("Background image upload failed:", error);
        showToast("Image upload failed. Click Save to retry cloud publish.");
      });
  }

  async function uploadImageToCloud(file) {
    if (!firebaseState.enabled || !firebaseState.storage || !firebaseState.user) {
      return null;
    }

    try {
      const safeName = String(file.name || "upload").replace(/[^a-zA-Z0-9_.-]/g, "_");
      const path = `images/${firebaseState.user.uid}/${Date.now()}-${safeName}`;
      const storageRef = firebaseState.storage.ref().child(path);
      await withTimeout(storageRef.put(file), SAVE_OP_TIMEOUT_MS, "Image upload timed out.");
      return await withTimeout(storageRef.getDownloadURL(), SAVE_OP_TIMEOUT_MS, "Image URL fetch timed out.");
    } catch (error) {
      console.error("Cloud image upload failed:", error);
      return null;
    }
  }

  async function runCloudImageUpload(file) {
    pendingCloudImageUploads += 1;
    try {
      return await uploadImageToCloud(file);
    } finally {
      pendingCloudImageUploads = Math.max(0, pendingCloudImageUploads - 1);
    }
  }

  function openColorPanel() {
    if (!elements.colorPanel) {
      return;
    }

    if (elements.primaryColorInput) {
      elements.primaryColorInput.value = state.theme.primary;
    }

    if (elements.backgroundColorInput) {
      elements.backgroundColorInput.value = state.theme.background;
    }

    if (elements.textColorInput) {
      elements.textColorInput.value = state.theme.text;
    }

    if (elements.buttonColorInput) {
      elements.buttonColorInput.value = state.theme.button;
    }

    elements.colorPanel.classList.remove("hidden");
  }

  function closeColorPanel() {
    elements.colorPanel?.classList.add("hidden");
  }

  function addPage() {
    const name = window.prompt("Page name", "New Page");
    if (name === null) {
      return;
    }

    const pageName = sanitizeText(name) || "New Page";
    const page = {
      id: uid("page"),
      name: pageName,
      sections: [createSimpleSection("Hero"), createSimpleSection("Content")]
    };

    state.pages.push(page);
    state.currentPageId = page.id;
    state.selectedSectionId = page.sections[0]?.id || null;

    queueSave();
    render();
  }

  function renameCurrentPage() {
    const page = getCurrentPage();
    if (!page) {
      return;
    }

    const name = window.prompt("Rename page", page.name);
    if (name === null) {
      return;
    }

    page.name = sanitizeText(name) || page.name;
    queueSave();
    render();
  }

  function deleteCurrentPage() {
    if (state.pages.length <= 1) {
      showToast("At least one page is required.");
      return;
    }

    const page = getCurrentPage();
    if (!page) {
      return;
    }

    const confirmed = window.confirm(`Delete page "${page.name}"?`);
    if (!confirmed) {
      return;
    }

    state.pages = state.pages.filter((entry) => entry.id !== page.id);
    state.currentPageId = state.pages[0].id;
    state.selectedSectionId = state.pages[0].sections[0]?.id || null;

    queueSave();
    render();
  }

  function switchPage(pageId) {
    if (!state.pages.find((page) => page.id === pageId)) {
      return;
    }

    state.currentPageId = pageId;
    state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;
    queueSave();
    render();
  }

  function selectSectionByElement(sectionElement) {
    if (!sectionElement) {
      return;
    }

    const nextId = sectionElement.dataset.sectionId;
    if (!nextId || state.selectedSectionId === nextId) {
      return;
    }

    state.selectedSectionId = nextId;
    render();
  }

  function enableAdminMode() {
    state.adminMode = true;
    document.body.classList.add("admin-mode");
    if (elements.adminToolbar) {
      elements.adminToolbar.classList.remove("hidden");
    }

    if (!state.selectedSectionId) {
      state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;
    }

    render();
    if (hasCloudSync()) {
      showToast("Admin editing enabled.");
    } else if (firebaseState.enabled) {
      showToast("Admin editing enabled. Changes stay on this device until Google sign-in.");
    } else {
      showToast("Admin editing enabled. Local storage mode is active.");
    }
  }

  function disableAdminMode() {
    state.adminMode = false;
    document.body.classList.remove("admin-mode");
    if (elements.adminToolbar) {
      elements.adminToolbar.classList.add("hidden");
    }

    state.selectedSectionId = null;
    render();
  }

  function updateAdminBadge() {
    if (!elements.adminBadge) {
      return;
    }

    elements.adminBadge.textContent = state.adminMode ? "Admin Editing" : "Visitor View";
  }

  function applySiteBranding() {
    if (elements.siteHeading) {
      elements.siteHeading.textContent = state.siteName || DEFAULT_SITE_NAME;
    }

    document.title = state.browserTitle || state.siteName || DEFAULT_SITE_NAME;
  }

  function hasCloudSync() {
    return Boolean(firebaseState.enabled && firebaseState.user);
  }

  function queueSave() {
    hasUnsavedChanges = true;
    setSaveStatus("Unsaved Changes", "warning");

    if (!AUTO_SAVE_ENABLED) {
      return;
    }

    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      persistState({ manual: false });
    }, Math.max(SAVE_DEBOUNCE_MS, AUTO_SAVE_DELAY_MS));
  }

  async function persistState(options = { manual: false }) {
    const payload = {
      pages: state.pages,
      currentPageId: state.currentPageId,
      siteName: state.siteName,
      browserTitle: state.browserTitle,
      theme: state.theme,
      updatedAt: new Date().toISOString()
    };

    let localStatus = "full";
    let cloudStatus = { accountSaved: false, publishedSaved: false };
    setSaveStatus("Saving...", "saving");

    try {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (storageError) {
        if (!isStorageQuotaError(storageError)) {
          throw storageError;
        }

        const quotaSafe = buildQuotaSafePayload(payload);
        if (!quotaSafe) {
          localStatus = "quota-failed";
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(quotaSafe));
          localStatus = "compact";
        }
      }

      cloudStatus = await saveStateToCloud(payload);
      hasUnsavedChanges = false;

      if (options.manual) {
        if (cloudStatus.publishedSaved && localStatus === "full") {
          showToast("Saved and published for everyone.");
          setSaveStatus("Published", "success");
        } else if (cloudStatus.publishedSaved && localStatus === "compact") {
          showToast("Published for everyone. Local save used quota-safe image data.");
          setSaveStatus("Published (Cloud)", "warning");
        } else if (cloudStatus.publishedSaved && localStatus === "quota-failed") {
          showToast("Published for everyone. Local browser storage is full.");
          setSaveStatus("Published (Cloud)", "warning");
        } else if (cloudStatus.publishedSaved) {
          showToast("Published for everyone.");
          setSaveStatus("Published", "success");
        } else if (cloudStatus.accountSaved) {
          showToast("Saved to your account only. Public publish failed.");
          setSaveStatus("Saved (Account Only)", "warning");
        } else if (localStatus === "compact") {
          showToast("Saved with quota-safe local data. Some new images may need re-upload.");
          setSaveStatus("Saved (Quota Safe)", "warning");
        } else if (localStatus === "quota-failed") {
          showToast("Save failed: local browser storage is full, and cloud publish did not complete.");
          setSaveStatus("Save Failed (Storage Full)", "error");
        } else if (cloudStatus.reason === "images-uploading" || pendingCloudImageUploads > 0) {
          showToast("Images are uploading. Will auto-publish when ready.");
          setSaveStatus("Waiting for Images", "warning");
          scheduleCloudSaveRetry();
        } else if (cloudStatus.reason === "inline-images") {
          showToast("Some images could not upload. Saved using last known image versions.");
          setSaveStatus("Saved (Image Fallback)", "warning");
        } else if (firebaseState.enabled && !firebaseState.user) {
          showToast("Saved on this device only. Use Sign in with Google to sync.");
          setSaveStatus("Local Only", "warning");
        } else if (!firebaseState.enabled) {
          showToast("Saved on this device only. Cloud sync is unavailable.");
          setSaveStatus("Local Only", "warning");
        } else {
          showToast("Saved locally only.");
          setSaveStatus("Saved Locally", "warning");
        }
      } else {
        if (cloudStatus.publishedSaved) {
          setSaveStatus("Published", "success");
        } else if (cloudStatus.accountSaved) {
          setSaveStatus("Saved (Account Only)", "warning");
        } else if (cloudStatus.reason === "images-uploading" || pendingCloudImageUploads > 0) {
          setSaveStatus("Waiting for Images", "warning");
          scheduleCloudSaveRetry();
        } else {
          setSaveStatus("Saved Locally", "warning");
        }
      }
    } catch (error) {
      console.error("Save failed:", error);
      if (options.manual) {
        if (isStorageQuotaError(error)) {
          showToast("Save failed: browser storage is full. Upload images and try Save again.");
          setSaveStatus("Save Failed (Storage Full)", "error");
        } else {
          showToast("Save failed.");
          setSaveStatus("Save Failed", "error");
        }
      } else {
        setSaveStatus("Autosave Failed", "error");
      }
    }
  }

  function scheduleCloudSaveRetry() {
    if (!hasCloudSync()) {
      return;
    }

    window.clearTimeout(cloudRetryTimer);
    cloudRetryTimer = window.setTimeout(() => {
      if (pendingCloudImageUploads > 0) {
        scheduleCloudSaveRetry();
        return;
      }

      persistState({ manual: false });
    }, 1500);
  }

  function setSaveStatus(text, tone = "neutral") {
    if (!elements.saveStatus) {
      return;
    }

    elements.saveStatus.textContent = text;
    elements.saveStatus.classList.remove("state-saving", "state-success", "state-warning", "state-error");

    if (tone === "saving") {
      elements.saveStatus.classList.add("state-saving");
    } else if (tone === "success") {
      elements.saveStatus.classList.add("state-success");
    } else if (tone === "warning") {
      elements.saveStatus.classList.add("state-warning");
    } else if (tone === "error") {
      elements.saveStatus.classList.add("state-error");
    }
  }

  function isStorageQuotaError(error) {
    if (!error) {
      return false;
    }

    const code = Number(error.code);
    const name = String(error.name || "");
    return code === 22 || code === 1014 || name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
  }

  function getCurrentPage() {
    return state.pages.find((page) => page.id === state.currentPageId) || state.pages[0] || null;
  }

  function getSectionById(sectionId) {
    const page = getCurrentPage();
    if (!page) {
      return null;
    }

    return page.sections.find((section) => section.id === sectionId) || null;
  }

  function getSelectedSection() {
    const page = getCurrentPage();
    if (!page) {
      return null;
    }

    if (state.selectedSectionId) {
      const selected = page.sections.find((section) => section.id === state.selectedSectionId);
      if (selected) {
        return selected;
      }
    }

    state.selectedSectionId = page.sections[0]?.id || null;
    return page.sections[0] || null;
  }

  function findBlockById(blockId) {
    const page = getCurrentPage();
    if (!page) {
      return null;
    }

    for (let i = 0; i < page.sections.length; i += 1) {
      const section = page.sections[i];
      const block = section.blocks.find((entry) => entry.id === blockId);
      if (block) {
        return block;
      }
    }

    return null;
  }

  function findBannerImageBlock(createIfMissing = false) {
    const page = getCurrentPage();
    if (!page) {
      return null;
    }

    for (const section of page.sections) {
      for (const block of section.blocks) {
        if (block.type === "image" && block.featured) {
          return { section, block };
        }
      }
    }

    for (const section of page.sections) {
      for (const block of section.blocks) {
        if (block.type === "image") {
          return { section, block };
        }
      }
    }

    if (createIfMissing && page.sections.length > 0) {
      const section = page.sections[0];
      const newBlock = {
        id: uid("block"),
        type: "image",
        src: svgPlaceholder("Banner Image", 1600, 820, "#0b1f35", "#18b8d2"),
        alt: "Banner image",
        featured: true
      };
      section.blocks.unshift(newBlock);
      queueSave();
      render();
      return { section, block: newBlock };
    }

    return null;
  }

  function payloadHasInlineImages(payload) {
    if (!payload || !Array.isArray(payload.pages)) {
      return false;
    }

    for (const page of payload.pages) {
      if (!page || !Array.isArray(page.sections)) {
        continue;
      }

      for (const section of page.sections) {
        if (!section || !Array.isArray(section.blocks)) {
          continue;
        }

        for (const block of section.blocks) {
          if (!block || typeof block !== "object") {
            continue;
          }

          if (block.type === "image" && typeof block.src === "string" && block.src.startsWith("data:image/")) {
            return true;
          }

          if (block.type === "gallery" && Array.isArray(block.images)) {
            for (const image of block.images) {
              if (image && typeof image.src === "string" && image.src.startsWith("data:image/")) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }

  function buildQuotaSafePayload(payload) {
    try {
      const previousRaw = localStorage.getItem(STORAGE_KEY);
      const previous = previousRaw ? JSON.parse(previousRaw) : null;
      const previousImageByBlockId = new Map();
      const previousImageByImageId = new Map();

      if (previous && Array.isArray(previous.pages)) {
        for (const page of previous.pages) {
          for (const section of page.sections || []) {
            for (const block of section.blocks || []) {
              if (block && block.type === "image" && block.id && typeof block.src === "string") {
                previousImageByBlockId.set(String(block.id), block.src);
              }
              if (block && block.type === "gallery" && Array.isArray(block.images)) {
                for (const image of block.images) {
                  if (image && image.id && typeof image.src === "string") {
                    previousImageByImageId.set(String(image.id), image.src);
                  }
                }
              }
            }
          }
        }
      }

      const clone = JSON.parse(JSON.stringify(payload));
      for (const page of clone.pages || []) {
        for (const section of page.sections || []) {
          for (const block of section.blocks || []) {
            if (block.type === "image" && typeof block.src === "string" && block.src.startsWith("data:image/")) {
              const previousSrc = previousImageByBlockId.get(String(block.id));
              block.src = previousSrc || "";
            }

            if (block.type === "gallery" && Array.isArray(block.images)) {
              for (const image of block.images) {
                if (image && typeof image.src === "string" && image.src.startsWith("data:image/")) {
                  const previousSrc = previousImageByImageId.get(String(image.id));
                  image.src = previousSrc || "";
                }
              }
            }
          }
        }
      }

      return clone;
    } catch (error) {
      console.error("Quota-safe payload build failed:", error);
      return null;
    }
  }

  /**
   * Uploads any inline data-image URLs in payload to cloud storage and swaps them with cloud URLs.
   * @param {any} payload
   * @returns {Promise<number>}
   */
  async function replaceInlineImagesWithCloudUrls(payload) {
    if (!hasCloudSync() || !payload || !Array.isArray(payload.pages)) {
      return 0;
    }

    let replaced = 0;

    for (const page of payload.pages) {
      if (!page || !Array.isArray(page.sections)) {
        continue;
      }

      for (const section of page.sections) {
        if (!section || !Array.isArray(section.blocks)) {
          continue;
        }

        for (const block of section.blocks) {
          if (!block || typeof block !== "object") {
            continue;
          }

          if (block.type === "image" && typeof block.src === "string" && block.src.startsWith("data:image/")) {
            const cloudUrl = await uploadDataUrlToCloud(block.src, "image");
            if (cloudUrl) {
              block.src = cloudUrl;
              replaced += 1;
            }
          }

          if (block.type === "gallery" && Array.isArray(block.images)) {
            for (const image of block.images) {
              if (!image || typeof image.src !== "string" || !image.src.startsWith("data:image/")) {
                continue;
              }

              const cloudUrl = await uploadDataUrlToCloud(image.src, "gallery");
              if (cloudUrl) {
                image.src = cloudUrl;
                replaced += 1;
              }
            }
          }
        }
      }
    }

    if (replaced > 0) {
      render();
    }

    return replaced;
  }

  async function uploadDataUrlToCloud(dataUrl, hint = "upload") {
    if (!hasCloudSync() || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return null;
    }

    pendingCloudImageUploads += 1;
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const mime = String(blob.type || "image/png");
      const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
      const safeHint = String(hint || "upload").replace(/[^a-zA-Z0-9_.-]/g, "_");
      const path = `images/${firebaseState.user.uid}/${Date.now()}-${safeHint}.${ext}`;
      const storageRef = firebaseState.storage.ref().child(path);
      await withTimeout(storageRef.put(blob, { contentType: mime }), SAVE_OP_TIMEOUT_MS, "Inline image upload timed out.");
      return await withTimeout(storageRef.getDownloadURL(), SAVE_OP_TIMEOUT_MS, "Inline image URL fetch timed out.");
    } catch (error) {
      console.error("Inline image upload failed:", error);
      return null;
    } finally {
      pendingCloudImageUploads = Math.max(0, pendingCloudImageUploads - 1);
    }
  }

  function withTimeout(promise, timeoutMs, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(message || "Operation timed out."));
        }, timeoutMs);
      })
    ]);
  }

  function applyTheme(theme) {
    document.documentElement.style.setProperty("--primary-color", theme.primary || DEFAULT_THEME.primary);
    document.documentElement.style.setProperty("--bg-color", theme.background || DEFAULT_THEME.background);
    document.documentElement.style.setProperty("--text-color", theme.text || DEFAULT_THEME.text);
    document.documentElement.style.setProperty("--button-color", theme.button || DEFAULT_THEME.button);
  }

  function setupFadeIn() {
    if (fadeObserver) {
      fadeObserver.disconnect();
    }

    fadeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            fadeObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.18
      }
    );

    document.querySelectorAll(".fade-section").forEach((section) => {
      fadeObserver.observe(section);
    });
  }

  function showToast(message) {
    if (!elements.toastContainer) {
      return;
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("toast-hide");
      setTimeout(() => toast.remove(), 240);
    }, 1800);
  }

  function sanitizeText(value) {
    return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\u00a0/g, " ").trim();
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return Math.max(min, Math.min(max, numeric));
  }

  function toFiniteNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function svgPlaceholder(label, width, height, fromColor, toColor) {
    const safeLabel = escapeXml(label);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="${fromColor}" offset="0%" />
            <stop stop-color="${toColor}" offset="100%" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
        <circle cx="${Math.round(width * 0.2)}" cy="${Math.round(height * 0.25)}" r="${Math.round(
      Math.min(width, height) * 0.09
    )}" fill="rgba(255,255,255,0.12)" />
        <circle cx="${Math.round(width * 0.78)}" cy="${Math.round(height * 0.68)}" r="${Math.round(
      Math.min(width, height) * 0.12
    )}" fill="rgba(255,255,255,0.1)" />
        <rect x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.18)}" width="${Math.round(
      width * 0.8
    )}" height="${Math.round(height * 0.64)}" rx="26" fill="rgba(8,15,35,0.22)" />
        <text x="50%" y="53%" text-anchor="middle" fill="#f8fafc" font-family="Arial, sans-serif" font-size="${Math.max(
          22,
          Math.round(width / 20)
        )}" font-weight="700">${safeLabel}</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function escapeXml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeHtml(value) {
    return escapeXml(value);
  }

  function escapeAttr(value) {
    return escapeXml(value);
  }

  function bindIfPresent(target, eventName, handler) {
    if (target) {
      target.addEventListener(eventName, handler);
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });
  }
})();
