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
  const SAVE_DEBOUNCE_MS = 450;

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

  const imageUploadContext = {
    mode: "image",
    sectionId: null
  };

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindEvents();
    loadInitialState();
    applyTheme(state.theme);
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

    elements.btnAddSection = document.getElementById("btnAddSection");
    elements.btnAddTitle = document.getElementById("btnAddTitle");
    elements.btnAddText = document.getElementById("btnAddText");
    elements.btnAddImage = document.getElementById("btnAddImage");
    elements.btnAddGallery = document.getElementById("btnAddGallery");
    elements.btnAddButton = document.getElementById("btnAddButton");
    elements.btnChangeColors = document.getElementById("btnChangeColors");
    elements.btnAddPage = document.getElementById("btnAddPage");
    elements.btnDeleteSection = document.getElementById("btnDeleteSection");
    elements.btnSave = document.getElementById("btnSave");
    elements.btnRenamePage = document.getElementById("btnRenamePage");
    elements.btnDeletePage = document.getElementById("btnDeletePage");

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
      elements.siteContent.addEventListener("dragstart", handleDragStart);
      elements.siteContent.addEventListener("dragover", handleDragOver);
      elements.siteContent.addEventListener("drop", handleDrop);
      elements.siteContent.addEventListener("dragend", clearDragState);
    }

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

      firebaseState.auth.onAuthStateChanged(async (user) => {
        firebaseState.user = user || null;

        if (firebaseState.user) {
          await loadStateFromCloud();
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

  async function handleGoogleLogin() {
    if (!firebaseState.enabled || !firebaseState.auth) {
      throw new Error("Google login requires Firebase config.");
    }

    const provider = new window.firebase.auth.GoogleAuthProvider();
    const result = await firebaseState.auth.signInWithPopup(provider);

    if (!result || !result.user) {
      throw new Error("Google login failed.");
    }

    firebaseState.user = result.user;
    await loadStateFromCloud();
    showToast("Google login connected.");
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
      state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;

      applyTheme(state.theme);
      render();
      showToast("Loaded cloud version.");
    } catch (error) {
      console.error("Cloud load failed:", error);
    }
  }

  async function saveStateToCloud(payload) {
    if (!firebaseState.enabled || !firebaseState.db || !firebaseState.user) {
      return false;
    }

    try {
      const docRef = firebaseState.db.collection(CLOUD_COLLECTION).doc(firebaseState.user.uid);
      await docRef.set(
        {
          state: payload,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          team: "FLL Team 6959"
        },
        { merge: true }
      );
      return true;
    } catch (error) {
      console.error("Cloud save failed:", error);
      return false;
    }
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
      state.selectedSectionId = getCurrentPage()?.sections[0]?.id || null;
    } catch (error) {
      console.warn("Using default state due to load error:", error);
      const defaults = createDefaultState();
      state.pages = defaults.pages;
      state.currentPageId = defaults.currentPageId;
      state.theme = defaults.theme;
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
      blocks: Array.isArray(section?.blocks) ? section.blocks.map((block) => normalizeBlock(block)).filter(Boolean) : []
    };

    if (!normalized.blocks.length) {
      normalized.blocks.push(createTitleBlock("Section Title"));
      normalized.blocks.push(createTextBlock("Add your text here."));
    }

    return normalized;
  }

  function normalizeBlock(block) {
    if (!block || typeof block !== "object") {
      return null;
    }

    const common = {
      id: String(block.id || uid("block")),
      type: String(block.type || "text")
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
        featured: Boolean(block.featured)
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
        images
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
      theme: { ...DEFAULT_THEME }
    };
  }

  function createHomePage(name) {
    const teamPhoto = svgPlaceholder("Team 6959 Robot Build", 1600, 820, "#0b1f35", "#18b8d2");

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
              alt: "FLL Team 6959 with robot",
              featured: true
            },
            createTitleBlock("FLL Team 6959 - Collegiate School Robotics", 1),
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
            createButtonBlock("Contact Team 6959", "mailto:robotics@collegiateschool.org")
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

        return `
          <section class="builder-section fade-section ${selectedClass}" data-section-id="${escapeAttr(section.id)}" draggable="${state.adminMode}">
            ${controls}
            <div class="section-header">
              <span class="section-chip">${escapeHtml(section.name)}</span>
            </div>
            <div class="section-content">
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
    const dragHandle = state.adminMode
      ? `<div class="block-admin-row">
          <span class="block-handle" title="Drag block">Drag</span>
          <button type="button" class="section-control-btn danger" data-action="delete-block" data-block-id="${escapeAttr(
            block.id
          )}">Delete</button>
        </div>`
      : "";

    const wrapperStart = `<div class="builder-block" data-block-id="${escapeAttr(block.id)}" data-section-id="${escapeAttr(
      section.id
    )}" draggable="${state.adminMode}">${dragHandle}`;
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
      const imageClass = block.featured
        ? "h-[320px] w-full rounded-3xl object-cover shadow-xl md:h-[470px]"
        : "max-h-[420px] w-full rounded-2xl object-cover shadow-lg";
      return `${wrapperStart}<div class="builder-image-wrap"><img src="${escapeAttr(block.src)}" alt="${escapeAttr(
        block.alt || "Image"
      )}" class="${imageClass}" loading="lazy" /></div>${wrapperEnd}`;
    }

    if (block.type === "gallery") {
      return `${wrapperStart}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${(block.images || [])
            .map(
              (image) =>
                `<figure class="gallery-card"><img src="${escapeAttr(image.src)}" alt="${escapeAttr(
                  image.alt || "Gallery image"
                )}" class="h-44 w-full rounded-2xl object-cover" loading="lazy" /></figure>`
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

  function closeImageModal() {
    elements.imageUploadModal?.classList.add("hidden");
    elements.imageDropzone?.classList.remove("drag-over");
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

    if (imageUploadContext.mode === "gallery") {
      const galleryBlock = {
        id: uid("block"),
        type: "gallery",
        images: []
      };

      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];
        const base64 = await fileToDataUrl(file);
        galleryBlock.images.push({
          id: uid("img"),
          src: base64,
          alt: file.name || "Gallery image"
        });
      }

      section.blocks.push(galleryBlock);
      queueSave();
      render();
      closeImageModal();
      showToast("Gallery added.");

      if (firebaseState.enabled && firebaseState.user) {
        imageFiles.forEach(async (file, index) => {
          const cloudUrl = await uploadImageToCloud(file);
          if (!cloudUrl) {
            return;
          }

          const target = findBlockById(galleryBlock.id);
          if (!target || !Array.isArray(target.images) || !target.images[index]) {
            return;
          }

          target.images[index].src = cloudUrl;
          queueSave();
          render();
        });
      }

      return;
    }

    const file = imageFiles[0];
    const base64 = await fileToDataUrl(file);
    const imageBlock = {
      id: uid("block"),
      type: "image",
      src: base64,
      alt: file.name || "Uploaded image",
      featured: false
    };

    section.blocks.push(imageBlock);
    queueSave();
    render();
    closeImageModal();
    showToast("Image added.");

    if (firebaseState.enabled && firebaseState.user) {
      const cloudUrl = await uploadImageToCloud(file);
      if (!cloudUrl) {
        return;
      }

      const target = findBlockById(imageBlock.id);
      if (!target) {
        return;
      }

      target.src = cloudUrl;
      queueSave();
      render();
    }
  }

  async function uploadImageToCloud(file) {
    if (!firebaseState.enabled || !firebaseState.storage || !firebaseState.user) {
      return null;
    }

    try {
      const safeName = String(file.name || "upload").replace(/[^a-zA-Z0-9_.-]/g, "_");
      const path = `images/${firebaseState.user.uid}/${Date.now()}-${safeName}`;
      const storageRef = firebaseState.storage.ref().child(path);
      await storageRef.put(file);
      return await storageRef.getDownloadURL();
    } catch (error) {
      console.error("Cloud image upload failed:", error);
      return null;
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

  function hasCloudSync() {
    return Boolean(firebaseState.enabled && firebaseState.user);
  }

  function queueSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      persistState({ manual: false });
    }, SAVE_DEBOUNCE_MS);
  }

  async function persistState(options = { manual: false }) {
    const payload = {
      pages: state.pages,
      currentPageId: state.currentPageId,
      theme: state.theme,
      updatedAt: new Date().toISOString()
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      const cloudSaved = await saveStateToCloud(payload);

      if (options.manual) {
        if (cloudSaved) {
          showToast("Saved locally and to cloud.");
        } else if (firebaseState.enabled && !firebaseState.user) {
          showToast("Saved on this device only. Use Sign in with Google to sync.");
        } else if (!firebaseState.enabled) {
          showToast("Saved on this device only. Cloud sync is unavailable.");
        } else {
          showToast("Saved locally.");
        }
      }
    } catch (error) {
      console.error("Save failed:", error);
      if (options.manual) {
        showToast("Save failed.");
      }
    }
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
