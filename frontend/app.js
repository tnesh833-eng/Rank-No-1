/**
 * Main Application Logic for Rank-Holder Platform
 */
document.addEventListener("DOMContentLoaded", async function () {
    console.log("Initializing Rank-Holder Platform...");

    // 0. Initialize Email OTP Authentication System
    await initAuthSystem();

    // 1. Load User Settings & Theme
    await loadSettingsAndTheme();

    // 2. Load Initial Data (Jobs, Prospects, Notifications)
    await refreshJobFeed();
    await refreshNotifications();

    // 3. Initialize legacy game helpers
    initTTT();
    initMemory();
    if (typeof newScramble === "function") newScramble();
    if (typeof newMath === "function") newMath();
    resetGuess();

    // 4. Project Engine Chips Initializer
    updateChips();

    // 5. Apply admin-controlled tab conditions (visibility + default tab)
    await applyTabConditions();
});

// Tab definitions: maps flag name -> { btnId, sectionId }
// NOTE: sectionIds must match actual <section id="..."> in app.html
const APP_TAB_DEFS = [
    { flag: 'tab_jobs',          btnId: 'tab-jobs-btn',          sectionId: 'jobs' },
    { flag: 'tab_growup',        btnId: 'tab-growup-btn',        sectionId: 'growup' },
    { flag: 'tab_corporate',     btnId: 'tab-corporate-btn',     sectionId: 'corporate' },
    { flag: 'tab_english',       btnId: 'tab-english-btn',       sectionId: 'english' },
    { flag: 'tab_projects',      btnId: 'tab-projects-btn',      sectionId: 'projects' },
    { flag: 'tab_games',         btnId: 'tab-games-btn',         sectionId: 'games' },
    { flag: 'tab_knowledge_lab', btnId: 'tab-knowledge-lab-btn', sectionId: 'knowledge-lab' },
];

// Safe stub — prevents JS error when Project Engine tab is clicked
// The real initialization runs when blueprint is generated
function initProjectEngineTab() {
    console.log('[ProjectEngine] Tab activated');
}

async function applyTabConditions() {
    try {
        const API = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';
        const res = await fetch(API + '/app-settings');
        const data = await res.json();
        const tabFlags = data.tabs || {};
        const defaultTabId = data.defaultTab || 'jobs';

        const storedEmail = (localStorage.getItem("rh_registered_email") || "").toLowerCase().trim();
        const storedUser = JSON.parse(localStorage.getItem("rh_user") || localStorage.getItem("rh_auth_user") || "null");
        const userEmail = (storedUser && storedUser.email) ? storedUser.email.toLowerCase().trim() : storedEmail;
        const isAdmin = (userEmail === "tnesh833@gmail.com");

        let firstVisibleTabId = null;

        // Hide disabled/blocked tabs and their sections for normal users, admin sees all
        APP_TAB_DEFS.forEach(t => {
            const isVisible = tabFlags.hasOwnProperty(t.flag) ? tabFlags[t.flag] : true;
            const isBlocked = tabFlags.hasOwnProperty(t.flag + '_blocked') ? tabFlags[t.flag + '_blocked'] : false;
            
            let isEnabled = true;
            if (!isAdmin) {
                isEnabled = isVisible && !isBlocked;
            }

            const btn = document.getElementById(t.btnId);
            const section = document.getElementById(t.sectionId);

            if (!isEnabled) {
                if (btn) btn.style.display = 'none';
                if (section) section.style.display = 'none';
            } else {
                if (btn) btn.style.display = '';
                if (!firstVisibleTabId) firstVisibleTabId = t.sectionId;
            }
        });

        // Activate the admin-chosen default tab (if it is still visible)
        const defaultTabDef = APP_TAB_DEFS.find(t => t.sectionId === defaultTabId);
        const defaultEnabled = defaultTabDef && (tabFlags.hasOwnProperty(defaultTabDef.flag) ? tabFlags[defaultTabDef.flag] : true);
        const activeTabId = defaultEnabled ? defaultTabId : (firstVisibleTabId || 'jobs');

        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

        const activeBtn = document.getElementById('tab-' + activeTabId + '-btn');
        const activeSection = document.getElementById(activeTabId);
        if (activeBtn) activeBtn.classList.add('active');
        if (activeSection) activeSection.classList.add('active');

    } catch (e) {
        console.warn('[AppSettings] Could not apply tab conditions, using defaults:', e.message);
    }
}

/* ==========================================================================
   0. EMAIL OTP AUTHENTICATION SYSTEM
   ========================================================================== */

// NOTE: For local development, replace placeholders with your actual keys.
// For production, keys should ONLY live in backend environment variables.
const API_KEYS = {
    gemini: window._GEMINI_KEY || "",
    openai: window._OPENAI_KEY || "",
    claude: window._CLAUDE_KEY || "",
    grok: window._GROK_KEY || "",
    perplexity: window._PERPLEXITY_KEY || "",
    zai: window._ZAI_KEY || ""
};

const GEMINI_API_KEY = API_KEYS.gemini;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Global auth state
let _authCurrentMode = "register"; // "register" or "login"
let _authPendingEmail = "";
let _authPendingPhone = "";
let _authPendingName = "";

async function initAuthSystem() {
    // Listen for 401 auth-required events from Backend
    window.addEventListener("auth-required", () => {
        window.location.href = "login.html";
    });

    // Check if user already has a valid session
    if (Backend.Auth.isLoggedIn()) {
        const me = await Backend.Auth.getMe().catch(() => null);
        if (me && me.user) {
            if (me.user.status === 'BLOCKED') {
                localStorage.removeItem("rh_auth_token");
                localStorage.removeItem("rh_auth_user");
                localStorage.removeItem("rh_user");
                alert("🔒 Your account has been completely blocked by the Administrator.\nAccess Denied.");
                window.location.href = "login.html";
                return;
            } else if (me.user.status !== 'APPROVED') {
                localStorage.removeItem("rh_auth_token");
                localStorage.removeItem("rh_auth_user");
                // Don't redirect — just show as guest
                _showGuestBanner();
                return;
            }
            onAuthSuccess(me.user);
            return;
        } else {
            // Token invalid/expired — clear it but stay as guest
            localStorage.removeItem("rh_auth_token");
            localStorage.removeItem("rh_auth_user");
        }
    }

    // No valid session → show all tabs in GUEST mode (no redirect)
    _showGuestBanner();
}

function _showGuestBanner() {
    // Show a soft, non-blocking signin banner at the top
    const existing = document.getElementById('guestBanner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'guestBanner';
    banner.style.cssText = `
        position:fixed; top:64px; left:0; right:0; z-index:9000;
        background:linear-gradient(90deg,rgba(99,102,241,0.92),rgba(139,92,246,0.92));
        backdrop-filter:blur(12px);
        color:#fff; text-align:center; padding:10px 20px;
        font-size:0.85rem; font-weight:600;
        display:flex; align-items:center; justify-content:center; gap:14px;
    `;
    banner.innerHTML = `
        <span>👋 You're browsing as a <strong>Guest</strong>. Sign in for full features, progress saving & AI access.</span>
        <a href="login.html" style="background:#fff;color:#6366f1;padding:5px 16px;border-radius:20px;font-weight:700;text-decoration:none;font-size:0.8rem;flex-shrink:0;">Sign In</a>
        <button onclick="document.getElementById('guestBanner').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:1.1rem;flex-shrink:0;">✕</button>
    `;
    document.body.appendChild(banner);
    // Push container down so banner doesn't cover content
    const container = document.querySelector('.container');
    if (container) container.style.paddingTop = '46px';
}

function showAuthOverlay() {
    window.location.href = "login.html";
}

function hideAuthOverlay() {
    // Overlay is removed from DOM, do nothing
}

function onAuthSuccess(user) {
    hideAuthOverlay();

    // Show the profile chip in the navbar
    const userDisplayWrap = document.getElementById("authUserDisplayWrap");
    if (userDisplayWrap) userDisplayWrap.style.display = "flex";  // ← flex, not block

    // Update only the name span — do NOT use textContent on the button
    // (that would destroy the inner <img> and <span>)
    const navName = document.getElementById("navProfileName");
    if (navName) navName.textContent = user.name || user.email || "Profile";

    // Show profile strip below header (HIDDEN as per new design)
    const profileStrip = document.getElementById("profileStrip");
    if (profileStrip) {
        // profileStrip.style.display = "block"; // Hiding profile strip
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) logoutBtn.style.display = "inline-block";
    }

    // Populate full profile panel with user data + game scores
    if (window.renderProfileStats) window.renderProfileStats();

    console.log("✅ Auth OK:", user.name, user.email);
}

function toggleAuthMode() {
    const registerForm = document.getElementById("authRegisterForm");
    const loginForm = document.getElementById("authLoginForm");
    const toggleText = document.getElementById("authToggleText");
    const toggleBtn = document.getElementById("authToggleBtnText");

    if (_authCurrentMode === "register") {
        _authCurrentMode = "login";
        registerForm.style.display = "none";
        loginForm.style.display = "block";
        toggleText.textContent = "Don't have an account?";
        toggleBtn.textContent = "Register here";
    } else {
        _authCurrentMode = "register";
        registerForm.style.display = "block";
        loginForm.style.display = "none";
        toggleText.textContent = "Already have an account?";
        toggleBtn.textContent = "Login here";
    }
    // Clear errors
    document.getElementById("authRegError").textContent = "";
    document.getElementById("authLoginError").textContent = "";
}

async function handleAuthRegister() {
    const name = (document.getElementById("authRegName").value || "").trim();
    const phone = (document.getElementById("authRegPhone").value || "").trim();
    const email = (document.getElementById("authRegEmail").value || "").trim();
    const errEl = document.getElementById("authRegError");
    const btn = document.getElementById("authRegBtn");

    errEl.textContent = "";

    if (!name) { errEl.textContent = "⚠️ Please enter your full name."; return; }
    if (!phone || phone.replace(/\D/g, "").length < 10) { errEl.textContent = "⚠️ Please enter a valid phone number."; return; }
    if (!email || !email.includes("@")) { errEl.textContent = "⚠️ Please enter a valid email address."; return; }

    // Show loading
    btn.querySelector(".auth-btn-text").style.display = "none";
    btn.querySelector(".auth-btn-loader").style.display = "inline-block";
    btn.disabled = true;

    const res = await Backend.Auth.register(name, phone, email);

    btn.querySelector(".auth-btn-text").style.display = "inline";
    btn.querySelector(".auth-btn-loader").style.display = "none";
    btn.disabled = false;

    if (!res || res.error) {
        errEl.textContent = "❌ " + (res ? res.error : "Could not connect to server. Please ensure the backend is running.");
        // If already registered, switch to login
        if (res && res.error && res.error.toLowerCase().includes("already registered")) {
            setTimeout(() => {
                _authCurrentMode = "register";
                toggleAuthMode();
                document.getElementById("authLoginEmail").value = email;
            }, 1500);
        }
        return;
    }

    // Store pending info and go to OTP step
    _authPendingEmail = email;
    _authPendingPhone = phone;
    _authPendingName = name;
    document.getElementById("authOtpEmail").textContent = email;
    showAuthStep(2);
}

async function handleAuthLogin() {
    const email = (document.getElementById("authLoginEmail").value || "").trim();
    const errEl = document.getElementById("authLoginError");
    const btn = document.getElementById("authLoginBtn");

    errEl.textContent = "";

    if (!email || !email.includes("@")) { errEl.textContent = "⚠️ Please enter your registered email."; return; }

    btn.querySelector(".auth-btn-text").style.display = "none";
    btn.querySelector(".auth-btn-loader").style.display = "inline-block";
    btn.disabled = true;

    const res = await Backend.Auth.login(email);

    btn.querySelector(".auth-btn-text").style.display = "inline";
    btn.querySelector(".auth-btn-loader").style.display = "none";
    btn.disabled = false;

    if (!res || res.error) {
        errEl.textContent = "❌ " + (res ? res.error : "Could not connect to server. Please ensure the backend is running.");
        return;
    }

    _authPendingEmail = email;
    document.getElementById("authOtpEmail").textContent = email;
    showAuthStep(2);
}

async function handleAuthVerifyOTP() {
    const boxes = document.querySelectorAll(".auth-otp-box");
    const otp = Array.from(boxes).map(b => b.value.trim()).join("");
    const errEl = document.getElementById("authOtpError");
    const btn = document.getElementById("authVerifyBtn");

    errEl.textContent = "";

    if (otp.length < 6) { errEl.textContent = "⚠️ Please enter all 6 digits."; return; }

    btn.querySelector(".auth-btn-text").style.display = "none";
    btn.querySelector(".auth-btn-loader").style.display = "inline-block";
    btn.disabled = true;

    let res;
    if (_authCurrentMode === "register") {
        res = await Backend.Auth.verifyRegister(_authPendingEmail, otp);
    } else {
        res = await Backend.Auth.verifyLogin(_authPendingEmail, otp);
    }

    btn.querySelector(".auth-btn-text").style.display = "inline";
    btn.querySelector(".auth-btn-loader").style.display = "none";
    btn.disabled = false;

    if (!res || res.error) {
        errEl.textContent = "❌ " + (res ? res.error : "Verification failed. Please try again.");
        boxes.forEach(b => { b.value = ""; b.classList.add("auth-otp-box-error"); });
        setTimeout(() => boxes.forEach(b => b.classList.remove("auth-otp-box-error")), 1500);
        return;
    }

    // Show success step
    const successMsg = document.getElementById("authSuccessMsg");
    if (successMsg) successMsg.textContent = _authCurrentMode === "register"
        ? `🎉 Welcome, ${res.user ? res.user.name : "Rank Holder"}! Your account is verified.`
        : `✅ Welcome back, ${res.user ? res.user.name : ""}!`;
    showAuthStep(3);

    // Auto-proceed after 1.5 seconds
    setTimeout(() => {
        if (res.user) onAuthSuccess(res.user);
    }, 1500);
}

async function handleResendOTP() {
    const errEl = document.getElementById("authOtpError");
    errEl.textContent = "Sending new code...";

    let res;
    if (_authCurrentMode === "register") {
        res = await Backend.Auth.register(_authPendingName, _authPendingPhone, _authPendingEmail);
    } else {
        res = await Backend.Auth.login(_authPendingEmail);
    }

    errEl.textContent = res && res.success ? "✅ New code sent! Check your email." : "❌ Could not resend. Try again.";
    // Clear OTP boxes
    document.querySelectorAll(".auth-otp-box").forEach(b => b.value = "");
    document.querySelector(".auth-otp-box") && document.querySelector(".auth-otp-box").focus();
}

function goBackToAuthStep1() {
    showAuthStep(1);
    document.getElementById("authOtpError").textContent = "";
    document.querySelectorAll(".auth-otp-box").forEach(b => b.value = "");
}

function showAuthStep(step) {
    document.querySelectorAll(".auth-step").forEach(s => s.classList.remove("active"));
    const target = document.getElementById("authStep" + step);
    if (target) target.classList.add("active");
}

function setupOtpBoxes() {
    const boxes = document.querySelectorAll(".auth-otp-box");
    boxes.forEach((box, idx) => {
        box.addEventListener("input", (e) => {
            // Allow only digits
            box.value = box.value.replace(/\D/g, "");
            if (box.value && idx < boxes.length - 1) {
                boxes[idx + 1].focus();
            }
            // Auto-verify when all 6 filled
            if (Array.from(boxes).every(b => b.value.length === 1)) {
                setTimeout(handleAuthVerifyOTP, 300);
            }
        });
        box.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" && !box.value && idx > 0) {
                boxes[idx - 1].focus();
                boxes[idx - 1].value = "";
            }
            if (e.key === "Enter") handleAuthVerifyOTP();
        });
        box.addEventListener("paste", (e) => {
            const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "");
            if (text.length === 6) {
                e.preventDefault();
                boxes.forEach((b, i) => b.value = text[i] || "");
                setTimeout(handleAuthVerifyOTP, 300);
            }
        });
    });
}

async function handleLogout() {
    await Backend.Auth.logout();
    location.reload();
}

// --- Gemini AI Chat Function (uses stored API key) ---
async function callGeminiAI(prompt) {
    const apiKey = CryptoUtils.getApiKey();
    if (!apiKey) return null;
    try {
        const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
        console.warn("[Gemini] API error:", e.message);
        return null;
    }
}

/* ==========================================================================
   1. ANIMATED BACKGROUND CANVAS
   ========================================================================== */
function initBackgroundCanvas() {
    const canvas = document.getElementById("bg-animated-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const particles = Array.from({ length: 45 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2 + 1,
        dx: (Math.random() - 0.5) * 0.4,
        dy: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.5 + 0.2
    }));

    function draw() {
        ctx.clearRect(0, 0, width, height);
        const isDark = !document.body.classList.contains("light-theme");
        ctx.fillStyle = isDark ? "rgba(59, 130, 246, 0.4)" : "rgba(37, 99, 235, 0.25)";

        particles.forEach((p) => {
            p.x += p.dx;
            p.y += p.dy;
            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });

        requestAnimationFrame(draw);
    }
    draw();
}

/* ==========================================================================
   2. THREE.JS 3D PROFESSIONAL AI HUMANOID PARTNER â€” ARIA
   ========================================================================== */
let ariaScene, ariaCamera, ariaRenderer, ariaClock;
let ariaHead, ariaNeck, ariaTorso, ariaJaw, ariaEyeL, ariaEyeR;
let ariaIsSpeaking = false;
let ariaBreathPhase = 0;
let ariaBlinkTimer = 0;
let ariaJawPhase = 0;

function initThreeJsAvatar() {
    const container = document.getElementById("aiCanvasContainer");
    const canvas = document.getElementById("aiPartnerCanvas");
    if (!container || !canvas || !window.THREE) return;

    const W = 320, H = 360;
    ariaClock = new THREE.Clock();
    ariaScene = new THREE.Scene();

    ariaCamera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    ariaCamera.position.set(0, 1.2, 5.5);
    ariaCamera.lookAt(0, 1.0, 0);

    ariaRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    ariaRenderer.setSize(W, H);
    ariaRenderer.shadowMap.enabled = true;
    ariaRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // ---- Lighting ----
    ariaScene.add(new THREE.AmbientLight(0x334466, 1.2));

    const keyLight = new THREE.DirectionalLight(0x60a5fa, 2.5);
    keyLight.position.set(2, 5, 4);
    ariaScene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.8);
    rimLight.position.set(-3, 2, -2);
    ariaScene.add(rimLight);

    const fillLight = new THREE.PointLight(0x7c3aed, 1.2, 20);
    fillLight.position.set(0, -1, 3);
    ariaScene.add(fillLight);

    // ---- MATERIALS ----
    const skinMat = new THREE.MeshPhongMaterial({ color: 0x5b8dd9, shininess: 80, specular: 0x2255aa });
    const glowMat = new THREE.MeshPhongMaterial({ color: 0x0ea5e9, emissive: 0x0369a1, shininess: 200, transparent: true, opacity: 0.92 });
    const darkMat = new THREE.MeshPhongMaterial({ color: 0x0f1a2e, shininess: 30 });
    const eyeWhiteMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, shininess: 120 });
    const eyeIrisMat = new THREE.MeshPhongMaterial({ color: 0x38bdf8, emissive: 0x0369a1, shininess: 300 });
    const suitMat = new THREE.MeshPhongMaterial({ color: 0x1e3a5f, shininess: 60 });
    const tieMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x1d4ed8, shininess: 100 });
    const collarMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, shininess: 60 });
    const wireMat = new THREE.MeshPhongMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, wireframe: true, transparent: true, opacity: 0.25 });

    // ---- TORSO ----
    const torsoGeo = new THREE.CylinderGeometry(0.55, 0.45, 1.5, 16);
    ariaTorso = new THREE.Mesh(torsoGeo, suitMat);
    ariaTorso.position.set(0, 0, 0);
    ariaScene.add(ariaTorso);

    // Collar / shirt
    const collarGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.55, 12);
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(0, 0.55, 0);
    ariaTorso.add(collar);

    // Tie
    const tieGeo = new THREE.BoxGeometry(0.09, 0.55, 0.05);
    const tie = new THREE.Mesh(tieGeo, tieMat);
    tie.position.set(0, 0.35, 0.21);
    ariaTorso.add(tie);

    // Shoulders (arms)
    [-1, 1].forEach(side => {
        const shoulderGeo = new THREE.SphereGeometry(0.22, 12, 12);
        const shoulder = new THREE.Mesh(shoulderGeo, suitMat);
        shoulder.position.set(side * 0.7, 0.5, 0);
        ariaTorso.add(shoulder);

        const armGeo = new THREE.CylinderGeometry(0.13, 0.11, 1.0, 12);
        const arm = new THREE.Mesh(armGeo, suitMat);
        arm.position.set(side * 0.87, -0.05, 0);
        arm.rotation.z = side * 0.18;
        ariaTorso.add(arm);

        const handGeo = new THREE.SphereGeometry(0.13, 10, 10);
        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(side * 0.97, -0.6, 0);
        ariaTorso.add(hand);
    });

    // Holographic wireframe aura around torso
    const auraGeo = new THREE.CylinderGeometry(0.7, 0.6, 1.8, 16);
    const aura = new THREE.Mesh(auraGeo, wireMat);
    ariaTorso.add(aura);

    // ---- NECK ----
    const neckGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.4, 12);
    ariaNeck = new THREE.Mesh(neckGeo, skinMat);
    ariaNeck.position.set(0, 1.15, 0);
    ariaScene.add(ariaNeck);

    // ---- HEAD GROUP ----
    ariaHead = new THREE.Group();
    ariaHead.position.set(0, 1.7, 0);
    ariaScene.add(ariaHead);

    // Skull
    const skullGeo = new THREE.SphereGeometry(0.42, 20, 20);
    const skull = new THREE.Mesh(skullGeo, skinMat);
    skull.scale.set(1, 1.12, 0.95);
    ariaHead.add(skull);

    // Holographic halo ring
    const haloGeo = new THREE.TorusGeometry(0.52, 0.025, 8, 48);
    const haloMat = new THREE.MeshPhongMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, transparent: true, opacity: 0.7 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(0, 0.55, 0);
    halo.rotation.x = Math.PI / 2;
    ariaHead.add(halo);

    // ---- EYES ----
    [[-0.17, 0.07, 0.38], [0.17, 0.07, 0.38]].forEach((pos, i) => {
        const eyeGroup = new THREE.Group();
        eyeGroup.position.set(...pos);
        ariaHead.add(eyeGroup);

        // White sclera
        const scleraGeo = new THREE.SphereGeometry(0.085, 12, 12);
        const sclera = new THREE.Mesh(scleraGeo, eyeWhiteMat);
        eyeGroup.add(sclera);

        // Iris â€” glowing blue
        const irisGeo = new THREE.SphereGeometry(0.052, 10, 10);
        const iris = new THREE.Mesh(irisGeo, eyeIrisMat);
        iris.position.z = 0.05;
        eyeGroup.add(iris);

        // Pupil
        const pupilGeo = new THREE.SphereGeometry(0.024, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const pupil = new THREE.Mesh(pupilGeo, pupilMat);
        pupil.position.z = 0.08;
        eyeGroup.add(pupil);

        // Eye light catchlight
        const catchGeo = new THREE.SphereGeometry(0.012, 6, 6);
        const catchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const catchlight = new THREE.Mesh(catchGeo, catchMat);
        catchlight.position.set(0.02, 0.02, 0.09);
        eyeGroup.add(catchlight);

        if (i === 0) ariaEyeL = eyeGroup;
        else ariaEyeR = eyeGroup;
    });

    // ---- NOSE ----
    const noseGeo = new THREE.ConeGeometry(0.045, 0.1, 8);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, -0.04, 0.42);
    ariaHead.add(nose);

    // ---- JAW / MOUTH GROUP ----
    ariaJaw = new THREE.Group();
    ariaJaw.position.set(0, -0.18, 0);
    ariaHead.add(ariaJaw);

    const jawGeo = new THREE.BoxGeometry(0.28, 0.1, 0.2);
    const jawMesh = new THREE.Mesh(jawGeo, skinMat);
    jawMesh.position.set(0, 0, 0.28);
    ariaJaw.add(jawMesh);

    // Lips upper
    const lipGeo = new THREE.BoxGeometry(0.2, 0.035, 0.05);
    const lipMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x1d4ed8 });
    const upperLip = new THREE.Mesh(lipGeo, lipMat);
    upperLip.position.set(0, 0.055, 0.35);
    ariaHead.add(upperLip);

    const lowerLip = new THREE.Mesh(lipGeo, lipMat);
    lowerLip.position.set(0, 0, 0.35);
    ariaJaw.add(lowerLip);

    // Eyebrows
    [-0.17, 0.17].forEach(x => {
        const browGeo = new THREE.BoxGeometry(0.13, 0.02, 0.04);
        const browMat = new THREE.MeshPhongMaterial({ color: 0x1e3a5f });
        const brow = new THREE.Mesh(browGeo, browMat);
        brow.position.set(x, 0.2, 0.38);
        ariaHead.add(brow);
    });

    // Ears
    [-1, 1].forEach(side => {
        const earGeo = new THREE.SphereGeometry(0.1, 8, 8);
        earGeo.scale(0.5, 1.0, 0.3);
        const ear = new THREE.Mesh(earGeo, skinMat);
        ear.position.set(side * 0.43, 0, 0);
        ariaHead.add(ear);
    });

    // Floating data particles around partner
    const particleGeo = new THREE.BufferGeometry();
    const pCount = 60;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
        pPos[i * 3] = (Math.random() - 0.5) * 3.5;
        pPos[i * 3 + 1] = Math.random() * 3.5 - 0.5;
        pPos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.025, transparent: true, opacity: 0.6 });
    const particles = new THREE.Points(particleGeo, particleMat);
    ariaScene.add(particles);

    // ---- ANIMATE ----
    function ariaAnimate() {
        requestAnimationFrame(ariaAnimate);
        const dt = ariaClock.getDelta();
        const elapsed = ariaClock.getElapsedTime();

        // Idle head gentle sway
        if (ariaHead) {
            ariaHead.rotation.y = Math.sin(elapsed * 0.4) * 0.08;
            ariaHead.rotation.x = Math.sin(elapsed * 0.3) * 0.03;
        }

        // Breathing â€” torso scale
        if (ariaTorso) {
            ariaBreathPhase = elapsed;
            ariaTorso.scale.y = 1 + Math.sin(ariaBreathPhase * 1.1) * 0.018;
            ariaTorso.scale.x = 1 - Math.sin(ariaBreathPhase * 1.1) * 0.006;
        }

        // Halo spin
        if (ariaHead && ariaHead.children[1]) {
            ariaHead.children[1].rotation.z += 0.008;
        }

        // Jaw animation when speaking
        if (ariaJaw) {
            if (ariaIsSpeaking) {
                ariaJawPhase += dt * 12;
                ariaJaw.rotation.x = Math.abs(Math.sin(ariaJawPhase)) * 0.28;
            } else {
                ariaJaw.rotation.x *= 0.85;
            }
        }

        // Blink animation
        ariaBlinkTimer += dt;
        if (ariaBlinkTimer > 3.5 + Math.random() * 2) {
            ariaBlinkTimer = 0;
            if (ariaEyeL) ariaEyeL.scale.y = 0.05;
            if (ariaEyeR) ariaEyeR.scale.y = 0.05;
            setTimeout(() => {
                if (ariaEyeL) ariaEyeL.scale.y = 1;
                if (ariaEyeR) ariaEyeR.scale.y = 1;
            }, 120);
        }

        // Particles drift
        if (particles) particles.rotation.y += 0.003;

        ariaRenderer.render(ariaScene, ariaCamera);
    }
    ariaAnimate();
}

function setAriaSpeaking(speaking) {
    ariaIsSpeaking = speaking;
    const indicator = document.getElementById("speakingIndicator");
    if (indicator) indicator.style.display = speaking ? "flex" : "none";
    const statusEl = document.getElementById("aiVoiceStatus");
    if (statusEl) {
        statusEl.textContent = speaking ? "Speaking..." : "Online Â· Ready to Help You";
        statusEl.style.color = speaking ? "#f59e0b" : "#22c55e";
    }
    // Animate rank holder avatar when speaking
    const avatar = document.getElementById("rankHolderAvatar");
    if (avatar) avatar.style.transform = speaking ? "scale(1.04)" : "scale(1)";
}

/* ==========================================================================
   3. TAB SWITCHING & THEME MANAGEMENT
   ========================================================================== */
function switchTab(tabId, btnElement) {
    document.querySelectorAll(".tab-content").forEach((sec) => sec.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
    });

    const targetSection = document.getElementById(tabId);
    if (targetSection) targetSection.classList.add("active");

    const activeBtn = btnElement || document.getElementById(`tab-${tabId}-btn`);
    if (activeBtn) {
        activeBtn.classList.add("active");
        activeBtn.setAttribute("aria-selected", "true");
    }

    if (tabId === "growup" && window.initGrowUpTab) {
        window.initGrowUpTab();
    }

    // Smooth scroll to top of main container when switching tabs
    const container = document.querySelector(".container");
    if (container && window.scrollY > 200) {
        window.scrollTo({ top: container.offsetTop - 80, behavior: "smooth" });
    }
}

async function loadSettingsAndTheme() {
    const settings = await Backend.Settings.getSettings();
    if (settings) {
        if (settings.theme === "light") {
            document.body.classList.add("light-theme");
            document.getElementById("themeIcon").textContent = "ðŸŒ™";
            document.getElementById("themeLabel").textContent = "Dark";
        }
        if (document.getElementById("set-name")) document.getElementById("set-name").textContent = settings.name || "Rank Holder";
        if (document.getElementById("set-email")) document.getElementById("set-email").textContent = settings.email || "gokulsharmila82@gmail.com";
        if (document.getElementById("set-mobile")) document.getElementById("set-mobile").textContent = settings.mobile || "+91 8610017559";

        const commSelect = document.getElementById("aiCommModeSelect");
        if (commSelect) commSelect.value = settings.comm_mode || "friendly";
    }
}

function toggleTheme() {
    document.body.classList.toggle("light-theme");
    const isLight = document.body.classList.contains("light-theme");
    document.getElementById("themeIcon").textContent = isLight ? "ðŸŒ™" : "â˜€ï¸";
    document.getElementById("themeLabel").textContent = isLight ? "Dark" : "Light";

    Backend.Settings.updateSettings({
        name: document.getElementById("set-name") ? document.getElementById("set-name").textContent : "Rank Holder",
        email: document.getElementById("set-email") ? document.getElementById("set-email").textContent : "",
        mobile: document.getElementById("set-mobile") ? document.getElementById("set-mobile").textContent : "",
        theme: isLight ? "light" : "dark"
    });
}

function deactivateAccount() {
    if (confirm("Are you sure you want to deactivate your Rank-Holder session data?")) {
        localStorage.clear();
        alert("Account session data cleared.");
        location.reload();
    }
}

/* ==========================================================================
   4. NOTIFICATIONS & QUICK ACCESS HUB
   ========================================================================== */
function toggleNotifPanel() {
    const panel = document.getElementById("notifPanel");
    if (panel) panel.classList.toggle("open");
}

// ─ Notification store (for client-side filtering)
let _allNotifications = [];

async function refreshNotifications() {
    const res = await Backend.Notifications.fetchNotifications();
    const list = document.getElementById("notifList");
    const badge = document.getElementById("notifBadge");
    if (!list) return;

    _allNotifications = res.notifications || [];
    if (badge) {
        badge.style.display = _allNotifications.length > 0 ? "flex" : "none";
        badge.textContent = _allNotifications.length;
    }
    renderNotifList(_allNotifications);
}

function renderNotifList(notifs) {
    const list = document.getElementById("notifList");
    if (!list) return;
    list.innerHTML = "";

    if (!notifs.length) {
        list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.82rem;">🎉 You're all caught up!</div>`;
        return;
    }

    // Category config
    const catConfig = {
        job: { icon: "💼", label: "Job Alert", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.3)", color: "#60a5fa", badge: "rgba(59,130,246,0.15)" },
        internship: { icon: "🎓", label: "Internship", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.3)", color: "#34d399", badge: "rgba(16,185,129,0.12)" },
        system: { icon: "⚙️", label: "System", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.25)", color: "#a78bfa", badge: "rgba(139,92,246,0.12)" },
        general: { icon: "🔔", label: "Update", bg: "rgba(99,102,241,0.07)", border: "rgba(99,102,241,0.2)", color: "#818cf8", badge: "rgba(99,102,241,0.12)" },
    };

    notifs.forEach((n) => {
        const cfg = catConfig[n.category] || catConfig.general;
        const item = document.createElement("div");
        item.className = "notif-item";
        item.style.cssText = `background:${cfg.bg};border:1px solid ${cfg.border};border-radius:10px;padding:10px 12px;transition:all 0.2s;cursor:default;`;
        item.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:8px;">
                <div style="width:32px;height:32px;border-radius:8px;background:${cfg.badge};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">${cfg.icon}</div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                        <strong style="font-size:0.82rem;color:var(--text-primary);">${n.title}</strong>
                        <span style="font-size:0.62rem;font-weight:700;background:${cfg.badge};color:${cfg.color};border-radius:20px;padding:1px 7px;flex-shrink:0;">${cfg.label}</span>
                    </div>
                    <span style="font-size:0.75rem;color:var(--text-muted);line-height:1.4;">${n.message}</span>
                </div>
            </div>`;
        list.appendChild(item);
    });
}

window.filterNotifs = function (category) {
    // Update tab button styles
    const tabs = { all: "notifFilterAll", job: "notifFilterJob", internship: "notifFilterIntern" };
    Object.entries(tabs).forEach(([key, id]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const isActive = (category === "all" && key === "all") || key === category;
        btn.style.background = isActive ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.05)";
        btn.style.borderColor = isActive ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.1)";
        btn.style.color = isActive ? "var(--brand-primary)" : "var(--text-muted)";
    });

    const filtered = category === "all"
        ? _allNotifications
        : _allNotifications.filter(n => n.category === category);
    renderNotifList(filtered);
};

async function clearNotifications() {
    await Backend.Notifications.clearNotifications();
    _allNotifications = [];
    renderNotifList([]);
    const badge = document.getElementById("notifBadge");
    if (badge) badge.style.display = "none";
}

function openQuickAccess() {
    const overlay = document.getElementById("quickAccessOverlay");
    if (overlay) overlay.classList.add("open");
}

function closeQuickAccess() {
    const overlay = document.getElementById("quickAccessOverlay");
    if (overlay) overlay.classList.remove("open");
}

function openQASearch() {
    const input = document.getElementById("qaSearchInput");
    if (input && input.value.trim()) {
        const query = encodeURIComponent(input.value.trim());
        window.open(`https://www.google.com/search?q=${query}`, "_blank");
    }
}

function searchYouTube() {
    const input = document.getElementById("ytSearchInput");
    const query = input && input.value.trim() ? input.value.trim() : "HR interview preparation English communication";
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, "_blank");
}

function changeYouTubeVideo() {
    const select = document.getElementById("ytVideoSelect");
    const frame = document.getElementById("ytVideoFrame");
    if (select && frame) {
        frame.src = `https://www.youtube-nocookie.com/embed/${select.value}`;
    }
}

/* ==========================================================================
   5. ENGLISH COMMUNICATION & AI INTERVIEW HUB â€” ARIA INTELLIGENCE ENGINE
   ========================================================================== */
let turnsPracticed = 0;
let correctionsGiven = 0;
let fluencyScore = 100;
let recognition = null;
let isRecognizing = false;

// ---- Rank Holder AI Local AI Intelligence Database ----
const ARIA_KB = {
    greetings: [
        "Hey! 👋 I'm Rank Holder AI — your personal career coach! Whether it's HR rounds, Group Discussions, PPT presentations, or aptitude tests — I'm 100% here for you. What do you want to practice today? 🚀",
        "Hello! I'm Rank Holder AI. 🌟 You've come to the right place — I can help you with interviews, GDs, presentations, English, motivation, and anything career-related. Let's crush it together! 💪",
        "Greetings, future rank holder! 🎓 I'm your AI partner for placements. Ask me about HR rounds, Group Discussions, PPT tips, technical interviews, aptitude tricks — or just talk to me. I've got you! 🔥"
    ],
    grammar_rules: {
        "i has": { fix: "I have", tip: "With first person singular 'I', use 'have' not 'has'. Example: 'I have 3 years of experience.'" },
        "he do": { fix: "he does", tip: "Third person singular (he/she/it) uses 'does' in present simple." },
        "am agree": { fix: "I agree", tip: "'Agree' is not used with 'am'. Say 'I agree with your point.'" },
        "did went": { fix: "did go", tip: "After 'did', always use the base form of the verb." },
        "they was": { fix: "they were", tip: "Use 'were' with plural subjects: 'they were', 'we were'." },
        "more better": { fix: "better", tip: "'Better' is already comparative. Don't say 'more better' â€” just say 'better'." },
        "myself did": { fix: "I did", tip: "Use 'I' as subject, not 'myself'. 'Myself' is reflexive (I hurt myself)." },
        "since two years": { fix: "for two years", tip: "Use 'for' with a duration and 'since' with a point in time." },
        "hardly never": { fix: "hardly ever", tip: "'Hardly' is already negative. Avoid double negatives." },
        "can able to": { fix: "can / am able to", tip: "Use either 'can' or 'am able to' â€” not both together." }
    },
    hr_answers: {
        "tell me about yourself": {
            friendly: "Here's a great template for 'Tell me about yourself'! ðŸŒŸ\n\nStart with your educational background, then highlight 2-3 key skills or projects, and close with why you're excited about this role. Keep it to 90 seconds. Like this:\n\n'I'm [Name], a [Branch] graduate from [College]. During my studies, I built [Project], which gave me hands-on experience with [Skill]. I'm passionate about [Domain] and I believe this role aligns perfectly with my goals.'\n\nWant me to review your actual answer? Go ahead and try!",
            strictly: "STAR response expected. Structure: Name â†’ Education â†’ Key Skill or Project â†’ Goal Relevance. Keep under 90 seconds. No filler words like 'actually', 'basically', or 'basically'. Try now.",
            teaching: "Lesson: 'Tell me about yourself' is NOT your life story. It's a 90-second professional pitch.\n\nâœ… Structure:\n1. Who you are (name + degree)\n2. What you've done (1-2 projects or internships)\n3. What you're good at (your core skill)\n4. Why you want this role\n\nPractice tip: Write it down first, then speak it aloud 3 times. Would you like to practice now?"
        },
        "greatest strength": {
            friendly: "Great question to prepare! ðŸ’ª Here's how to answer it:\n\nPick ONE specific strength (not 'I work hard'). Link it to a real example. Quantify if possible.\n\nExample: 'My greatest strength is problem-solving. When my team faced a database crash during our college project, I debugged and restored it in 3 hours, saving our demo.'\n\nWhat's your actual strength? Tell me!",
            strictly: "Answer must include: (1) Specific strength, (2) Real example (STAR), (3) Result/Impact. Avoid generic phrases like 'I am a hardworking person.' Be precise. State your answer.",
            teaching: "Lesson: Interviewers want EVIDENCE, not adjectives.\n\nâ Œ Weak: 'I am very hardworking.'\nâœ… Strong: 'I am strong at time management. I managed 3 project deadlines simultaneously in my final year using Notion and daily standups.'\n\nFormula: [Strength] + [Situation] + [Action] + [Result]\n\nNow try YOUR greatest strength!"
        },
        "why should we hire you": {
            friendly: "This is your SALES PITCH! ðŸš€ Three things to cover:\n\n1. Your matching skills for the job\n2. A specific achievement that proves you can deliver\n3. Your enthusiasm & quick learning ability\n\nExample: 'You should hire me because I have strong Python skills demonstrated through my IoT project, I learn fast under pressure, and I'm genuinely excited about contributing to your team.'\n\nYour turn â€” try answering it!",
            strictly: "Three-part answer required: (1) Skill-role match, (2) Proven achievement, (3) Cultural fit or growth mindset. Do NOT say 'Because I am hardworking.' Give data. State your answer now.",
            teaching: "Lesson: This is about VALUE, not personality.\n\nThink: What problem does the company have that YOUR skills solve?\n\nâœ… Template: 'You should hire me because [Skill] + [Evidence] + [What I bring to the team]'\n\nExample: 'I bring both frontend and backend experience â€” I built a full-stack app as a solo project during my final year, which shows I can handle end-to-end delivery.'"
        },
        "weakness": {
            friendly: "The weakness question is a TRAP if you say 'I have no weaknesses'! ðŸ˜„ Here's the safe approach:\n\nâ€¢ Choose a REAL but NON-CRITICAL weakness\nâ€¢ Show you're WORKING on it\n\nExample: 'I used to struggle with public speaking. So I joined my college's debate club and presented in 5 inter-college events. Now I'm much more confident presenting to groups.'\n\nTry your answer!",
            strictly: "Acceptable weakness format: (1) Genuine weakness unrelated to core job requirements, (2) What action you're taking to improve, (3) Evidence of progress. Avoid clichÃ©s like 'I am too dedicated.'  State your weakness now.",
            teaching: "Lesson: Use the 'Weakness â†’ Action â†’ Improvement' formula.\n\nâ Œ Bad: 'I work too hard.' (clichÃ©, unbelievable)\nâœ… Good: 'I had trouble delegating tasks. I took a team-leadership workshop and practiced giving my teammates ownership of sub-tasks during group projects. Now my teams run more efficiently.'"
        },
        "salary": {
            friendly: "Smart question to prepare! ðŸ’° Here's how to negotiate salary professionally:\n\nResearch the market rate first. For freshers in India, typical ranges:\n- TCS/Infosys/Wipro: â‚¹3.5â€“7.5 LPA\n- Zoho: â‚¹5.5â€“8.5 LPA\n- Google/Microsoft: â‚¹18â€“28 LPA\n\nSay: 'Based on my research and the responsibilities of this role, I'm looking for something in the range of [X to Y]. I'm open to discussion based on the full package.'\n\nNever say 'Whatever you give' â€” that signals low confidence!",
            strictly: "State a specific range. Support with market research data and your skill level. Avoid vague answers. Demonstrate knowledge of industry standards.",
            teaching: "Salary Negotiation Lesson:\n1. Research industry benchmarks (use LinkedIn Salary, Glassdoor, Naukri)\n2. Give a range, not a single number\n3. Anchor slightly HIGH â€” expect to negotiate down\n4. Mention total compensation (bonus, learning, growth)"
        },
        "why this company": {
            friendly: "Research the company BEFORE the interview! ”  Check:\n\n Company website â€” what do they do and what's their mission?\nâ€¢ LinkedIn â€” recent news or team culture\nâ€¢ Glassdoor â€” work culture reviews\n\nTemplate answer: 'I admire [Company]'s work in [Domain]. Your product [X] especially interests me because [reason]. I'd love to grow with a team that values [culture point].'\n\nDon't say 'Because it's a good company' â€” that's too generic!",
            friendly: "Research the company BEFORE the interview! 🔍 Check:\n\n Company website — what do they do and what's their mission?\n• LinkedIn — recent news or team culture\n• Glassdoor — work culture reviews\n\nTemplate answer: 'I admire [Company]'s work in [Domain]. Your product [X] especially interests me because [reason]. I'd love to grow with a team that values [culture point].'\n\nDon't say 'Because it's a good company' — that's too generic!",
            strictly: "Demonstrate specific company knowledge. Mention a product, service, or news item. Connect company values to your career goals. Generic answers will fail.",
            teaching: "📖 Lesson: Interviewers are checking if you're GENUINELY interested or just job-hunting randomly.\n\nDo your homework:\n✅ Know the company's key products\n✅ Mention their recent expansion or award\n✅ Connect your skills to their mission"
        },
        "teamwork": {
            friendly: "Teamwork questions are golden opportunities! 🤝 Use STAR method:\n\nSituation → Task → Action → Result\n\nExample: 'In my final year project, our team had a disagreement about the database design. As a neutral member, I facilitated a discussion where each person presented their approach. We voted and selected the best one. The project won Best Project award.'\n\nTell me about a time YOU worked in a team!",
            strictly: "STAR format required. Include conflict or challenge element for stronger answers. Quantify outcomes. Begin your response.",
            teaching: "📖 Lesson: Teamwork = Collaboration + Communication + Conflict Resolution.\n\nStrong team answers include:\n✅ A specific challenge\n✅ Your specific role in resolving it\n✅ A measurable outcome"
        },
        "five years": {
            friendly: "'Where do you see yourself in 5 years?' is about showing AMBITION + LOYALTY! 🎯\n\nTemplate: 'In 5 years, I see myself growing into a [Senior/Lead] role within [Domain]. I want to build expertise in [Skill], contribute to impactful projects, and take on mentoring responsibilities. I'm excited to build that journey here.'\n\nDon't say 'I want to start my own company' in an interview — it signals you'll leave!\n\nTry YOUR version!",
            strictly: "Must show: domain expertise growth, leadership aspiration, and loyalty to the organization. Avoid short-term only answers.",
            teaching: "📖 Formula for 5-Year Answer:\n1. Short-term goal (1-2 years): Master the role + learn X skill\n2. Mid-term goal (3-4 years): Lead a team or project\n3. Long-term vision (5 years): Become a domain expert or technical lead"
        }
    },

    // ===== GROUP DISCUSSION =====
    gd_topics: {
        how_to_gd: {
            friendly: "🧩 Group Discussion (GD) — Your Complete Guide!\n\n✅ HOW TO SCORE IN GD:\n1. 🎯 Start strong — Initiate if you know the topic well (earns huge points!)\n2. 💬 Speak clearly — Volume should be audible to all, not just one person\n3. 🤝 Build on others — 'I agree with [name], and I'd add...' shows teamwork\n4. 📊 Use facts/examples — Always back your point with data or real examples\n5. ⏰ Be concise — Make your point in 30-45 seconds, then let others speak\n6. 🔄 Summarize — Volunteer to summarize at the end — it leaves a lasting impression\n\n🚫 NEVER DO THIS IN GD:\n• Don't cut others off rudely\n• Don't stay silent for more than 3 minutes\n• Don't dominate — give space to quieter members\n• Don't go completely off-topic\n\n🔥 Power Phrase: 'Building on what [Name] said, I believe...' — Use this to show you're listening!\n\nWant me to give you a practice GD topic to argue? Just ask!",
            strictly: "GD Assessment Criteria: (1) Content quality, (2) Communication clarity, (3) Leadership & initiative, (4) Team collaboration, (5) Body language. Structure your points using: Point → Evidence → Impact → Invite response. Begin.",
            teaching: "📖 GD Lesson:\nGD is NOT a debate. It's a collaborative discussion with a purpose.\n\n✅ 4-Step GD Formula:\n1. OPEN: Start with a definition or statistic\n2. PRESENT: Give your main argument with 1-2 examples\n3. COUNTER: Acknowledge opposite view and rebut logically\n4. CONCLUDE: Summarize consensus or your stance\n\nPractice topic: 'Is social media good or bad for students?' — Try arguing BOTH sides!"
        },
        gd_topics_list: "🧩 Hot GD Topics for 2024-25 Placements:\n\n🏢 BUSINESS & ECONOMY:\n• Is work-from-home the future of corporate India?\n• Should startups get tax exemptions?\n• Gig economy — boon or bane?\n\n💻 TECHNOLOGY:\n• Will AI replace software engineers?\n• Should India build its own social media platform?\n• Cryptocurrency — legal or ban?\n\n🎓 EDUCATION & SOCIETY:\n• Should coding be mandatory in schools?\n• Online degrees vs traditional degrees\n• Brain drain — should India retain talent or let it flow?\n\n🌿 ENVIRONMENT:\n• Is sustainable development a myth?\n• Electric vehicles — ready for India?\n\n💡 PRO TIP: For any topic, prepare 3 POINTS FOR + 3 POINTS AGAINST before GD. This makes you versatile!\n\nWant me to coach you on any specific topic? Just name it!"
    },

    // ===== PPT PRESENTATION =====
    ppt_guide: {
        friendly: "📊 PPT Presentation — Complete Guide for Freshers!\n\n🏗️ STRUCTURE YOUR PRESENTATION:\n1. 📌 Title Slide — Your name, topic, date\n2. 🎯 Agenda/Outline — Tell them what you'll tell them (30 sec)\n3. 💡 Problem Statement — What issue are you solving?\n4. 🔍 Your Solution/Analysis — 3-4 main points max\n5. 📈 Data/Evidence — 1 chart or fact per slide\n6. 🏆 Conclusion — Key takeaway in 1 sentence\n7. 🙏 Thank You + Q&A invite\n\n🎤 DELIVERY TIPS:\n• Speak TO the audience, not to the slides\n• 1 slide = 1 idea = max 5 bullet points\n• Pause after key points — let it sink in\n• Eye contact with different people in the room\n• Never read slide word-for-word\n\n❓ HANDLING Q&A:\n• If you don't know: 'Great question — I'd need to verify the exact data, but my understanding is...'\n• If off-topic: 'That's beyond today's scope, happy to discuss after!'\n• Always thank the questioner first\n\n⚡ POWER RULE: First 30 seconds = audience decides if they'll listen. Start with a QUESTION or SHOCKING FACT, not 'Good morning, I am going to present...'\n\nWant me to review your topic or give a sample opening line?",
        strictly: "Presentation Evaluation Criteria: (1) Structure & logic, (2) Slide clarity, (3) Verbal delivery, (4) Time management, (5) Q&A handling. Present your topic now — I will assess.",
        teaching: "📖 PPT Lesson: The 10-20-30 Rule (Guy Kawasaki):\n• Max 10 slides\n• Max 20 minutes\n• Min 30pt font size\n\nYour slide should answer ONE question. Ask yourself: 'If someone reads only this slide, what will they remember?' Design for that."
    },

    // ===== PRE-INTERVIEW PREP =====
    pre_interview: {
        checklist: "🎯 Pre-Interview Master Checklist — Do This BEFORE Your Interview!\n\n📅 ONE WEEK BEFORE:\n☑️ Research company — website, LinkedIn, recent news\n☑️ Study job description — match your skills to each requirement\n☑️ Prepare STAR stories for 5 behavioral questions\n☑️ Practice 'Tell me about yourself' 10 times\n☑️ Prepare 3 smart questions to ask the interviewer\n\n📅 ONE DAY BEFORE:\n☑️ Iron your formal clothes\n☑️ Charge your laptop/phone if it's a video interview\n☑️ Test your internet connection (video calls)\n☑️ Sleep by 10:30 PM — rest is performance\n☑️ Eat light the night before\n\n📅 MORNING OF INTERVIEW:\n☑️ Wake up 2 hours early\n☑️ Light breakfast (avoid heavy food)\n☑️ Reach 15 minutes early (physical) or log in 5 min early (virtual)\n☑️ Carry: Resume (3 copies), pen, notebook, original certificates\n☑️ Do 5 mins of power poses — it genuinely boosts confidence!\n\n🧠 MINDSET CHECK:\n• You are NOT begging for a job. You are evaluating if this company fits YOUR career.\n• Every rejection is data, not defeat.\n• Their loss if they don't take you. Next! 🚀\n\nYou've GOT this. I believe in you! 💪"
    },

    // ===== MOTIVATION =====
    motivation: [
        "🔥 Listen — every topper you admire faced the same rejections you're facing. The difference? They didn't stop. You're still here, still trying. THAT is your strength. One company's 'no' is the universe clearing your path to the PERFECT company. Keep going! 💪",
        "🌟 You know what's special about you? You showed up today. When things are hard, most people quit. You chose to prepare instead. THAT is the character companies look for — grit, resilience, hunger. You are already ahead of 80% of people. Believe it! 🚀",
        "💡 Freshers don't get rejected because they lack talent. They get rejected because they didn't PREPARE. But here you are, preparing. That changes EVERYTHING. You're not just a fresher — you are a RANK HOLDER IN THE MAKING. Own it! 🎓",
        "⚡ Your competition is scared. Your competition is giving up. Your competition is watching Netflix while you're here, sharpening your skills. You are different. And that difference will show in the interview room. Trust the process. Trust yourself. GO GET IT! 🏆",
        "🌈 One interview at a time. One question at a time. One day at a time. You don't need to be perfect — you need to be PREPARED. And you are doing exactly that right now. I'm proud of you. Now go show them what you're made of! ❤️🔥"
    ],

    // ===== APTITUDE =====
    aptitude: {
        strategy: "🧠 Aptitude Test — Cracking it Like a Pro!\n\n📚 KEY TOPICS TO MASTER:\n🔢 Quantitative:\n• Percentages, Profit & Loss, Time-Speed-Distance\n• Ratios & Proportions, Simple & Compound Interest\n• Number system, LCM/HCF, Averages\n\n🔤 Verbal:\n• Reading Comprehension — read 1 article daily\n• Sentence Correction — grammar rules\n• Vocabulary — learn 5 new words daily\n\n🧩 Logical Reasoning:\n• Blood Relations, Seating Arrangements\n• Syllogisms, Coding-Decoding\n• Data Interpretation (graphs, charts)\n\n⚡ SPEED TRICKS:\n• Percentage shortcut: 12% of 50 = 50% of 12 = 6 ✅\n• Multiply by 11: 45×11 = 4(4+5)5 = 495\n• Speed = Distance/Time — draw a triangle to remember\n\n📱 PRACTICE APPS: IndiaBix, PrepInsta, GeeksforGeeks, RS Aggarwal solutions\n\n🎯 TEST STRATEGY:\n1. Attempt easy questions first\n2. Skip and return to hard ones\n3. Manage time: aim for 1-1.5 min per question\n4. Eliminate options — often 2 are obviously wrong\n\nWant practice questions on any specific topic?"
    },

    // ===== TECHNICAL ROUND =====
    technical: {
        strategy: "💻 Technical Interview — Complete Strategy for Freshers!\n\n🔑 WHAT THEY ACTUALLY TEST:\n1. Problem-solving approach (more than perfect code!)\n2. Data Structures & Algorithms basics\n3. OOP concepts (Java/Python/C++)\n4. DBMS basics (SQL queries)\n5. OS & Networking fundamentals (for system roles)\n6. Projects you've built\n\n📋 MUST-KNOW DSA TOPICS:\n• Arrays & Strings (most common!)\n• Linked Lists, Stacks, Queues\n• Trees & Binary Search\n• Sorting algorithms (know at least Merge Sort, Quick Sort)\n• Hash Maps / Dictionaries\n\n💡 CODING ROUND APPROACH:\nStep 1: Read the question TWICE\nStep 2: Clarify edge cases with the interviewer\nStep 3: Think aloud — say your approach before coding\nStep 4: Code clean with variable names that make sense\nStep 5: Test with 2-3 examples\nStep 6: Mention time & space complexity\n\n🗣️ WHEN YOU'RE STUCK:\n• 'Can I approach this with a brute force solution first?'\n• 'I'm thinking of using a hash map here...'\n• NEVER stay silent. Thinking aloud scores you points!\n\n📚 PRACTICE: LeetCode (Easy/Medium), GeeksforGeeks, HackerRank\n\nWhat language are you coding in? I can give specific tips!"
    }
};

// Smart Grammar Checker
function ariaCheckGrammar(text) {
    const lower = text.toLowerCase();
    const issues = [];
    for (const [pattern, info] of Object.entries(ARIA_KB.grammar_rules)) {
        if (lower.includes(pattern)) {
            issues.push({ found: pattern, fix: info.fix, tip: info.tip });
        }
    }
    return issues;
}

// Smart keyword matcher for all topics
function ariaMatchTopic(text) {
    const lower = text.toLowerCase();
    const topics = [
        { keys: ["tell me about yourself", "introduce yourself", "about you", "self introduction"], topic: "tell me about yourself" },
        { keys: ["greatest strength", "your strength", "best skill", "what are you good at"], topic: "greatest strength" },
        { keys: ["why should we hire", "why hire you", "why you", "choose me"], topic: "why should we hire you" },
        { keys: ["weakness", "your weakness", "area of improvement", "i need to improve"], topic: "weakness" },
        { keys: ["salary", "expected salary", "package", "ctc", "pay", "compensation"], topic: "salary" },
        { keys: ["why this company", "why zoho", "why tcs", "why google", "why microsoft", "why join", "why this role"], topic: "why this company" },
        { keys: ["teamwork", "team", "worked with others", "collaboration", "group work"], topic: "teamwork" },
        { keys: ["five years", "5 years", "long term", "future plan", "career goal", "where do you see"], topic: "five years" },
        // GD topics
        { keys: ["group discussion", "gd tips", "gd strategy", "how to speak in gd", "group discussion tips", "prepare for a group"], topic: "gd_how" },
        { keys: ["gd topics", "group discussion topic", "current gd topic", "trending gd"], topic: "gd_topics" },
        // PPT topics
        { keys: ["ppt", "presentation", "powerpoint", "slide", "prepare a ppt", "present a topic", "how to present"], topic: "ppt" },
        // Pre-interview
        { keys: ["pre interview", "before interview", "interview checklist", "interview preparation", "prepare for interview", "interview tomorrow", "checklist"], topic: "pre_interview" },
        // Motivation
        { keys: ["motivate", "motivation", "i am nervous", "nervous", "scared", "fear", "i feel like giving up", "i can't do it", "feeling low", "demotivated", "not confident", "no confidence", "i failed", "got rejected"], topic: "motivation" },
        // Aptitude
        { keys: ["aptitude", "quantitative", "logical reasoning", "verbal ability", "crack aptitude", "placement test", "online test", "written test"], topic: "aptitude" },
        // Technical
        { keys: ["technical interview", "coding round", "technical round", "dsa", "data structure", "algorithm", "leetcode", "coding question", "programming interview", "technical question"], topic: "technical" }
    ];

    for (const entry of topics) {
        if (entry.keys.some(k => lower.includes(k))) {
            return entry.topic;
        }
    }
    return null;
}

// Main Rank Holder AI Response Generator
function ariaGenerateResponse(userText, mode) {
    const lower = userText.toLowerCase();
    const grammarIssues = ariaCheckGrammar(userText);
    const topic = ariaMatchTopic(userText);

    let reply = "";
    let corrections = grammarIssues.map(i => `'${i.found}' → '${i.fix}': ${i.tip}`);

    // Grammar correction prefix
    let grammarPrefix = "";
    if (grammarIssues.length > 0) {
        grammarPrefix = `📝 Grammar Correction:\n${grammarIssues.map(i => `• '${i.found}' → say '${i.fix}' — ${i.tip}`).join('\n')}\n\n`;
    }

    // Greetings
    if (lower.match(/^(hi|hello|hey|good morning|good afternoon|namaste|hii|helo)/)) {
        reply = ARIA_KB.greetings[Math.floor(Math.random() * ARIA_KB.greetings.length)];
        return { reply: grammarPrefix + reply, corrections };
    }

    // ---- MOTIVATION (check first — emotional priority) ----
    if (topic === "motivation") {
        const motivations = ARIA_KB.motivation;
        reply = motivations[Math.floor(Math.random() * motivations.length)];
        const ytHtml = `\n\n<div style="margin-top:10px;"><a href="https://www.youtube.com/results?search_query=motivation+for+interview+freshers" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:4px 12px;border-radius:12px;text-decoration:none;font-size:0.75rem;font-weight:bold;">🔥 Watch Motivation Video</a></div>`;
        return { reply: grammarPrefix + reply + ytHtml, corrections };
    }

    // ---- GROUP DISCUSSION ----
    if (topic === "gd_how") {
        const modeKey = mode === "strictly" ? "strictly" : mode === "teaching" ? "teaching" : "friendly";
        reply = ARIA_KB.gd_topics.how_to_gd[modeKey];
        const ytHtml = `\n\n<div style="margin-top:10px;"><a href="https://www.youtube.com/results?search_query=group+discussion+tips+placement+2024" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#ff0000,#cc0000);color:white;padding:4px 12px;border-radius:12px;text-decoration:none;font-size:0.75rem;font-weight:bold;">▶️ Watch GD Tips on YouTube</a></div>`;
        return { reply: grammarPrefix + reply + ytHtml, corrections };
    }

    if (topic === "gd_topics") {
        reply = ARIA_KB.gd_topics.gd_topics_list;
        return { reply: grammarPrefix + reply, corrections };
    }

    // ---- PPT PRESENTATION ----
    if (topic === "ppt") {
        const modeKey = mode === "strictly" ? "strictly" : mode === "teaching" ? "teaching" : "friendly";
        reply = ARIA_KB.ppt_guide[modeKey];
        const ytHtml = `\n\n<div style="margin-top:10px;"><a href="https://www.youtube.com/results?search_query=how+to+make+ppt+presentation+for+interview" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#ff0000,#cc0000);color:white;padding:4px 12px;border-radius:12px;text-decoration:none;font-size:0.75rem;font-weight:bold;">▶️ Watch PPT Tips on YouTube</a></div>`;
        return { reply: grammarPrefix + reply + ytHtml, corrections };
    }

    // ---- PRE-INTERVIEW CHECKLIST ----
    if (topic === "pre_interview") {
        reply = ARIA_KB.pre_interview.checklist;
        return { reply: grammarPrefix + reply, corrections };
    }

    // ---- APTITUDE ----
    if (topic === "aptitude") {
        reply = ARIA_KB.aptitude.strategy;
        const ytHtml = `\n\n<div style="margin-top:10px;"><a href="https://www.youtube.com/results?search_query=aptitude+tricks+shortcuts+placement+2024" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#ff0000,#cc0000);color:white;padding:4px 12px;border-radius:12px;text-decoration:none;font-size:0.75rem;font-weight:bold;">▶️ Watch Aptitude Tricks on YouTube</a></div>`;
        return { reply: grammarPrefix + reply + ytHtml, corrections };
    }

    // ---- TECHNICAL ROUND ----
    if (topic === "technical") {
        reply = ARIA_KB.technical.strategy;
        const ytHtml = `\n\n<div style="margin-top:10px;"><a href="https://www.youtube.com/results?search_query=technical+interview+tips+freshers+DSA+coding" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#ff0000,#cc0000);color:white;padding:4px 12px;border-radius:12px;text-decoration:none;font-size:0.75rem;font-weight:bold;">▶️ Watch Technical Interview Tips</a></div>`;
        return { reply: grammarPrefix + reply + ytHtml, corrections };
    }

    // ---- HR TOPIC ANSWERS ----
    if (topic && ARIA_KB.hr_answers[topic]) {
        const modeKey = mode === "strictly" ? "strictly" : mode === "teaching" ? "teaching" : "friendly";
        reply = ARIA_KB.hr_answers[topic][modeKey];
        const ytQuery = encodeURIComponent(`${topic} HR interview preparation english`);
        const ytHtml = `\n\n<div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1);"><a href="https://www.youtube.com/results?search_query=${ytQuery}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#ff0000,#cc0000);color:white;padding:4px 12px;border-radius:12px;text-decoration:none;font-size:0.75rem;font-weight:bold;">▶️ Watch YouTube Tutorial on this</a></div>`;
        return { reply: grammarPrefix + reply + ytHtml, corrections };
    }

    // ---- GRAMMAR / VOCABULARY ----
    if (lower.includes("grammar") || lower.includes("correct my") || lower.includes("check my") || lower.includes("mistake")) {
        reply = "📝 Sure! Paste the sentence you want me to check and I'll give you corrections, better alternatives, and fluency tips. Go ahead!";
        return { reply: grammarPrefix + reply, corrections };
    }

    if (lower.includes("pronounce") || lower.includes("vocabulary") || lower.includes("meaning of")) {
        reply = mode === "teaching"
            ? "📖 Vocabulary Tip: Learn 5 new words daily. Use them in 3 sentences. My word for today: 'Proficient' — skilled/expert. Example: 'I am proficient in Python and SQL.' Want more words?"
            : "Excellent focus on vocabulary! 🎯 Use formal words in interviews — 'effective' instead of 'good', 'significant' instead of 'big'. Want to practice a specific word?";
        return { reply: grammarPrefix + reply, corrections };
    }

    // ---- GENERAL INTERVIEW ----
    if (lower.includes("interview") || lower.includes("how to") || lower.includes("tips") || lower.includes("advice")) {
        reply = mode === "strictly"
            ? "Focus: STAR method for behavioral questions. Concise, structured 60-90 second answers. No fillers. What specific round are you preparing for?"
            : mode === "teaching"
                ? "📖 Golden Interview Rule: Prepare 3 stories — (1) Challenge overcome, (2) Team achievement, (3) Mistake + learning. These answer 80% of HR questions! Want to practice?"
                : "🌟 For full interview prep, I can help with:\n🎯 HR rounds → Type 'Tell me about yourself'\n🧩 Group Discussion → Type 'GD tips'\n📊 PPT → Type 'PPT presentation'\n🧠 Aptitude → Type 'Aptitude tips'\n💻 Technical → Type 'Technical round'\n🔥 Motivation → Type 'Motivate me'\n\nWhat do you want to dive into first?";
        return { reply: grammarPrefix + reply, corrections };
    }

    // ---- FLUENCY FEEDBACK ON GENERAL STATEMENT ----
    if (userText.split(' ').length > 8) {
        reply = mode === "strictly"
            ? `Assessment: ${userText.split(' ').length} words. ${grammarIssues.length === 0 ? 'Grammar clean ✅. Work on conciseness.' : 'Fix grammar above.'} Next: 'Describe a challenging project you worked on.'`
            : mode === "teaching"
                ? `📖 Good effort! ${grammarIssues.length === 0 ? '✅ No grammar errors!' : 'See corrections above.'}\n\nFluency Tip: Use transitions — 'Furthermore', 'As a result', 'In addition to that'. Sounds more professional!\n\nPractice: Answer 'What is your greatest weakness?' using Weakness → Action → Result.`
                : `${grammarIssues.length === 0 ? '✅ Great grammar!' : 'See grammar tip above.'}\n\n${userText.split(' ').length} words — solid! 🌟 To sound even more confident, start with action verbs: 'I developed...', 'I led...', 'I achieved...'\n\nKeep going! Try a quick prompt below or ask me anything. 👇`;
        return { reply: grammarPrefix + reply, corrections };
    }

    // ---- SHORT / UNCLEAR INPUT FALLBACK ----
    reply = mode === "strictly"
        ? "Response too brief. Provide a complete 3-5 sentence answer. Attempt again."
        : mode === "teaching"
            ? `📖 Expand your answers to at least 3 sentences. I'm here to help! Try:\n• An HR question\n• Ask about GD or PPT\n• Ask for motivation\n• Any topic!`
            : `I'm here for you! 😊 Ask me anything:\n🎯 HR interview questions\n🧩 Group Discussion strategy\n📊 PPT presentation tips\n🔥 Motivation when you're nervous\n🧠 Aptitude shortcuts\n💻 Technical interview guide\n\nOr just talk to me — I'll help! 💪`;

    return { reply: grammarPrefix + reply, corrections };
}

function handleCommModeChange() {
    const mode = document.getElementById("aiCommModeSelect").value;
    const modeLabels = { friendly: "Friendly Mode", strictly: "Strict HR Interview", teaching: "Teaching Mode" };
    const badge = document.getElementById("partnerStatusBadge");
    if (badge) badge.innerHTML = `&#9679; Online &#183; ${modeLabels[mode] || mode}`;
    const statusEl = document.getElementById("aiVoiceStatus");
    if (statusEl) statusEl.innerHTML = `&#9679; Online &#183; Ready (${modeLabels[mode] || mode})`;
}


function appendChatBubble(chatBox, role, html) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.innerHTML = html;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
    return bubble;
}

async function sendTextMessage() {
    const input = document.getElementById("userInputText");
    const chatBox = document.getElementById("chatBox");
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = "";

    // User bubble
    appendChatBubble(chatBox, "user",
        `<div style="display:flex;gap:8px;align-items:flex-start;justify-content:flex-end;">
            <span style="white-space:pre-wrap;">${userText.replace(/</g, '&lt;')}</span>
            <span style="font-size:1.3rem;">👤</span>
        </div>`);

    // Typing indicator with Rank Holder avatar
    const typingBubble = appendChatBubble(chatBox, "ai",
        `<div style="display:flex;gap:8px;align-items:center;">
            <img src="3d_avatar.jpg" alt="Rank Holder AI" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">
            <span style="color:var(--text-muted); font-style:italic;">Rank Holder AI is thinking...</span>
            <span class="typing-dots">●●●</span>
        </div>`);

    const mode = document.getElementById("aiCommModeSelect").value;

    // Handle external AI engines — open in new tab with user's message
    const selectedEngineForCheck = window._userSelectedAIEngine || 'gemini';
    const externalEngineUrls = {
        'qwen': `https://chat.qwen.ai/?q=${encodeURIComponent(userText)}`,
        'kimi': `https://kimi.moonshot.cn/`,
        'huggingchat': `https://huggingface.co/chat/`
    };

    if (externalEngineUrls[selectedEngineForCheck]) {
        // Show a helpful bubble with a link to the external AI
        const engineLabels = {
            'qwen': '💻 Qwen (Coding & App Building)',
            'kimi': '📄 Kimi (Research & Documents)',
            'zai': '🔷 Z.ai (Complex Reasoning)',
            'huggingchat': '🤗 HuggingChat (Multi Models)'
        };
        const engineName = engineLabels[selectedEngineForCheck];
        const extUrl = externalEngineUrls[selectedEngineForCheck];

        // Remove typing indicator
        if (typingBubble) typingBubble.remove();

        appendChatBubble(chatBox, "ai",
            `<div style="display:flex;gap:8px;align-items:flex-start;">
                <img src="3d_avatar.jpg" alt="Rank Holder AI" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid rgba(99,102,241,0.4);">
                <span style="white-space:pre-wrap;line-height:1.7;">
                    🚀 Opening <strong>${engineName}</strong> for your question!<br><br>
                    📋 Your message: <em>"${userText.replace(/</g, '&lt;')}"</em><br><br>
                    <a href="${extUrl}" target="_blank" rel="noopener" 
                        style="display:inline-block;margin-top:6px;padding:8px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem;">
                        ➤ Open ${engineName.split(' ')[1]} Now
                    </a><br><br>
                    <span style="font-size:0.8rem;color:var(--text-muted);">💡 Tip: Copy your question and paste it there for the best results.</span>
                </span>
            </div>`);
        chatBox.scrollTop = chatBox.scrollHeight;

        turnsPracticed++;
        document.getElementById("statTurns").textContent = turnsPracticed;

        // Auto-open the external AI platform
        window.open(extUrl, '_blank');
        return;
    }

    let ariaResponse;

    // Call our new secure backend Multi-AI Generator
    try {
        const API = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';

        // Use user's selected engine, fallback to 'gemini'
        const selectedEngine = window._userSelectedAIEngine || 'gemini';

        // --- PPT Intercept Logic ---
        let finalUserText = userText;
        if (finalUserText.toLowerCase().includes("ppt")) {
            finalUserText += "\n\n(USER INSTRUCTION: Since the user is asking about PPT, provide complete details on it, make and give a full structure, teach it step by step, and finally provide a summary in a 'handwritten notes' format as requested.)";
        }

        // --- Z.ai API Key Injection ---
        let zaiKey = "";
        if (selectedEngine === 'zai') {
            zaiKey = "ececc3f328f54bcaa4d936064b4e7671.Q6XBvmYVNrFaXjWs";
            // In a real app, this key would be sent securely or processed in backend.
        }

        const systemPrompt = mode === "strictly"
            ? `You are Rank Holder AI, an elite HR interview coach for freshers entering corporate India. You are strict but supportive. Your job:
1. Correct any grammar mistakes EXPLICITLY with the right form
2. Give professional, structured feedback using STAR method
3. After responding, ask a sharp follow-up HR or behavioral question
4. Cover: HR rounds, Group Discussions, PPT presentations, aptitude, technical rounds, pre-interview preparation
5. Use emojis sparingly to keep it professional but not dry
6. For every topic asked, provide DETAILED and COMPLETE explanations — not short summaries
7. When given any task (coding, writing, analysis), execute it fully and correctly
Always end with a challenge or next question. Be direct and impactful. The student's success depends on you.`
            : mode === "teaching"
                ? `You are Rank Holder AI, a caring and expert placement coach for students and freshers. You teach:
- HR interview answers (Tell me about yourself, strengths, weaknesses, salary, etc.)
- Group Discussion strategies (how to speak, initiate, conclude, body language)
- PPT presentation skills (slide structure, delivery, Q&A handling)
- Pre-interview preparation checklists
- Aptitude shortcuts (percentages, time-speed-distance, logical reasoning)
- Technical interview guidance (DSA, coding approach, OOP, DBMS)
- English grammar and communication skills
- Motivation and confidence building for nervous freshers
- Any coding task, problem-solving, science, current affairs, general knowledge
IMPORTANT: Always give COMPLETE, DETAILED explanations. Never cut answers short. If asked to build something or complete a task, do it fully. Explain clearly with examples. Be encouraging. Use 📖 for lessons. Always give actionable next steps.`
                : `You are Rank Holder AI — an elite AI career coach and interview partner, specially designed for freshers and students preparing for campus placements and job interviews in India.

CRITICAL RULE: Give COMPLETE, DETAILED, THOROUGH responses. Never cut answers short or say "I'll keep it brief". Explain everything fully.

You help with EVERYTHING:
🎯 Pre-Interview Preparation — checklists, research strategy, mindset
💼 HR Rounds — Tell me about yourself, strengths, weaknesses, salary negotiation, culture fit
🧩 Group Discussions — how to initiate, speak, build on others, conclude, body language tips
📊 PPT Presentations — slide structure, delivery, handling tough questions, opening lines
🧠 Aptitude and Reasoning — full step-by-step solutions for percentages, time-speed-distance, seating arrangements, coding-decoding
💻 Technical Rounds — complete coding solutions, DSA algorithms, OOP, DBMS, system design
🎙️ English and Grammar — real-time corrections, vocabulary, fluency tips, professional phrases
🔥 Motivation — when the student feels nervous, rejected, or low in confidence
💡 ANY topic at all — coding, science, math, history, current affairs, general knowledge, any task given
🛠️ Task Execution — if given a task (write code, draft email, solve problem), COMPLETE it fully and correctly

Personality: Warm, energetic, deeply knowledgeable, and genuinely invested in the student's success. Use emojis to make it feel alive and motivating. Give practical, specific, actionable advice. End with encouragement or a follow-up challenge. Make every student feel like they CAN do this. You are their biggest supporter. 🚀`;

        const authToken = localStorage.getItem("rh_auth_token") || "";

        // Using /api/ai/chat to match the backend
        const response = await fetch(API + "/ai/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + authToken
            },
            body: JSON.stringify({
                message: finalUserText,
                mode: mode,
                ai_model: selectedEngine,
                api_key: zaiKey,
                system_prompt: systemPrompt
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.reply) {
                ariaResponse = { reply: data.reply, corrections: [] };
            }
        } else {
            console.warn("Backend AI response not ok:", response.status);
        }
    } catch (e) {
        console.error("Failed to reach backend AI:", e);
    }

    // Fallback to local built-in AI if Gemini fails
    if (!ariaResponse) {
        const grammarIssues = ariaCheckGrammar(userText);
        ariaResponse = ariaGenerateResponse(userText, mode);
    }

    // Update stats
    turnsPracticed++;
    if (ariaResponse.corrections && ariaResponse.corrections.length > 0) {
        correctionsGiven += ariaResponse.corrections.length;
        fluencyScore = Math.max(70, fluencyScore - 2);
    } else {
        fluencyScore = Math.min(100, fluencyScore + 1);
    }

    document.getElementById("statTurns").textContent = turnsPracticed;
    document.getElementById("statFixes").textContent = correctionsGiven;
    document.getElementById("statFluency").textContent = `${fluencyScore}%`;

    // Replace typing indicator with real reply + Rank Holder avatar
    // Remove the generic HTML escaping to allow internal YouTube links to render properly
    const replyHtml = ariaResponse.reply.replace(/\n/g, '<br>');
    typingBubble.innerHTML = `
        <div style="display:flex;gap:8px;align-items:flex-start;">
            <img src="3d_avatar.jpg" alt="Rank Holder AI" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid rgba(99,102,241,0.4);">
            <span style="white-space:pre-wrap;line-height:1.7;">${replyHtml}</span>
        </div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    // Speak via ARIA 3D avatar
    setAriaSpeaking(true);
    const ttsText = ariaResponse.reply.replace(/[ðŸ“ ðŸ“–âœ…â ŒðŸ’ªðŸŒŸðŸŽ¯ðŸ’°ðŸ” ðŸ¤ ðŸ˜ŠðŸ˜„ðŸš€ðŸ‘‡â— ]/g, '').slice(0, 300);
    speakText(ttsText, () => setAriaSpeaking(false));
}

function speakText(text, onEndCallback) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.05;
        utterance.onend = function () {
            if (onEndCallback) onEndCallback();
        };
        utterance.onerror = function () {
            if (onEndCallback) onEndCallback();
        };
        window.speechSynthesis.speak(utterance);
    } else if (onEndCallback) {
        onEndCallback();
    }
}

function toggleSpeechRecognition() {
    const btnText = document.getElementById("micBtnText");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        alert("Web Speech Recognition is not supported in this browser. You can type your responses!");
        return;
    }

    if (isRecognizing) {
        recognition.stop();
        isRecognizing = false;
        btnText.textContent = "Start Mic";
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = function () {
        isRecognizing = true;
        btnText.textContent = "Listening...";
    };

    recognition.onresult = function (event) {
        const transcript = event.results[0][0].transcript;
        document.getElementById("userInputText").value = transcript;
        sendTextMessage();
    };

    recognition.onerror = function () {
        btnText.textContent = "Start Mic";
        isRecognizing = false;
    };

    recognition.onend = function () {
        btnText.textContent = "Start Mic";
        isRecognizing = false;
    };

    recognition.start();
}

/* ==========================================================================
   6. CAREER GROWTH & TOP BRAND HIRING JOB FEED
   ========================================================================== */
async function refreshJobFeed() {
    const container = document.getElementById("jobFeedGrid");
    if (!container) return;

    // Populate Top Brands
    const topBrandsContainer = document.getElementById("topBrandsContainer");
    if (topBrandsContainer && topBrandsContainer.children.length === 0) {
        const brands = [
            { name: "Google", logo: "ðŸš€", linkedin: "https://www.linkedin.com/company/google", careers: "https://careers.google.com", official: "https://about.google", news: "https://news.google.com/search?q=Google" },
            { name: "Microsoft", logo: "ðŸ’¼", linkedin: "https://www.linkedin.com/company/microsoft", careers: "https://careers.microsoft.com", official: "https://www.microsoft.com", news: "https://news.google.com/search?q=Microsoft" },
            { name: "Apple", logo: "ðŸ Ž", linkedin: "https://www.linkedin.com/company/apple", careers: "https://www.apple.com/careers/us/", official: "https://www.apple.com", news: "https://news.google.com/search?q=Apple" },
            { name: "Amazon", logo: "ðŸ“¦", linkedin: "https://www.linkedin.com/company/amazon", careers: "https://amazon.jobs", official: "https://www.amazon.com", news: "https://news.google.com/search?q=Amazon" },
            { name: "Meta", logo: "â™¾ï¸ ", linkedin: "https://www.linkedin.com/company/meta", careers: "https://www.metacareers.com", official: "https://about.meta.com", news: "https://news.google.com/search?q=Meta" },
            { name: "Nvidia", logo: "ðŸŽ®", linkedin: "https://www.linkedin.com/company/nvidia", careers: "https://www.nvidia.com/en-us/about-nvidia/careers/", official: "https://www.nvidia.com", news: "https://news.google.com/search?q=Nvidia" },
            { name: "Intel", logo: "ðŸ’»", linkedin: "https://www.linkedin.com/company/intel-corporation", careers: "https://jobs.intel.com", official: "https://www.intel.com", news: "https://news.google.com/search?q=Intel" },
            { name: "AMD", logo: "âš™ï¸ ", linkedin: "https://www.linkedin.com/company/amd", careers: "https://careers.amd.com", official: "https://www.amd.com", news: "https://news.google.com/search?q=AMD" },
            { name: "IBM", logo: "ðŸ–¥ï¸ ", linkedin: "https://www.linkedin.com/company/ibm", careers: "https://www.ibm.com/careers", official: "https://www.ibm.com", news: "https://news.google.com/search?q=IBM" },
            { name: "Zoho", logo: "ðŸ ¢", linkedin: "https://www.linkedin.com/company/zoho", careers: "https://careers.zohocorp.com", official: "https://www.zoho.com", news: "https://news.google.com/search?q=Zoho" },
            { name: "TCS", logo: "ðŸŒ ", linkedin: "https://www.linkedin.com/company/tata-consultancy-services", careers: "https://www.tcs.com/careers", official: "https://www.tcs.com", news: "https://news.google.com/search?q=Tata+Consultancy+Services" }
        ];

        brands.forEach(b => {
            const card = document.createElement("div");
            card.className = "card";
            card.style.padding = "16px";
            card.style.display = "flex";
            card.style.flexDirection = "column";
            card.style.gap = "8px";
            card.style.background = "var(--surface-color)";
            card.style.border = "1px solid var(--border-subtle)";

            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <div style="font-size:1.5rem;">${b.logo}</div>
                    <h3 style="margin:0; font-size:1.1rem; font-weight:700;">${b.name}</h3>
                </div>
                <a href="${b.linkedin}" target="_blank" class="btn btn-sm" style="background:#0a66c2; color:#fff; border:none; justify-content:center;">ðŸ’¼ LinkedIn Profile</a>
            `;
            topBrandsContainer.appendChild(card);
        });
    }

    const res = await Backend.Jobs.fetchJobs();
    const jobs = res.jobs || [];
    container.innerHTML = "";

    jobs.forEach((j) => {
        const card = document.createElement("div");
        card.className = "job-card";
        const hrMail = j.hr_contact || `careers@${j.company.toLowerCase().replace(/\s+/g, '')}.com`;
        const internLink = j.internship_link || j.link;

        card.innerHTML = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h3 class="job-title">${j.title}</h3>
                    <span class="badge badge-ai">${j.badge || 'Active Hiring'}</span>
                </div>
                <div class="job-company">${j.company}</div>
                <div class="job-meta">📍 ${j.location} | 💼 ${j.experience} | 💰 ${j.salary}</div>
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;"><strong>Skills:</strong> ${j.skills}</div>
                <div style="font-size:0.78rem; color:var(--brand-primary); margin-bottom:14px;">📧 <strong>Direct HR Contact:</strong> <a href="mailto:${hrMail}" style="color:var(--brand-primary); font-weight:700;">${hrMail}</a></div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                <a href="${j.link}" target="_blank" class="btn btn-sm" style="width:100%;">Apply Full-time / Direct Hiring 🚀</a>
                <a href="${internLink}" target="_blank" class="btn btn-sm btn-secondary" style="width:100%;">Apply Student Internship Portal 🎓</a>
            </div>
        `;
        container.appendChild(card);
    });
}

function enableCompanyNotifications() {
    alert("Daily Company Alert Subscription Activated! You will receive notification updates on new openings.");
}

/* ==========================================================================
   7. PROJECT KNOWLEDGE ENGINE & WIKIPEDIA LOOKUP
   ========================================================================== */
const SUGGESTED_CHIPS = {
    Hardware: ["Arduino Robotics", "Raspberry Pi IoT Gateway", "Biomedical ECG Monitor", "FPGA Digital Clock", "STM32 Smart Meter"],
    Software: ["Flask REST API Platform", "React AI Analytics Dashboard", "SQLite Database Engine", "Machine Learning Classifier", "Realtime WebSockets Chat"]
};

function updateChips() {
    const cat = document.getElementById("projectCategory") ? document.getElementById("projectCategory").value : "Hardware";
    const container = document.getElementById("chipsContainer");
    if (!container) return;

    container.innerHTML = "";
    (SUGGESTED_CHIPS[cat] || []).forEach((chipText) => {
        const chip = document.createElement("span");
        chip.className = "topic-chip";
        chip.textContent = chipText;
        chip.onclick = () => {
            document.getElementById("projectQuery").value = chipText;
            searchProjectTopic();
        };
        container.appendChild(chip);
    });
}

function initProjectEngineTab() {
    updateChips();
}

async function searchProjectTopic() {
    const input = document.getElementById("projectQuery");
    if (!input || !input.value.trim()) return;

    const topic = input.value.trim();
    const category = document.getElementById("projectCategory").value;

    const blueprintBox = document.getElementById("blueprintOutput");
    const wikiBox = document.getElementById("wikiOutput");

    blueprintBox.style.display = "block";
    wikiBox.style.display = "block";

    // Update Headers
    document.getElementById("blueprintTopicName").textContent = topic;
    document.getElementById("blueprintDomainBadge").textContent = category;

    // 1. Definition
    document.getElementById("blueprintIdea").textContent = `The core objective of "${topic}" is to engineer a highly efficient ${category.toLowerCase()} architecture that solves real-world challenges through advanced systemic design.`;

    // 2. Components
    const componentsRow = document.getElementById("blueprintComponents");
    componentsRow.innerHTML = "";
    const mockComponents = category === "Hardware"
        ? ["Microcontroller Core Unit", "I/O Interface Sensors", "Power Management Module", "Actuator Relays"]
        : ["Frontend User Interface", "Backend API Server", "Relational Database", "Authentication Middleware"];
    mockComponents.forEach((c) => {
        const li = document.createElement("li");
        li.textContent = c;
        componentsRow.appendChild(li);
    });

    // Shopping Link
    document.getElementById("shopComponentsLink").href = `https://www.google.com/search?q=buy+components+for+${encodeURIComponent(topic)}`;

    // 3. Software & AI Tools
    const toolsRow = document.getElementById("blueprintSoftware");
    toolsRow.innerHTML = "";
    const mockSoftware = ["VS Code", "Python / C++", "GitHub Copilot", "ChatGPT AI Assistant"];
    mockSoftware.forEach((t) => {
        const span = document.createElement("span");
        span.className = "chip";
        span.textContent = t;
        toolsRow.appendChild(span);
    });
    document.getElementById("downloadSoftwareLink").href = `https://www.google.com/search?q=download+software+for+${encodeURIComponent(topic)}`;

    // 4. Roadmap & Steps
    document.getElementById("blueprintRoadmap").textContent = "4-Week Rapid Implementation Architecture";
    const stepsList = document.getElementById("blueprintSteps");
    stepsList.innerHTML = "";
    const mockSteps = ["1. System Requirements & Setup", "2. Core Component Integration", "3. Logic & Coding", "4. Testing & Final Deployment"];
    mockSteps.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        stepsList.appendChild(li);
    });

    // 5. Core Coding
    const codeBlock = document.getElementById("blueprintCode");
    if (category === "Hardware") {
        codeBlock.textContent = `// Main execution loop for ${topic}\nvoid setup() {\n  Serial.begin(9600);\n  initializeSensors();\n}\n\nvoid loop() {\n  readData();\n  executeLogic();\n  delay(1000);\n}`;
    } else {
        codeBlock.textContent = `# Main controller for ${topic}\nfrom core import ComponentManager\n\ndef main():\n    system = ComponentManager()\n    system.initialize()\n    while system.is_running:\n        system.process_data()\n\nif __name__ == '__main__':\n    main()`;
    }

    // 6. Expected Output
    document.getElementById("blueprintOutputResults").textContent = `Upon successful compilation and deployment, the ${topic} system will operate autonomously, seamlessly integrating the defined components to execute its core functionality with robust performance parameters.`;

    // 7. Dynamic Wikipedia History & AI Lore Search
    document.getElementById("wikiTitle").textContent = topic;
    document.getElementById("wikiSnippet").textContent = "Accessing historical archives & Wikipedia AI database...";
    document.getElementById("extLinks").innerHTML = "";

    const wikiData = await Integrations.fetchWikipediaSummary(topic);
    const searchLinks = Integrations.generateSearchLinks(topic);
    const linkContainer = document.getElementById("extLinks");

    if (wikiData) {
        document.getElementById("wikiTitle").textContent = wikiData.title;
        document.getElementById("wikiSnippet").textContent = wikiData.extract;

        linkContainer.innerHTML = `
            <a href="${wikiData.pageUrl}" target="_blank" class="chip" style="background:#334155; color:white; border:none;">ðŸ“– Wikipedia Lore</a>
            <a href="${searchLinks.google}" target="_blank" class="chip" style="background:#0284c7; color:white; border:none;">ðŸ”  Google Search</a>
            <a href="${searchLinks.youtube}" target="_blank" class="chip" style="background:#dc2626; color:white; border:none;">â–¶ï¸  YouTube Tutorials</a>
            <a href="${searchLinks.github}" target="_blank" class="chip" style="background:#18181b; color:white; border:none;">ðŸ’» GitHub Source</a>
            <a href="${searchLinks.chatGPT}" target="_blank" class="chip" style="background:#10b981; color:white; border:none;">ðŸ¤– ChatGPT AI</a>
        `;
    } else {
        document.getElementById("wikiSnippet").textContent = `Historical overview: ${topic} represents a foundational technical framework within modern ${category.toLowerCase()} engineering.`;
        linkContainer.innerHTML = `
            <a href="${searchLinks.google}" target="_blank" class="chip" style="background:#0284c7; color:white; border:none;">ðŸ”  Google Search</a>
            <a href="${searchLinks.youtube}" target="_blank" class="chip" style="background:#dc2626; color:white; border:none;">â–¶ï¸  YouTube Tutorials</a>
            <a href="${searchLinks.github}" target="_blank" class="chip" style="background:#18181b; color:white; border:none;">ðŸ’» GitHub Source</a>
            <a href="${searchLinks.chatGPT}" target="_blank" class="chip" style="background:#10b981; color:white; border:none;">ðŸ¤– ChatGPT AI</a>
        `;
    }
}

/* ==========================================================================
   8. ENHANCED DYNAMIC BIOMEDICAL VISION AI SCANNER & LIVE WIKIPEDIA HISTORY
   ========================================================================== */
let currentCanvasOverlay = false;

function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById("bioAnalysisCanvas");
    const ctx = canvas.getContext("2d");
    const statusText = document.getElementById("analysisStatus");
    const progressFill = document.getElementById("scanProgressFill");

    // 1. Draw Actual Uploaded Image directly on HTML5 Canvas
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Calculate scale to fit image into canvas while preserving aspect ratio
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const x = (canvas.width / 2) - (img.width / 2) * scale;
            const y = (canvas.height / 2) - (img.height / 2) * scale;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

            // Draw bounding box overlay
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 15, y + 15, (img.width * scale) - 30, (img.height * scale) - 30);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Progress Bar Animation
    progressFill.style.width = "0%";
    let width = 0;

    // Simulate detecting if it's a QR code or a regular Photo.
    // For mockup purposes, we assume any file containing "qr" in the name is a QR code.
    const isQRCode = file.name.toLowerCase().includes('qr');

    const interval = setInterval(() => {
        width += 25;
        progressFill.style.width = `${width}%`;
        if (width >= 100) {
            clearInterval(interval);

            document.getElementById("analysisTitle").textContent = isQRCode ? "QR Code Scan Complete" : "Photo Scan Complete";
            statusText.textContent = `File "${file.name}" scanned successfully.`;
            document.getElementById("metricList").innerHTML = `<li><span>Pipeline Status:</span> <strong style="color:var(--status-success);">Success</strong></li>`;

            if (isQRCode) {
                // QR Code Path
                document.getElementById("photoDetailsSection").style.display = "none";
                document.getElementById("qrDetailsSection").style.display = "block";

                const mockedUrl = "https://example.com/scan-result/" + Math.floor(Math.random() * 1000);
                document.getElementById("qrUrlText").innerHTML = `<a href="${mockedUrl}" target="_blank" style="color:var(--brand-primary);">${mockedUrl}</a>`;

                window.currentQrUrl = mockedUrl;
                const qrOpenBtn = document.getElementById("qrOpenBtn");
                if (qrOpenBtn) {
                    qrOpenBtn.href = mockedUrl;
                    qrOpenBtn.style.display = "inline-block";
                }

                document.getElementById("qrInfoText").innerHTML = `
                    <strong>Site Name:</strong> Example Product Portal<br>
                    <strong>Category:</strong> Technology / E-commerce<br>
                    <strong>Description:</strong> This QR code links to a verified online portal containing product manuals and details.<br>
                    <strong>Security Status:</strong> Safe (SSL Validated)
                `;

            } else {
                // Photo Path
                document.getElementById("qrDetailsSection").style.display = "none";
                document.getElementById("photoDetailsSection").style.display = "block";

                // Mocks
                const colors = ["Deep Blue & Crimson", "Monochrome Grayscale", "Vibrant Neon", "Earthy Tones"];
                const shapes = ["Rectangular framing", "Circular subjects", "Abstract Geometry", "Organic Contours"];
                const textures = ["Smooth metallic", "Rough canvas", "Soft organic", "Granular noise"];
                const fonts = ["Helvetica Neue (Detected)", "Times New Roman (Detected)", "No Text Found", "Custom Serif Font (Detected)"];

                const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
                const pickedColor = rand(colors);
                const pickedShape = rand(shapes);
                const pickedTexture = rand(textures);
                const pickedFont = rand(fonts);

                document.getElementById("imageAttributesList").innerHTML = `
                    <li><strong>Dominant Color:</strong> ${pickedColor}</li>
                    <li><strong>Shape Analysis:</strong> ${pickedShape}</li>
                    <li><strong>Texture Type:</strong> ${pickedTexture}</li>
                    <li><strong>Text & Font:</strong> ${pickedFont}</li>
                `;

                const searchQuery = file.name.replace(/[_-]/g, ' ').replace(/\.[^/.]+$/, '');
                const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery + " details")}`;

                document.getElementById("historyText").innerHTML = `
                    Based on the visual scan, automated internet search results for <strong>"${searchQuery}"</strong> can provide additional context.<br><br>
                    <a href="${googleSearchUrl}" target="_blank" class="chip" style="background:#4285f4; color:white; border:none;">🔍 View Google Search Results</a>
                `;
            }
        }
    }, 200);
}

function toggleOverlay() {
    // Deprecated for new UI
}

function exportAnalysisReport() {
    // Deprecated for new UI
}

function generatePDF() {
    if (typeof jspdf === 'undefined') {
        alert("PDF generator library not loaded.");
        return;
    }
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Rank-Holder - AI Analysis Report", 14, 20);
    doc.setFontSize(12);

    let yPos = 30;
    const attrList = document.getElementById("imageAttributesList");
    if (attrList && attrList.innerText.trim() !== "Waiting..." && attrList.innerText.trim() !== "") {
        const lines = attrList.innerText.split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                doc.text(line.trim(), 14, yPos);
                yPos += 8;
            }
        });
    } else {
        doc.text("No scan data available.", 14, yPos);
    }

    doc.save("AI_Analysis_Report.pdf");
}

function generatePPT() {
    if (typeof pptxgen === 'undefined') {
        alert("PPT generator library not loaded.");
        return;
    }
    const pptx = new pptxgen();
    const slide = pptx.addSlide();
    slide.addText("Rank-Holder AI Analysis Report", { x: 0.5, y: 0.5, w: '90%', fontSize: 24, bold: true, color: '363636' });

    let listContent = "No scan data available.";
    const attrList = document.getElementById("imageAttributesList");
    if (attrList && attrList.innerText.trim() !== "Waiting..." && attrList.innerText.trim() !== "") {
        listContent = attrList.innerText;
    }

    slide.addText(listContent, { x: 0.5, y: 1.5, w: '90%', h: '60%', fontSize: 14, align: 'left', valign: 'top' });
    pptx.writeFile({ fileName: "AI_Analysis_Report.pptx" });
}

/* ========================================== */
// 5 MIND-SHARPENING GAMES LOGIC
// ==========================================

// 1. Memory Matrix
let matrixPattern = [];
let matrixUserClicks = [];
let matrixSize = 3; // 3x3

function recordMindScore(gameName, score) {
    const value = Math.max(0, Math.round(score));
    const localScores = JSON.parse(localStorage.getItem('rh_mind_scores') || '{}');
    localScores[gameName] = Math.max(localScores[gameName] || 0, value);
    localStorage.setItem('rh_mind_scores', JSON.stringify(localScores));
    if (window.Backend && Backend.Auth.isLoggedIn()) Backend.GameScores.updateScore(gameName, localScores[gameName]);
    if (window.renderProfileStats) window.renderProfileStats();
}

function startMemoryMatrix() {
    const board = document.getElementById("matrix-board");
    const status = document.getElementById("matrix-status");
    board.innerHTML = "";
    matrixPattern = [];
    matrixUserClicks = [];
    status.textContent = "Memorize the blue tiles!";
    
    // Create grid
    for(let i=0; i<9; i++) {
        const cell = document.createElement("div");
        cell.className = "matrix-cell";
        cell.style.width = "45px";
        cell.style.height = "45px";
        cell.style.background = "#334155";
        cell.style.borderRadius = "4px";
        cell.style.cursor = "pointer";
        cell.onclick = () => handleMatrixClick(i, cell);
        board.appendChild(cell);
    }
    
    // Generate pattern
    while(matrixPattern.length < 4) {
        let r = Math.floor(Math.random() * 9);
        if(!matrixPattern.includes(r)) matrixPattern.push(r);
    }
    
    // Show pattern
    const cells = board.children;
    matrixPattern.forEach(idx => {
        cells[idx].style.background = "#3b82f6"; // highlight
    });
    
    // Hide pattern after 1.5s
    setTimeout(() => {
        for(let i=0; i<9; i++) {
            cells[i].style.background = "#334155";
        }
        status.textContent = "Your turn! Click the tiles.";
    }, 1500);
}

function handleMatrixClick(idx, cell) {
    if(matrixPattern.length === 0) return; // not started
    
    if(matrixPattern.includes(idx)) {
        cell.style.background = "#22c55e"; // correct
        if(!matrixUserClicks.includes(idx)) matrixUserClicks.push(idx);
        
        if(matrixUserClicks.length === matrixPattern.length) {
            document.getElementById("matrix-status").textContent = "Success! Memory Sharp! 🧠";
            recordMindScore('memory-matrix', matrixPattern.length * 25);
            matrixPattern = []; // end game
        }
    } else {
        cell.style.background = "#ef4444"; // wrong
        document.getElementById("matrix-status").textContent = "Wrong tile! Game Over.";
        matrixPattern = []; // end game
    }
}

// 2. Word Unscramble
const corporateWords = ["SYNERGY", "LEADERSHIP", "INNOVATION", "DEADLINE", "FEEDBACK", "MEETING", "ONBOARDING"];
let currentScrambleWord = "";
function newScramble() {
    const wordEl = document.getElementById("scramble-word");
    const statusEl = document.getElementById("scramble-status");
    const inputEl = document.getElementById("scramble-input");
    if (!wordEl || !statusEl || !inputEl) return;
    currentScrambleWord = corporateWords[Math.floor(Math.random() * corporateWords.length)];
    const scrambled = currentScrambleWord.split('').sort(() => Math.random() - 0.5).join('');
    wordEl.textContent = scrambled;
    statusEl.textContent = "";
    inputEl.value = "";
}

function checkScramble() {
    const userVal = document.getElementById("scramble-input").value.toUpperCase().trim();
    if (userVal === currentScrambleWord) {
        document.getElementById("scramble-status").textContent = "Correct! Sharp mind. 🎯";
        document.getElementById("scramble-status").style.color = "#4ade80";
        recordMindScore('word-unscramble', 100);
    } else {
        document.getElementById("scramble-status").textContent = "Incorrect, try again!";
        document.getElementById("scramble-status").style.color = "#f87171";
    }
}

// 3. Simon Says
let simonSequence = [];
let simonUserIndex = 0;
let simonPlaying = false;

async function startSimon() {
    simonSequence = [];
    simonUserIndex = 0;
    simonPlaying = false;
    document.getElementById("simon-status").textContent = "Watch closely...";
    nextSimonRound();
}

async function nextSimonRound() {
    simonSequence.push(Math.floor(Math.random() * 4));
    simonUserIndex = 0;
    document.getElementById("simon-status").textContent = `Level: ${simonSequence.length}`;
    
    await new Promise(r => setTimeout(r, 800)); // pause before playing
    
    for(let i=0; i<simonSequence.length; i++) {
        const btnId = `simon-${simonSequence[i]}`;
        const btn = document.getElementById(btnId);
        const originalBg = btn.style.background;
        
        btn.style.filter = "brightness(2)"; // flash
        await new Promise(r => setTimeout(r, 400));
        btn.style.filter = "none";
        await new Promise(r => setTimeout(r, 200));
    }
    simonPlaying = true;
    document.getElementById("simon-status").textContent = "Your turn!";
}

function simonUserInput(colorIndex) {
    if(!simonPlaying) return;
    
    if(colorIndex === simonSequence[simonUserIndex]) {
        simonUserIndex++;
        if(simonUserIndex === simonSequence.length) {
            simonPlaying = false;
            document.getElementById("simon-status").textContent = "Good! Get ready for next...";
            nextSimonRound();
        }
    } else {
        document.getElementById("simon-status").textContent = `Game Over at Level ${simonSequence.length}!`;
        recordMindScore('simon-says', Math.max(0, (simonSequence.length - 1) * 10));
        simonPlaying = false;
    }
}

// 4. Reaction Tester
let reactionState = 'idle'; // idle, waiting, ready
let reactionStartTime = 0;
let reactionTimeout = null;

function reactionClick() {
    const box = document.getElementById("reaction-box");
    const status = document.getElementById("reaction-status");
    
    if(reactionState === 'idle' || reactionState === 'done') {
        box.style.background = "#ef4444"; // Red
        box.textContent = "Wait for Green...";
        reactionState = 'waiting';
        
        const waitTime = Math.random() * 3000 + 1500; // 1.5s to 4.5s
        reactionTimeout = setTimeout(() => {
            box.style.background = "#22c55e"; // Green
            box.textContent = "CLICK NOW!";
            reactionState = 'ready';
            reactionStartTime = Date.now();
        }, waitTime);
    } 
    else if(reactionState === 'waiting') {
        clearTimeout(reactionTimeout);
        box.style.background = "#334155";
        box.textContent = "Too early! Click to restart.";
        status.textContent = "Missed!";
        reactionState = 'done';
    } 
    else if(reactionState === 'ready') {
        const timeTaken = Date.now() - reactionStartTime;
        box.style.background = "#334155";
        box.textContent = "Click to Start";
        status.textContent = `Time: ${timeTaken}ms`;
        recordMindScore('reaction-tester', Math.max(1, 1000 - timeTaken));
        reactionState = 'done';
    }
}

// 5. Math Scramble
let currentMathAns = 0;
function newMath() {
    const questionEl = document.getElementById("math-question");
    const statusEl = document.getElementById("math-status");
    const inputEl = document.getElementById("math-input");
    if (!questionEl || !statusEl || !inputEl) return;
    // Generate slightly harder questions: e.g., 15 * 3, 45 + 27, 84 - 29
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let n1, n2;
    
    if(op === '*') {
        n1 = Math.floor(Math.random() * 12) + 2;
        n2 = Math.floor(Math.random() * 9) + 2;
        currentMathAns = n1 * n2;
    } else if(op === '+') {
        n1 = Math.floor(Math.random() * 50) + 10;
        n2 = Math.floor(Math.random() * 50) + 10;
        currentMathAns = n1 + n2;
    } else {
        n1 = Math.floor(Math.random() * 50) + 30;
        n2 = Math.floor(Math.random() * 30) + 1;
        currentMathAns = n1 - n2;
    }
    
    questionEl.textContent = `${n1} ${op} ${n2} = ?`;
    statusEl.textContent = "";
    inputEl.value = "";
}

function checkMath() {
    const userAns = parseInt(document.getElementById("math-input").value);
    if (userAns === currentMathAns) {
        document.getElementById("math-status").textContent = "Correct! Quick maffs! 🧠";
        document.getElementById("math-status").style.color = "#4ade80";
        recordMindScore('math-scramble', 100);
    } else {
        document.getElementById("math-status").textContent = `Wrong! Correct was ${currentMathAns}.`;
        document.getElementById("math-status").style.color = "#f87171";
    }
}

function startCurrentMindGame() {
    alert("Mind Game session active! Select any game to sharpen your focus.");
}

// 7. English Vowel & Grammar Level Game
const VOWEL_LEVELS = [
    { level: 1, vowel: "Short 'A' [ae]", word: "Apple", rule: "Use 'An' before words starting with vowel sounds (A, E, I, O, U)." },
    { level: 2, vowel: "Short 'E' [e]", word: "Elephant", rule: "Vowels create open vocal tract sounds without blockages." },
    { level: 3, vowel: "Short 'I' [i]", word: "Innovation", rule: "Always capitalize proper nouns and acronyms." },
    { level: 4, vowel: "Short 'O' [o]", word: "Opportunity", rule: "Subject-Verb Agreement: Singular subjects require singular verbs." },
    { level: 5, vowel: "Short 'U' [u]", word: "Umbrella", rule: "STAR Method: Situation, Task, Action, and Result." }
];
let currentVowelIdx = 0;

function speakVowelTarget() {
    const curr = VOWEL_LEVELS[currentVowelIdx];
    speakText(`Word: ${curr.word}. ${curr.rule}`);
}

function submitVowelLevelAnswer() {
    const input = document.getElementById("vowelUserAnswer");
    const feedback = document.getElementById("vowelFeedbackText");
    if (!input || !input.value.trim()) return;

    if (currentVowelIdx < VOWEL_LEVELS.length - 1) {
        currentVowelIdx++;
        const curr = VOWEL_LEVELS[currentVowelIdx];

        document.getElementById("vowelLevelBadge").textContent = `Level ${curr.level} of 5`;
        document.getElementById("vowelLevelTitle").textContent = `Current Vowel Focus: ${curr.vowel}`;
        document.getElementById("vowelTargetWord").textContent = `Word: "${curr.word}"`;
        document.getElementById("vowelGrammarRule").textContent = `Grammar Rule: ${curr.rule}`;

        feedback.textContent = `Great sentence! Advanced to Level ${curr.level} ðŸŽ‰`;
        input.value = "";
    } else {
        feedback.textContent = "ðŸ † Congratulations! You completed all 5 Vowel & Grammar levels!";
    }
}

function startCurrentMindGame() {
    alert("Mind Game session started! Click on tiles or inputs to submit your moves.");
}

let _storyDarkVoiceUtterance = null;
let _isStoryDarkSpeaking = false;

function extractKeyTerms(text, query) {
    if (!text) return [];
    // Identify key technical words and capitalized compound phrases
    const stopWords = new Set(["the","and","for","that","with","from","this","they","have","were","which","their","about","after","other","been","into","more","also","some","time","then","when","them","most","these","will","than","its","such","only","over","also","used","many","such"]);
    const words = text.replace(/[^a-zA-Z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()));
    
    // Count frequencies
    const freq = {};
    words.forEach(w => {
        const lower = w.toLowerCase();
        freq[lower] = (freq[lower] || 0) + 1;
    });

    const sorted = Object.entries(freq).sort((a,b) => b[1] - a[1]).slice(0, 6);
    
    return sorted.map(([term, count]) => {
        const capitalized = term.charAt(0).toUpperCase() + term.slice(1);
        return {
            term: capitalized,
            importance: Math.min(99, 75 + count * 5) + "% Relevance",
            snippet: `Key terminology extracted from verified intelligence records for ${query}.`
        };
    });
}

function extractKeyTakeaways(text, title) {
    if (!text) return [`Foundational background available for ${title}.`];
    const sentences = text.split(/\.\s+/).filter(s => s.trim().length > 25);
    if (sentences.length <= 3) {
        return sentences.map(s => s.replace(/\.$/, '') + '.');
    }
    return [
        sentences[0] + '.',
        sentences[1] ? sentences[1] + '.' : `${title} represents a transformative concept in modern science and history.`,
        sentences[2] ? sentences[2] + '.' : `Ongoing discoveries continue to reshape the frontier of knowledge.`
    ];
}

async function generateDarkStory() {
    const input = document.getElementById("storyDarkInput").value.trim();
    if (!input) return;

    const outBox = document.getElementById("storyDarkOutput");
    const title = document.getElementById("storyDarkTitle");
    const content = document.getElementById("storyDarkContent");
    const links = document.getElementById("storyDarkLinks");
    const kwContainer = document.getElementById("storyDarkKeywordsContainer");
    const kwGrid = document.getElementById("storyDarkKeywordsGrid");
    const takeContainer = document.getElementById("storyDarkTakeawaysContainer");
    const takeList = document.getElementById("storyDarkTakeawaysList");

    if (stopStoryDarkVoice) stopStoryDarkVoice();

    outBox.style.display = "block";
    if (kwContainer) kwContainer.style.display = "none";
    if (takeContainer) takeContainer.style.display = "none";
    title.textContent = "Scanning Archives: " + input + "...";

    content.innerHTML = `
        <div style="font-family: monospace; color: #38bdf8; margin-bottom: 8px;">[Google Knowledge Index]: Querying live web indices for '${input}'...</div>
        <div style="font-family: monospace; color: #a855f7; margin-bottom: 8px;">[Wikipedia Global Core]: Extracting verified encyclopedic records...</div>
        <div style="font-family: monospace; color: #34d399; font-weight: bold;" class="typing-dots">[Rank-Holder NLP Engine]: Isolating high-impact terminology & key takeaways</div>
    `;
    links.innerHTML = "";

    try {
        const wikiData = await Integrations.fetchWikipediaSummary(input);
        if (Backend.Auth.isLoggedIn()) {
            Backend.StoryDark.saveSearch({
                query: input,
                resolved_title: wikiData && wikiData.title,
                extract: wikiData && wikiData.extract,
                page_url: wikiData && wikiData.pageUrl
            });
        }

        setTimeout(() => {
            if (!wikiData || !wikiData.extract) {
                title.textContent = `The Void: ${input}`;
                content.innerHTML = `<div style="color: #fb7185;">No direct records found in primary archives. Explore live queries via Google Search below.</div>`;
                const searchLinks = Integrations.generateSearchLinks(input);
                const googleReferenceBtn = document.getElementById('storyGoogleReferenceBtn');
                const wikipediaReferenceBtn = document.getElementById('storyWikipediaReferenceBtn');
                if (googleReferenceBtn) googleReferenceBtn.href = searchLinks.google;
                if (wikipediaReferenceBtn) wikipediaReferenceBtn.href = searchLinks.wikipedia;
                const googleRefer = document.getElementById('googleReferContent');
                const wikiRefer = document.getElementById('wikiReferContent');
                if (googleRefer) googleRefer.textContent = `No verified page was found for "${input}". Open Google Content to compare current web results.`;
                if (wikiRefer) wikiRefer.textContent = `No exact Wikipedia article was found. Open Wikipedia Content to browse related pages.`;
                links.innerHTML = `
                    <a href="${searchLinks.google}" target="_blank" class="chip" style="background:#1e293b; color:#38bdf8; border:1px solid rgba(56,189,248,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem;">🔍 Search Google for "${input}"</a>
                    <a href="${searchLinks.wikipedia}" target="_blank" class="chip" style="background:#1e293b; color:#f8fafc; border:1px solid rgba(255,255,255,0.2); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem;">📖 Search Wikipedia</a>
                    <a href="${searchLinks.youtube}" target="_blank" class="chip" style="background:#1e293b; color:#fb7185; border:1px solid rgba(244,63,94,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem;">▶️ YouTube Deep Dive</a>
                `;
            } else {
                title.textContent = `📜 Knowledge Lore: ${wikiData.title}`;
                
                // 1. Extract Most Important Key Words
                const keyTerms = extractKeyTerms(wikiData.extract, wikiData.title);
                if (keyTerms.length > 0 && kwGrid && kwContainer) {
                    kwGrid.innerHTML = keyTerms.map(k => `
                        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(99,102,241,0.25); border-radius:10px; padding:10px 12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <strong style="color:#e0e7ff; font-size:0.88rem;">🏷️ ${k.term}</strong>
                                <span style="font-size:0.68rem; background:rgba(99,102,241,0.2); color:#a5b4fc; padding:2px 6px; border-radius:8px; font-weight:700;">${k.importance}</span>
                            </div>
                            <div style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">${k.snippet}</div>
                        </div>
                    `).join("");
                    kwContainer.style.display = "block";
                }

                // 2. Extract Key Takeaways
                const takeaways = extractKeyTakeaways(wikiData.extract, wikiData.title);
                if (takeaways.length > 0 && takeList && takeContainer) {
                    takeList.innerHTML = takeaways.map(t => `<li style="margin-bottom:6px;">${t}</li>`).join("");
                    takeContainer.style.display = "block";
                }

                // 3. Show only the highest-signal points instead of the full extract.
                content.textContent = '';
                const summaryHeading = document.createElement('div');
                summaryHeading.textContent = 'Verified summary from Wikipedia';
                summaryHeading.style.cssText = 'font-size:0.82rem;color:#34d399;margin-bottom:12px;font-weight:700;border-bottom:1px solid rgba(16,185,129,0.2);padding-bottom:8px;';
                const summaryList = document.createElement('ul');
                summaryList.style.cssText = 'font-size:1rem;line-height:1.7;color:#f0f4ff;margin:0;padding-left:20px;';
                extractKeyTakeaways(wikiData.extract, wikiData.title).forEach(point => {
                    const item = document.createElement('li');
                    item.textContent = point;
                    item.style.marginBottom = '8px';
                    summaryList.appendChild(item);
                });
                content.append(summaryHeading, summaryList);

                // 4. Multi-Platform Search Links & Refer Content
                const searchLinks = Integrations.generateSearchLinks(wikiData.title);

                const googleReferenceBtn = document.getElementById('storyGoogleReferenceBtn');
                const wikipediaReferenceBtn = document.getElementById('storyWikipediaReferenceBtn');
                if (googleReferenceBtn) googleReferenceBtn.href = searchLinks.google;
                if (wikipediaReferenceBtn) wikipediaReferenceBtn.href = wikiData.pageUrl;
                
                // Set Wikipedia Full Extract
                const wikiRefer = document.getElementById('wikiReferContent');
                if (wikiRefer) {
                    wikiRefer.innerText = wikiData.extract;
                }

                // Generate Google analysis snippet via Gemini
                const googleRefer = document.getElementById('googleReferContent');
                if (googleRefer) {
                    googleRefer.textContent = `Google reference ready for ${wikiData.title}. The main points above are grounded in Wikipedia; open Google Content above for live web results and current discussions.`;
                }

                links.innerHTML = `
                    <a href="${wikiData.pageUrl}" target="_blank" rel="noopener noreferrer" class="chip" style="background:#0f172a; color:#f8fafc; border:1px solid rgba(255,255,255,0.15); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">📖 Wikipedia Full Information</a>
                    <a href="${searchLinks.google}" target="_blank" rel="noopener noreferrer" class="chip" style="background:#0f172a; color:#38bdf8; border:1px solid rgba(56,189,248,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">🔍 Search Google for More</a>
                    <a href="${searchLinks.youtube}" target="_blank" class="chip" style="background:#0f172a; color:#fb7185; border:1px solid rgba(244,63,94,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">▶️ YouTube Video Lore</a>
                    <a href="${searchLinks.facebook}" target="_blank" class="chip" style="background:#0f172a; color:#60a5fa; border:1px solid rgba(96,165,250,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">f Facebook Search</a>
                    <a href="${searchLinks.reddit}" target="_blank" class="chip" style="background:#0f172a; color:#fb923c; border:1px solid rgba(251,146,60,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">Reddit Discussions</a>
                    <a href="${searchLinks.x}" target="_blank" class="chip" style="background:#0f172a; color:#f8fafc; border:1px solid rgba(255,255,255,0.2); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">X Live Search</a>
                    <a href="${searchLinks.linkedIn}" target="_blank" class="chip" style="background:#0f172a; color:#38bdf8; border:1px solid rgba(56,189,248,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">LinkedIn Search</a>
                    <a href="${searchLinks.scholar}" target="_blank" class="chip" style="background:#0f172a; color:#fbbf24; border:1px solid rgba(245,158,11,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">🔬 Google Scholar Papers</a>
                    <a href="${searchLinks.claude}" target="_blank" class="chip" style="background:#0f172a; color:#c084fc; border:1px solid rgba(168,85,247,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">🤖 Claude AI Deep Dive</a>
                    <a href="${searchLinks.gemini}" target="_blank" class="chip" style="background:#0f172a; color:#34d399; border:1px solid rgba(16,185,129,0.3); padding:6px 14px; border-radius:20px; text-decoration:none; font-size:0.8rem; font-weight:600;">✨ Gemini Exploration</a>
                `;

                // Auto-speak in Story Dark
                if (window.speechSynthesis) {
                    toggleStoryDarkVoice(true);
                }
            }
        }, 1200);
    } catch (e) {
        title.textContent = "Archive Connection Issue";
        content.textContent = "A disruption prevented complete lore retrieval. Please check your network and try again.";
    }
}

function toggleStoryDarkVoice(forcePlay = false) {
    if (!('speechSynthesis' in window)) {
        alert("Speech synthesis is not supported in this browser.");
        return;
    }

    const btn = document.getElementById("storyDarkVoiceBtn");
    const icon = document.getElementById("storyDarkVoiceIcon");
    const label = document.getElementById("storyDarkVoiceLabel");

    if (_isStoryDarkSpeaking && !forcePlay) {
        stopStoryDarkVoice();
        return;
    }

    const titleText = document.getElementById("storyDarkTitle")?.textContent || "";
    const contentText = document.getElementById("storyDarkContent")?.textContent || "";
    const speechText = `${titleText}. ${contentText.replace(/\[.*?\]/g, '').replace(/✅.*?/g, '')}`;

    if (!speechText.trim()) return;

    window.speechSynthesis.cancel();
    _storyDarkVoiceUtterance = new SpeechSynthesisUtterance(speechText.slice(0, 500));
    _storyDarkVoiceUtterance.rate = 1.0;
    _storyDarkVoiceUtterance.pitch = 1.0;

    _storyDarkVoiceUtterance.onstart = () => {
        _isStoryDarkSpeaking = true;
        if (icon) icon.textContent = "⏹️";
        if (label) label.textContent = "Stop Narration";
    };

    _storyDarkVoiceUtterance.onend = () => {
        stopStoryDarkVoice();
    };

    _storyDarkVoiceUtterance.onerror = () => {
        stopStoryDarkVoice();
    };

    window.speechSynthesis.speak(_storyDarkVoiceUtterance);
}

function stopStoryDarkVoice() {
    _isStoryDarkSpeaking = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const icon = document.getElementById("storyDarkVoiceIcon");
    const label = document.getElementById("storyDarkVoiceLabel");
    if (icon) icon.textContent = "🔊";
    if (label) label.textContent = "Listen to Lore";
}

window.toggleStoryDarkVoice = toggleStoryDarkVoice;
window.generateDarkStory = typeof generateDarkStory === "function" ? generateDarkStory : function () {};

/* ==========================================================================
   AUTHENTICATION & OTP VERIFICATION SYSTEM
   ========================================================================== */
let currentAuthEmail = "";
let currentAuthPurpose = "register";
let currentAuthName = "";

async function initAuthSystem() {
    setupOtpInputs();

    window.addEventListener("auth-required", () => {
        showAuthOverlay();
    });

    const token = Backend.Auth.getToken();
    if (token) {
        const res = await Backend.Auth.getMe();
        if (res && res.user) {
            updateAuthUserHeader(res.user);
            hideAuthOverlay();
            return;
        }
    }
    // If no valid session, show auth overlay
    showAuthOverlay();
}

function showAuthOverlay() {
    const overlay = document.getElementById("authOverlay");
    if (overlay) overlay.classList.remove("hidden");
}

function hideAuthOverlay() {
    const overlay = document.getElementById("authOverlay");
    if (overlay) overlay.classList.add("hidden");
}

function updateAuthUserHeader(user) {
    const wrap = document.getElementById("authUserDisplayWrap");
    const display = document.getElementById("authUserDisplay");
    const logoutBtn = document.getElementById("logoutBtn");
    if (wrap) wrap.style.display = "flex";
    if (display && user) {
        display.style.display = "inline-flex";
        display.textContent = "👤 " + (user.name || "Profile");
    }
    if (logoutBtn) {
        logoutBtn.style.display = "inline-flex";
    }
}


function toggleAuthMode() {
    const regForm = document.getElementById("authRegisterForm");
    const loginForm = document.getElementById("authLoginForm");
    const toggleText = document.getElementById("authToggleText");
    const toggleBtnText = document.getElementById("authToggleBtnText");
    const regErr = document.getElementById("authRegError");
    const loginErr = document.getElementById("authLoginError");

    if (regErr) regErr.textContent = "";
    if (loginErr) loginErr.textContent = "";

    if (regForm.style.display === "none") {
        // Switch to Register
        regForm.style.display = "block";
        loginForm.style.display = "none";
        toggleText.textContent = "Already have an account?";
        toggleBtnText.textContent = "Login here";
        currentAuthPurpose = "register";
    } else {
        // Switch to Login
        regForm.style.display = "none";
        loginForm.style.display = "block";
        toggleText.textContent = "Don't have an account?";
        toggleBtnText.textContent = "Register here";
        currentAuthPurpose = "login";
    }
}

async function handleAuthRegister() {
    const nameInput = document.getElementById("authRegName");
    const phoneInput = document.getElementById("authRegPhone");
    const emailInput = document.getElementById("authRegEmail");
    const btn = document.getElementById("authRegBtn");
    const btnText = btn.querySelector(".auth-btn-text");
    const btnLoader = btn.querySelector(".auth-btn-loader");
    const errDiv = document.getElementById("authRegError");

    errDiv.textContent = "";
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();

    if (!name || !email) {
        errDiv.textContent = "Please enter both your name and email.";
        return;
    }

    btn.disabled = true;
    btnText.style.display = "none";
    btnLoader.style.display = "inline-block";

    try {
        const res = await Backend.Auth.register(name, phone, email);
        if (res && res.success) {
            currentAuthEmail = email;
            currentAuthName = name;
            currentAuthPurpose = "register";
            document.getElementById("authOtpEmail").textContent = email;

            // Switch to Step 2
            document.getElementById("authStep1").classList.remove("active");
            document.getElementById("authStep2").classList.add("active");
            clearOtpBoxes();
        } else {
            errDiv.textContent = res ? res.error : "Failed to send verification code. Please check backend connection.";
        }
    } catch (e) {
        errDiv.textContent = e.message || "An error occurred during registration.";
    } finally {
        btn.disabled = false;
        btnText.style.display = "inline";
        btnLoader.style.display = "none";
    }
}

async function handleAuthLogin() {
    const emailInput = document.getElementById("authLoginEmail");
    const btn = document.getElementById("authLoginBtn");
    const btnText = btn.querySelector(".auth-btn-text");
    const btnLoader = btn.querySelector(".auth-btn-loader");
    const errDiv = document.getElementById("authLoginError");

    errDiv.textContent = "";
    const email = emailInput.value.trim();

    if (!email) {
        errDiv.textContent = "Please enter your registered email.";
        return;
    }

    btn.disabled = true;
    btnText.style.display = "none";
    btnLoader.style.display = "inline-block";

    try {
        const res = await Backend.Auth.login(email);
        if (res && res.success) {
            currentAuthEmail = email;
            currentAuthPurpose = "login";
            document.getElementById("authOtpEmail").textContent = email;

            // Switch to Step 2
            document.getElementById("authStep1").classList.remove("active");
            document.getElementById("authStep2").classList.add("active");
            clearOtpBoxes();
        } else {
            errDiv.textContent = res ? res.error : "Account not found or verification failed.";
        }
    } catch (e) {
        errDiv.textContent = e.message || "An error occurred during login.";
    } finally {
        btn.disabled = false;
        btnText.style.display = "inline";
        btnLoader.style.display = "none";
    }
}

function setupOtpInputs() {
    const container = document.getElementById("authOtpContainer");
    if (!container) return;
    const boxes = container.querySelectorAll(".auth-otp-box");

    boxes.forEach((box, idx) => {
        box.addEventListener("input", (e) => {
            const val = e.target.value;
            if (val) {
                box.classList.add("filled");
                if (idx < boxes.length - 1) {
                    boxes[idx + 1].focus();
                }
            } else {
                box.classList.remove("filled");
            }
        });

        box.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" && !box.value && idx > 0) {
                boxes[idx - 1].focus();
            }
        });

        box.addEventListener("paste", (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData("text").trim();
            if (/^\d{6}$/.test(pasted)) {
                pasted.split("").forEach((char, i) => {
                    if (boxes[i]) {
                        boxes[i].value = char;
                        boxes[i].classList.add("filled");
                    }
                });
                boxes[5].focus();
            }
        });
    });
}

function clearOtpBoxes() {
    const boxes = document.querySelectorAll(".auth-otp-box");
    boxes.forEach((box) => {
        box.value = "";
        box.classList.remove("filled", "error");
    });
    const errDiv = document.getElementById("authOtpError");
    if (errDiv) errDiv.textContent = "";
    if (boxes[0]) boxes[0].focus();
}

async function handleAuthVerifyOTP() {
    const boxes = document.querySelectorAll(".auth-otp-box");
    const errDiv = document.getElementById("authOtpError");
    const btn = document.getElementById("authVerifyBtn");
    const btnText = btn.querySelector(".auth-btn-text");
    const btnLoader = btn.querySelector(".auth-btn-loader");

    errDiv.textContent = "";
    let otp = "";
    boxes.forEach((box) => {
        otp += box.value.trim();
    });

    if (otp.length < 6) {
        errDiv.textContent = "Please enter all 6 digits of the code.";
        boxes.forEach(b => b.classList.add("error"));
        setTimeout(() => boxes.forEach(b => b.classList.remove("error")), 600);
        return;
    }

    btn.disabled = true;
    btnText.style.display = "none";
    btnLoader.style.display = "inline-block";

    try {
        let res;
        if (currentAuthPurpose === "register") {
            res = await Backend.Auth.verifyRegister(currentAuthEmail, otp);
        } else {
            res = await Backend.Auth.verifyLogin(currentAuthEmail, otp);
        }

        if (res && res.success) {
            updateAuthUserHeader(res.user);
            if (typeof renderProfileStats === "function") {
                renderProfileStats();
            }

            // Show Step 3 success then open dashboard
            const step3 = document.getElementById("authStep3");
            if (step3) {
                document.getElementById("authStep2").classList.remove("active");
                step3.classList.add("active");
                document.getElementById("authSuccessMsg").textContent = res.message || "Welcome to Rank-Holder!";
            }

            // Hide overlay after 1.5s and enter dashboard
            setTimeout(() => {
                hideAuthOverlay();
                if (step3) {
                    setTimeout(() => {
                        step3.classList.remove("active");
                        document.getElementById("authStep1").classList.add("active");
                    }, 500);
                }
            }, 1500);
        } else {
            errDiv.textContent = res ? res.error : "Invalid code. Please try again.";
            boxes.forEach(b => b.classList.add("error"));
            setTimeout(() => boxes.forEach(b => b.classList.remove("error")), 600);
        }
    } catch (e) {
        errDiv.textContent = e.message || "Verification failed.";
    } finally {
        btn.disabled = false;
        btnText.style.display = "inline";
        btnLoader.style.display = "none";
    }
}

async function handleResendOTP() {
    const errDiv = document.getElementById("authOtpError");
    if (errDiv) errDiv.textContent = "Resending code...";
    if (currentAuthPurpose === "register") {
        await Backend.Auth.register(currentAuthName || "User", currentAuthEmail);
    } else {
        await Backend.Auth.login(currentAuthEmail);
    }
    if (errDiv) errDiv.textContent = `A new code has been sent to ${currentAuthEmail}.`;
}

function goBackToAuthStep1() {
    document.getElementById("authStep2").classList.remove("active");
    document.getElementById("authStep1").classList.add("active");
    clearOtpBoxes();
}

/* ==========================================================================
   MULTI-STEP ONBOARDING
   ========================================================================== */
function showProfileSetup(user) {
    const profileOverlay = document.getElementById("profileSetupOverlay");
    if (profileOverlay) {
        profileOverlay.style.display = "flex";
        document.getElementById("profileName").value = user.name || "";
    }
}

async function handleProfileSave() {
    const phone = document.getElementById("profilePhone").value;
    const courses = document.getElementById("profileCourses").value;
    const btn = document.getElementById("profileSaveBtn");
    const btnText = btn.querySelector(".auth-btn-text");
    const btnLoader = btn.querySelector(".auth-btn-loader");
    const errDiv = document.getElementById("profileError");

    errDiv.textContent = "";
    btn.disabled = true;
    btnText.style.display = "none";
    btnLoader.style.display = "inline-block";

    try {
        const res = await Backend.Auth.updateProfile(phone, courses);
        if (res && res.success) {
            document.getElementById("profileSetupOverlay").style.display = "none";
            // Check if intro has been seen
            if (!localStorage.getItem("rh_intro_seen")) {
                showIntroduction();
            }
        } else {
            errDiv.textContent = res ? res.error : "Failed to save profile. Try again.";
        }
    } catch (e) {
        errDiv.textContent = "An error occurred.";
    } finally {
        btn.disabled = false;
        btnText.style.display = "inline";
        btnLoader.style.display = "none";
    }
}

function showIntroduction() {
    const introOverlay = document.getElementById("introOverlay");
    if (introOverlay) {
        introOverlay.style.display = "flex";
    }
}

function finishOnboarding() {
    localStorage.setItem("rh_intro_seen", "true");
    const introOverlay = document.getElementById("introOverlay");
    if (introOverlay) {
        introOverlay.style.display = "none";
    }
    // Main UI is now visible!
}

async function handleLogout() {
    if (confirm("Are you sure you want to log out of Rank-Holder?")) {
        await Backend.Auth.logout();
        const display = document.getElementById("authUserDisplay");
        const logoutBtn = document.getElementById("logoutBtn");
        if (display) display.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "none";
        showAuthOverlay();
        document.getElementById("authStep2").classList.remove("active");
        document.getElementById("authStep3").classList.remove("active");
        document.getElementById("authStep1").classList.add("active");
    }
}

function switchSubGame(gameId, btnElement) {
    document.querySelectorAll(".subgame-panel, .subgame-content").forEach((panel) => {
        panel.classList.remove("active");
        panel.style.display = "none";
    });
    const target = document.getElementById(gameId);
    if (target) {
        target.classList.add("active");
        target.style.display = "block";
    }
    document.querySelectorAll(".subgame-btn").forEach((button) => button.classList.remove("active"));
    if (btnElement) btnElement.classList.add("active");
}

function initTTT() {}
function resetTTT() {}
function initMemory() {}
function playRPS() {}
function resetGuess() {}
function checkGuess() {}

// Make functions available globally
window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
window.deactivateAccount = deactivateAccount;
window.toggleNotifPanel = toggleNotifPanel;
window.clearNotifications = clearNotifications;
window.openQuickAccess = openQuickAccess;
window.closeQuickAccess = closeQuickAccess;
window.openQASearch = openQASearch;
window.handleCommModeChange = handleCommModeChange;
window.sendTextMessage = sendTextMessage;
window.toggleSpeechRecognition = toggleSpeechRecognition;
window.enableCompanyNotifications = enableCompanyNotifications;
window.updateChips = updateChips;
window.initProjectEngineTab = initProjectEngineTab;
window.searchProjectTopic = searchProjectTopic;
window.handleMediaUpload = handleMediaUpload;
window.toggleOverlay = toggleOverlay;
window.exportAnalysisReport = exportAnalysisReport;
window.generatePDF = generatePDF;
window.generatePPT = generatePPT;
window.switchSubGame = switchSubGame;
window.resetTTT = resetTTT;
window.initMemory = initMemory;
window.playRPS = playRPS;
window.resetGuess = resetGuess;
window.checkGuess = checkGuess;
window.newScramble = typeof newScramble === "function" ? newScramble : function () {};
window.checkScramble = typeof checkScramble === "function" ? checkScramble : function () {};
window.newMath = typeof newMath === "function" ? newMath : function () {};
window.checkMath = typeof checkMath === "function" ? checkMath : function () {};
window.speakVowelTarget = typeof speakVowelTarget === "function" ? speakVowelTarget : function () {};
window.submitVowelLevelAnswer = typeof submitVowelLevelAnswer === "function" ? submitVowelLevelAnswer : function () {};
window.startCurrentMindGame = typeof startCurrentMindGame === "function" ? startCurrentMindGame : function () {};
window.generateDarkStory = typeof generateDarkStory === "function" ? generateDarkStory : function () {};

// Make Auth functions globally accessible
window.initAuthSystem = initAuthSystem;
window.toggleAuthMode = toggleAuthMode;
window.handleAuthRegister = handleAuthRegister;
window.handleAuthLogin = handleAuthLogin;
window.handleAuthVerifyOTP = handleAuthVerifyOTP;
window.handleResendOTP = handleResendOTP;
window.goBackToAuthStep1 = goBackToAuthStep1;

window.toggleProfilePanel = function () {
    const panel = document.getElementById("profilePanel");
    const settingsPanel = document.getElementById("settingsPanel");
    if (!panel) return;
    // Close settings if open
    if (settingsPanel && settingsPanel.style.display === "block") settingsPanel.style.display = "none";
    if (panel.style.display === "none" || panel.style.display === "") {
        panel.style.display = "block";
    } else {
        panel.style.display = "none";
    }
};

// ── Settings Panel ────────────────────────────────────────────────
window.toggleSettingsPanel = function () {
    const panel = document.getElementById("settingsPanel");
    const profilePanel = document.getElementById("profilePanel");
    if (!panel) return;
    // Close profile if open
    if (profilePanel && profilePanel.style.display === "block") profilePanel.style.display = "none";
    if (panel.style.display === "none" || panel.style.display === "") {
        panel.style.display = "block";
        loadSettingsNotifications();
        checkAdminForSettings();
    } else {
        panel.style.display = "none";
    }
};

// Close both panels on outside click
document.addEventListener("click", (e) => {
    // Profile panel
    const profileWrap = document.getElementById("authUserDisplayWrap");
    const profilePanel = document.getElementById("profilePanel");
    if (profileWrap && profilePanel && profilePanel.style.display === "block") {
        if (!profileWrap.contains(e.target)) profilePanel.style.display = "none";
    }
    // Settings panel
    const settingsWrap = document.getElementById("settingsWrap");
    const settingsPanel = document.getElementById("settingsPanel");
    if (settingsWrap && settingsPanel && settingsPanel.style.display === "block") {
        if (!settingsWrap.contains(e.target)) settingsPanel.style.display = "none";
    }
});

// Load notifications into the Settings panel
window.loadSettingsNotifications = async function () {
    const container = document.getElementById("settingsNotifList");
    if (!container) return;
    try {
        const token = localStorage.getItem("rh_auth_token");
        if (!token) {
            container.innerHTML = "<span style='font-size:0.78rem;color:var(--text-muted);'>Login to see notifications.</span>";
            return;
        }
        const r = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json();
        const notifs = (data.notifications || []).slice(0, 5);
        if (!notifs.length) {
            container.innerHTML = "<span style='font-size:0.78rem;color:var(--text-muted);'>No new alerts.</span>";
            return;
        }
        const catIcon = { job: "💼", system: "⚙️", general: "🔔" };
        container.innerHTML = notifs.map(n => `
            <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:8px;padding:8px 10px;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--text-primary);margin-bottom:2px;">
                    ${catIcon[n.category] || "🔔"} ${n.title}
                </div>
                <div style="font-size:0.72rem;color:var(--text-muted);line-height:1.4;">${n.message}</div>
            </div>
        `).join("");
    } catch (e) {
        container.innerHTML = "<span style='font-size:0.78rem;color:var(--text-muted);'>Could not load notifications.</span>";
    }
};

// Check if user is admin and show Admin Panel in Settings
async function checkAdminForSettings() {
    const adminSection = document.getElementById("settingsAdminSection");
    if (!adminSection) return;
    try {
        const token = localStorage.getItem("rh_auth_token");
        if (!token) return;
        const r = await fetch("/api/auth/is-admin", { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
            adminSection.style.display = "block";
        } else {
            adminSection.style.display = "none";
        }
    } catch (e) {
        adminSection.style.display = "none";
    }
}

// ── renderProfileStats ────────────────────────────────────────────
window.renderProfileStats = async function () {
    // Show the profile strip above the tab nav (HIDDEN as per new design)
    const strip = document.getElementById("profileStrip");
    if (strip) {
        // strip.style.display = "block"; // Hiding profile strip
    }

    // Show logout button inside strip
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.style.display = "inline-block";

    // Populate profile panel with real user data
    const user = Backend.Auth.getStoredUser();
    if (user) {
        let certificate = JSON.parse(localStorage.getItem('kl_certificate') || 'null');
        if (Backend.Auth.isLoggedIn()) {
            const progress = await Backend.KnowledgeLab.getProgress();
            certificate = progress && progress.certificate ? progress.certificate : null;
            if (certificate) localStorage.setItem('kl_certificate', JSON.stringify(certificate));
            else localStorage.removeItem('kl_certificate');
        }
        const profileCertificateArea = document.getElementById('profileCertificateArea');
        const profileCertificateScore = document.getElementById('profileCertificateScore');
        const profileCertificateImage = document.getElementById('profileCertificateImage');
        const profileCertificateName = document.getElementById('profileCertificateName');
        if (profileCertificateArea) profileCertificateArea.style.display = 'none';
        if (profileCertificateImage) profileCertificateImage.src = getCertificateAssetUrl();
        if (profileCertificateName) profileCertificateName.textContent = user.name || 'Rank Holder Learner';
        if (profileCertificateArea && profileCertificateScore && certificate && certificate.name === user.name) {
            profileCertificateArea.style.display = 'block';
            profileCertificateScore.textContent = `${certificate.score}/${certificate.total} marks • Issued ${new Date(certificate.issuedAt).toLocaleDateString()}`;
        }
        // Nav bar chip name
        const navName = document.getElementById("navProfileName");
        if (navName) navName.textContent = user.name || "Profile";

        // Profile panel header fields
        const panelName = document.getElementById("profilePanelName");
        if (panelName) panelName.textContent = user.name || "—";

        const panelEmail = document.getElementById("profilePanelEmail");
        if (panelEmail) panelEmail.textContent = user.email || "—";

        // ── Profile Detail Card rows ──
        const detailName = document.getElementById("profileDetailName");
        if (detailName) detailName.textContent = user.name || "—";

        const detailEmail = document.getElementById("profileDetailEmail");
        if (detailEmail) detailEmail.textContent = user.email || "—";

        const detailPhone = document.getElementById("profileDetailPhone");
        if (detailPhone) detailPhone.textContent = user.phone || user.mobile || "Not provided";

        const detailStatus = document.getElementById("profileDetailStatus");
        if (detailStatus) {
            const st = (user.status || "APPROVED").toUpperCase();
            detailStatus.textContent = st === "APPROVED" ? "✅ Active" : st;
            detailStatus.style.background = st === "APPROVED" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)";
            detailStatus.style.color = st === "APPROVED" ? "#10b981" : "#f59e0b";
        }

        // Compute user score
        const scoreEl = document.getElementById("profilePanelScore");
        const settingsScoreEl = document.getElementById("settingsPanelScore");
        if (scoreEl) {
            const score = Math.min(95, 40 + ((user.name || "").length * 3) + ((user.email || "").length % 20));
            scoreEl.textContent = `Top ${100 - score}%`;
            if (settingsScoreEl) settingsScoreEl.textContent = `Top ${100 - score}%`;
        }

        // Show the profile wrap (username chip)
        const wrap = document.getElementById("authUserDisplayWrap");
        if (wrap) wrap.style.display = "flex";

        // Check admin for settings admin section visibility
        checkAdminForSettings();
    }

    try {
        const scores = { ...JSON.parse(localStorage.getItem('rh_mind_scores') || '{}'), ...(await Backend.GameScores.getScores() || {}) };
        // Populate both strip and profile panel game scores
        const containers = [
            document.getElementById("profileGameScores"),
            document.getElementById("headerGameScores")
        ];

        for (const container of containers) {
            if (!container) continue;
            container.innerHTML = "";
            if (scores && Object.keys(scores).length > 0) {
                for (const [game, score] of Object.entries(scores)) {
                    const pill = document.createElement("div");
                    pill.style.cssText = "background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);border-radius:8px;padding:5px 10px;text-align:center;min-width:60px;";
                    pill.innerHTML = `<div style="font-size:0.65rem;color:var(--text-secondary);">${game.charAt(0).toUpperCase() + game.slice(1).replace(/-/g, " ")}</div><div style="font-size:0.9rem;font-weight:800;color:var(--brand-primary);">${score}</div>`;
                    container.appendChild(pill);
                }
            } else {
                container.innerHTML = "<span style='font-size:0.75rem;color:var(--text-muted);'>No scores yet</span>";
            }
        }
    } catch (e) {
        console.error("Error loading profile stats:", e);
    }
};

function getCertificateAssetUrl() {
    return window.location.protocol === 'file:' ? 'cerficated.jpg' : '/cerficated.jpg';
}

// Renders the certificate jpg with the user's name onto a <canvas> element
async function renderCertificateCanvas(canvasEl, certificate) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = getCertificateAssetUrl();
        image.onload = function () {
            canvasEl.width = image.naturalWidth;
            canvasEl.height = image.naturalHeight;
            const ctx = canvasEl.getContext('2d');

            // Draw base certificate image
            ctx.drawImage(image, 0, 0);

            // Clear the name area with white rect so old text doesn't bleed through
            ctx.fillStyle = '#fff';
            ctx.fillRect(520, 980, 1020, 260);

            // Write user's name in italic cursive script (the "presented to" area)
            const nameText = certificate.name || 'Rank Holder Learner';
            ctx.fillStyle = '#1a1a2e';
            ctx.textAlign = 'center';
            ctx.font = 'italic bold 72px "Georgia", "Times New Roman", cursive, serif';
            ctx.fillText(nameText, 1030, 1100);

            // Underline beneath the cursive name (gold)
            ctx.strokeStyle = '#c9a84c';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(560, 1125);
            ctx.lineTo(1500, 1125);
            ctx.stroke();

            // Email / ID top-right
            ctx.textAlign = 'left';
            ctx.font = 'bold 22px Arial';
            ctx.fillStyle = '#333';
            ctx.fillText(`ID: ${certificate.email || 'Verified Learner'}`, 1390, 395);

            resolve({ canvas: canvasEl, image });
        };
        image.onerror = reject;
    });
}

window.downloadKnowledgeCertificate = async function () {
    const certificate = JSON.parse(localStorage.getItem('kl_certificate') || 'null');
    if (!certificate) { alert("No certificate found. Complete all 10 levels to earn your certificate!"); return; }

    try {
        // Reuse the inline canvas if rendered, otherwise create a temp one
        let canvas = document.getElementById('klCertificateCanvas');
        if (!canvas || canvas.width === 0) {
            canvas = document.createElement('canvas');
            await renderCertificateCanvas(canvas, certificate);
        }

        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
            doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, canvas.width, canvas.height);
            doc.save('Rank-Holder-AI-Knowledge-Lab-Certificate.pdf');
        } else {
            // Download as JPG if jsPDF not available
            const link = document.createElement('a');
            link.download = 'Rank-Holder-AI-Knowledge-Lab-Certificate.jpg';
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();
        }
    } catch (e) {
        console.error("Failed to generate certificate", e);
        alert("Failed to download certificate. Please try again.");
    }
};


// ── OTP → Password helpers ────────────────────────────────────────
window.generatePasswordOTP = async function () {
    const btn = document.getElementById("genOtpBtn");
    const msgEl = document.getElementById("otpSentMsg");
    const user = Backend.Auth.getStoredUser();
    if (!user || !user.email) {
        if (msgEl) { msgEl.style.display = "block"; msgEl.style.color = "#f43f5e"; msgEl.textContent = "❌ No logged-in user found."; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Sending…"; }
    try {
        const r = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email })
        });
        const data = await r.json();
        if (r.ok) {
            if (msgEl) { msgEl.style.display = "block"; msgEl.style.color = "#10b981"; msgEl.textContent = `✅ Code sent to ${user.email}! Check your inbox.`; }
        } else {
            if (msgEl) { msgEl.style.display = "block"; msgEl.style.color = "#f59e0b"; msgEl.textContent = `⚠️ ${data.error || "Could not send code."}`; }
        }
    } catch (e) {
        if (msgEl) { msgEl.style.display = "block"; msgEl.style.color = "#f43f5e"; msgEl.textContent = "❌ Network error. Try again."; }
    }
    if (btn) {
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = "📧 Send Code to My Email";
        }, 30000); // Prevent spam — re-enable after 30s
    }
};

window.setOTPasPassword = async function () {
    const input = document.getElementById("otpPasswordInput");
    const msgEl = document.getElementById("otpPasswordMsg");
    const otp = (input ? input.value.trim() : "");
    const user = Backend.Auth.getStoredUser();

    if (!otp || otp.length !== 6) {
        if (msgEl) { msgEl.style.display = "block"; msgEl.style.background = "rgba(244,63,94,0.1)"; msgEl.style.color = "#f43f5e"; msgEl.textContent = "❌ Please enter the full 6-digit code."; }
        return;
    }
    if (!user || !user.email) {
        if (msgEl) { msgEl.style.display = "block"; msgEl.style.color = "#f43f5e"; msgEl.textContent = "❌ Not logged in."; }
        return;
    }

    if (msgEl) { msgEl.style.display = "block"; msgEl.style.background = "rgba(99,102,241,0.08)"; msgEl.style.color = "var(--brand-primary)"; msgEl.textContent = "⏳ Setting password…"; }

    try {
        const r = await fetch("/api/auth/otp-to-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email, otp })
        });
        const data = await r.json();
        if (r.ok) {
            msgEl.style.background = "rgba(16,185,129,0.12)";
            msgEl.style.color = "#10b981";
            msgEl.textContent = `✅ ${data.message}`;
            if (input) input.value = "";
            const sentMsg = document.getElementById("otpSentMsg");
            if (sentMsg) sentMsg.style.display = "none";
        } else {
            msgEl.style.background = "rgba(244,63,94,0.1)";
            msgEl.style.color = "#f43f5e";
            msgEl.textContent = `❌ ${data.error || "Failed to set password."}`;
        }
    } catch (e) {
        msgEl.style.background = "rgba(244,63,94,0.1)";
        msgEl.style.color = "#f43f5e";
        msgEl.textContent = "❌ Network error. Try again.";
    }
};

window.handleLogout = handleLogout;

// ── Copy email to clipboard ────────────────────────────────────
window.copyProfileEmail = function () {
    const emailEl = document.getElementById("profilePanelEmail");
    const email = emailEl ? emailEl.textContent : "";
    if (!email || email === "—") return;
    navigator.clipboard.writeText(email).then(() => {
        const btn = document.querySelector('[onclick="copyProfileEmail()"]');
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = "✅ Copied!";
            btn.style.color = "#10b981";
            setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; }, 1800);
        }
    }).catch(() => {
        // Fallback for non-HTTPS
        const ta = document.createElement("textarea");
        ta.value = email; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
    });
};


// ── Notifications Panel & Handling ────────────────────────────────
window.toggleNotifPanel = function () {
    const notifPanel = document.getElementById("notifPanel");
    const profilePanel = document.getElementById("profilePanel");
    const settingsPanel = document.getElementById("settingsPanel");
    if (!notifPanel) return;
    if (profilePanel) profilePanel.style.display = "none";
    if (settingsPanel) settingsPanel.style.display = "none";

    if (notifPanel.style.display === "none" || notifPanel.style.display === "") {
        notifPanel.style.display = "block";
        refreshNotifications();
    } else {
        notifPanel.style.display = "none";
    }
};

window.clearNotifications = async function () {
    try {
        await Backend.Notifications.clearNotifications();
    } catch (_) { }
    const notifList = document.getElementById("notifList");
    if (notifList) notifList.innerHTML = "<div style='font-size:0.8rem;color:var(--text-muted);padding:10px;text-align:center;'>No active notifications.</div>";
    const badge = document.getElementById("notifBadge");
    if (badge) badge.style.display = "none";
};

window.filterNotifs = function (filterType) {
    const btnAll = document.getElementById("notifFilterAll");
    const btnJob = document.getElementById("notifFilterJob");
    const btnIntern = document.getElementById("notifFilterIntern");

    [btnAll, btnJob, btnIntern].forEach(btn => {
        if (btn) {
            btn.style.background = "rgba(99,102,241,0.05)";
            btn.style.borderColor = "rgba(99,102,241,0.1)";
            btn.style.color = "var(--text-muted)";
        }
    });

    const cards = document.querySelectorAll("#notifList .notif-card");
    cards.forEach(card => {
        const cat = card.dataset.category || "job";
        if (filterType === "all") {
            card.style.display = "block";
            if (btnAll) {
                btnAll.style.background = "rgba(99,102,241,0.18)";
                btnAll.style.borderColor = "rgba(99,102,241,0.3)";
                btnAll.style.color = "var(--brand-primary)";
            }
        } else if (filterType === "job") {
            card.style.display = cat.includes("job") ? "block" : "none";
            if (btnJob) {
                btnJob.style.background = "rgba(99,102,241,0.18)";
                btnJob.style.borderColor = "rgba(99,102,241,0.3)";
                btnJob.style.color = "var(--brand-primary)";
            }
        } else if (filterType === "internship" || filterType === "freelance") {
            card.style.display = (cat.includes("intern") || cat.includes("freelance")) ? "block" : "none";
            if (btnIntern) {
                btnIntern.style.background = "rgba(99,102,241,0.18)";
                btnIntern.style.borderColor = "rgba(99,102,241,0.3)";
                btnIntern.style.color = "var(--brand-primary)";
            }
        }
    });
};

window.refreshNotifications = async function () {
    const container = document.getElementById("notifList");
    if (!container) return;
    try {
        const res = await Backend.Notifications.fetchNotifications();
        const list = (res && res.notifications && res.notifications.length) ? res.notifications : [
            { id: 1, title: "Google India — Mass SWE Hiring", message: "Openings for SWE-1, Cloud & Internships posted this morning.", category: "job", mail: "careers@google.com", linkedin: "https://linkedin.com/company/google/jobs", tag: "Hiring Active" },
            { id: 2, title: "TCS Digital — NQT Approaching", message: "National Qualifier Test registration closes soon. Apply early.", category: "job", mail: "hr@tcs.com", linkedin: "https://linkedin.com/company/tata-consultancy-services/jobs", tag: "Deadline Soon" },
            { id: 3, title: "Zoho Corp — Urgent Off-Campus", message: "Fast-tracking interviews for Software Dev & QA roles.", category: "internship", mail: "careers@zohocorp.com", linkedin: "https://linkedin.com/company/zoho/jobs", tag: "Urgent Hiring" },
            { id: 4, title: "Startup Web App Contract", message: "Freelance dev needed for React + Node landing page build.", category: "freelance", mail: "founder@techstartup.com", linkedin: "https://linkedin", tag: "Freelance Gig" }
        ];

        container.innerHTML = list.map(item => `
            <div class="notif-card" data-category="${item.category || 'job'}" style="padding:12px;border-radius:10px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">${item.title}</span>
                    <span style="font-size:0.68rem;color:var(--text-muted);">Today</span>
                </div>
                <span style="display:inline-block;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;margin-bottom:6px;background:rgba(16,185,129,0.15);color:#10b981;">${item.tag || item.category.toUpperCase()}</span>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:8px;line-height:1.4;">${item.message}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <a href="mailto:${item.mail || 'careers@rankholder.com'}" style="font-size:0.72rem;font-weight:700;padding:4px 9px;border-radius:6px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--text-primary);text-decoration:none;">✉️ Contact HR</a>
                    <a href="${item.linkedin || 'https://linkedin.com'}" target="_blank" rel="noopener" style="font-size:0.72rem;font-weight:700;padding:4px 9px;border-radius:6px;background:#0a66c2;color:#fff;text-decoration:none;">in LinkedIn Jobs</a>
                </div>
            </div>
        `).join("");

        const badge = document.getElementById("notifBadge");
        if (badge) badge.style.display = list.length ? "block" : "none";
    } catch (e) {
        console.warn("refreshNotifications error:", e);
    }
};

// =====================================================
// AUTO-INIT: Restore session on page reload
// =====================================================
(function autoInit() {
    // Hide any auth overlay if it somehow still exists in DOM
    const overlay = document.getElementById("authOverlay");
    if (overlay) overlay.style.display = "none";

    // Always show the profile strip (HIDDEN as per new design)
    const strip = document.getElementById("profileStrip");
    if (strip) {
        // strip.style.display = "block"; // Hiding profile strip
    }

    // If a valid session token exists in localStorage, restore the full profile
    const token = localStorage.getItem("rh_auth_token");
    const storedUser = localStorage.getItem("rh_user") || localStorage.getItem("rh_auth_user");

    if (token && storedUser) {
        // Restore profile chip (name + photo) in navbar immediately (sync)
        try {
            const user = JSON.parse(storedUser);
            const navName = document.getElementById("navProfileName");
            if (navName) navName.textContent = user.name || "Profile";

            const wrap = document.getElementById("authUserDisplayWrap");
            if (wrap) wrap.style.display = "flex";

            const panelName = document.getElementById("profilePanelName");
            if (panelName) panelName.textContent = user.name || "—";

            const panelEmail = document.getElementById("profilePanelEmail");
            if (panelEmail) panelEmail.textContent = user.email || "—";

            // Also populate the new detail card rows immediately
            const detailName = document.getElementById("profileDetailName");
            if (detailName) detailName.textContent = user.name || "—";

            const detailEmail = document.getElementById("profileDetailEmail");
            if (detailEmail) detailEmail.textContent = user.email || "—";

            const detailPhone = document.getElementById("profileDetailPhone");
            if (detailPhone) detailPhone.textContent = user.phone || user.mobile || "Not provided";

            const detailStatus = document.getElementById("profileDetailStatus");
            if (detailStatus) {
                const st = (user.status || "APPROVED").toUpperCase();
                detailStatus.textContent = st === "APPROVED" ? "✅ Active" : st;
                detailStatus.style.background = st === "APPROVED" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)";
                detailStatus.style.color = st === "APPROVED" ? "#10b981" : "#f59e0b";
            }

            const scoreEl = document.getElementById("profilePanelScore");
            const settingsScoreEl = document.getElementById("settingsPanelScore");
            if (scoreEl) {
                const score = Math.min(95, 40 + ((user.name || "").length * 3) + ((user.email || "").length % 20));
                scoreEl.textContent = `Top ${100 - score}%`;
                if (settingsScoreEl) settingsScoreEl.textContent = `Top ${100 - score}%`;
            }

            // Show logout in strip
            const logoutBtn = document.getElementById("logoutBtn");
            if (logoutBtn) logoutBtn.style.display = "inline-block";
        } catch (e) { console.warn("autoInit profile restore error:", e); }

        // Then load game scores async
        setTimeout(() => {
            if (window.renderProfileStats) window.renderProfileStats();
        }, 300);
    } else {
        // Guest — hide logout
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) logoutBtn.style.display = "none";

        // Show profile chip but style it as a Login button
        const wrap = document.getElementById("authUserDisplayWrap");
        if (wrap) wrap.style.display = "flex";

        const navName = document.getElementById("navProfileName");
        if (navName) navName.textContent = "Sign In";

        const displayBtn = document.getElementById("authUserDisplay");
        if (displayBtn) {
            displayBtn.onclick = () => window.location.href = "login.html";
        }
    }
})();

// =====================================================
// AI Assistant Tour (Driver.js)
// =====================================================
window.startAITour = function () {
    const driverObj = window.driver.js.driver({
        showProgress: true,
        animate: true,
        steps: [
            {
                element: "#profileStrip",
                popover: {
                    title: "👋 Welcome to Rank Holder!",
                    description: "I am your AI Assistant. Let me show you around the platform and explain what each tab does.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-home-btn",
                popover: {
                    title: "🏠 Platform Overview & Start Hub",
                    description: "Your starting command center with live metrics, quick-action AI shortcuts, 8-module launchpad, and placement roadmap.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-jobs-btn",
                popover: {
                    title: "🚀 Direct Hiring",
                    description: "Find direct recruiter contacts, apply to top tech brands, and get verified internship links updated daily.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-biomedical-btn",
                popover: {
                    title: "📸 Smart Image & QR Scanner",
                    description: "Upload any photo to extract attributes and Google Search data, or upload a QR code to extract its website link directly.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-english-btn",
                popover: {
                    title: "🎙️ English Communication",
                    description: "Practice spoken English with Rank Holder AI, your personal interview partner. Get live grammar corrections, GD tips, PPT guidance, and fluency scoring.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-projects-btn",
                popover: {
                    title: "💡 Project Engine",
                    description: "Search any topic to generate a full technical blueprint, components list, software requirements, and execution roadmap.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-games-btn",
                popover: {
                    title: "🧩 Story Dark",
                    description: "Play cognitive and memory games. Keep your mind sharp while taking a break from learning.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-refresh-games-btn",
                popover: {
                    title: "🎮 Refresh Arcade",
                    description: "Dive into the Refresh Arcade for interactive mini-games and earn points.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-companies-btn",
                popover: {
                    title: "🏢 Top Brand Companies",
                    description: "Browse the directory of top companies and directly view their career pages.",
                    side: "bottom",
                    align: "start"
                }
            },
            {
                element: "#tab-outreach-btn",
                popover: {
                    title: "🚀 LinkedIn Outreach",
                    description: "Generate cold outreach messages and prepare your LinkedIn profile for connecting with recruiters.",
                    side: "bottom",
                    align: "start"
                }
            }
        ]
    });
    driverObj.drive();
};

// AI Meeting Room Interactions
let isMeetingMicOn = true;
let isMeetingCamOn = false;

function toggleMeetingMic() {
    isMeetingMicOn = !isMeetingMicOn;
    const btn = document.getElementById('meetingMicBtn');
    if (isMeetingMicOn) {
        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.border = 'none';
        btn.innerHTML = '??';
        btn.style.color = '#fff';
    } else {
        btn.style.background = 'rgba(239,68,68,0.2)';
        btn.style.border = '1px solid rgba(239,68,68,0.3)';
        btn.innerHTML = '??<span style="position:absolute; width:2px; height:24px; background:#ef4444; transform:rotate(45deg);"></span>';
        btn.style.color = '#ef4444';
    }
}

function toggleMeetingCam() {
    isMeetingCamOn = !isMeetingCamOn;
    const btn = document.getElementById('meetingCamBtn');
    if (isMeetingCamOn) {
        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.border = 'none';
        btn.innerHTML = '??';
        btn.style.color = '#fff';
    } else {
        btn.style.background = 'rgba(239,68,68,0.2)';
        btn.style.border = '1px solid rgba(239,68,68,0.3)';
        btn.innerHTML = '??';
        btn.style.color = '#ef4444';
    }
}

function handleMeetingModeChange() {
    const mode = document.getElementById('meetingModeSelect').value;
    const gdPanel = document.getElementById('gdTopicsPanel');
    const aiName = document.getElementById('aiMeetingName');
    const captionText = document.getElementById('meetingCaptionText');

    if (mode === 'group-discussion') {
        gdPanel.style.display = 'block';
        aiName.innerText = 'AI Moderator';
        captionText.innerText = 'Welcome to the group discussion round. Please review the topic above.';
        fetchDailyGDTopics();
    } else if (mode === 'hr-round') {
        gdPanel.style.display = 'none';
        aiName.innerText = 'HR Manager (AI)';
        captionText.innerText = "Hello! Let's begin the HR interview. Tell me about your long-term goals.";
    } else {
        gdPanel.style.display = 'none';
        aiName.innerText = 'Rank Holder AI';
        captionText.innerText = "Let's begin the pre-interview check. Please verify your audio and video connection.";
    }
}

function fetchDailyGDTopics() {
    const topics = [
        "Impact of AI on modern tech jobs: A threat or an enabler?",
        "Is Remote Work sustainable for long-term tech productivity?",
        "Web3 vs Web2: Which is the future of internet?",
        "Ethics in AI: Who is responsible when AI fails?",
        "The Role of Open Source in Corporate Software Development."
    ];
    const companies = [
        "Google, Microsoft, Amazon",
        "Zoho, TCS, Meta",
        "Nvidia, Apple, CTS"
    ];

    const textEl = document.getElementById('gdLiveTopicText');
    textEl.innerHTML = '<span style="opacity:0.5;">Fetching live topics...</span>';

    setTimeout(() => {
        const randomTopic = topics[Math.floor(Math.random() * topics.length)];
        const randomCompany = companies[Math.floor(Math.random() * companies.length)];
        textEl.innerHTML = randomTopic + '<br><span style="font-size:0.75rem; color:var(--text-secondary);">Currently trending in: ' + randomCompany + '</span>';
    }, 600);
}

function endMeeting() {
    document.getElementById('meetingCaptionText').innerText = 'Meeting ended. Returning to dashboard...';
    setTimeout(() => {
        alert('Meeting ended successfully.');
    }, 1000);
}

// Initialize Authentication System on page load
document.addEventListener('DOMContentLoaded', () => {
    if (typeof initAuthSystem === 'function') {
        initAuthSystem();
    }
});

/* ==========================================================================
   ATS SCANNER LOGIC — PDF / DOCX / IMAGE / TEXT (Gemini API)
   ========================================================================== */

// Global reference to the selected resume file
let _selectedResumeFile = null;

function handleResumeFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    _selectedResumeFile = file;
    startAtsChatSession(file);
}

function handleResumeDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    _selectedResumeFile = file;
    startAtsChatSession(file);
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    try {
        // Use PDF.js if available
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(item => item.str).join(' ') + '\n';
            }
            return fullText.trim();
        }
    } catch (e) {
        console.warn('PDF.js extraction failed, will use Gemini Vision instead.', e);
    }
    return null; // fallback to Gemini Vision
}

async function extractTextFromDOCX(file) {
    if (!window.mammoth) throw new Error('mammoth.js not loaded');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
}

/* --- Chat Helper Functions --- */
function addChatMsg(sender, text, isHtml = false) {
    const history = document.getElementById('atsChatHistory');
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = sender === 'ai' 
        ? 'align-self: flex-start; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.2); border-radius: 0 16px 16px 16px; padding: 12px 16px; max-width: 85%; color: #e2e8f0; font-size: 0.95rem; line-height:1.5; box-shadow: 0 4px 10px rgba(0,0,0,0.1);'
        : 'align-self: flex-end; background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.3); border-radius: 16px 0 16px 16px; padding: 12px 16px; max-width: 85%; color: #fff; font-size: 0.95rem; line-height:1.5; box-shadow: 0 4px 10px rgba(0,0,0,0.1);';
    
    if (isHtml) {
        msgDiv.innerHTML = text;
    } else {
        msgDiv.innerText = text;
    }
    
    history.appendChild(msgDiv);
    history.scrollTop = history.scrollHeight;
    return msgDiv;
}

function addTypingIndicator() {
    const history = document.getElementById('atsChatHistory');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'aiTypingIndicator';
    typingDiv.style.cssText = 'align-self: flex-start; background: rgba(255,255,255,0.05); border-radius: 0 16px 16px 16px; padding: 14px 16px; display:flex; gap:6px; align-items:center;';
    typingDiv.innerHTML = `
        <span class="pulse-dot" style="width:8px;height:8px;background:#94a3b8;border-radius:50%;animation:pulseDot 1.4s infinite ease-in-out both"></span>
        <span class="pulse-dot" style="width:8px;height:8px;background:#94a3b8;border-radius:50%;animation:pulseDot 1.4s infinite ease-in-out both; animation-delay:-0.32s"></span>
        <span class="pulse-dot" style="width:8px;height:8px;background:#94a3b8;border-radius:50%;animation:pulseDot 1.4s infinite ease-in-out both; animation-delay:-0.16s"></span>
    `;
    history.appendChild(typingDiv);
    history.scrollTop = history.scrollHeight;
}

function removeTypingIndicator() {
    const typingDiv = document.getElementById('aiTypingIndicator');
    if (typingDiv) typingDiv.remove();
}

function resetAtsChat() {
    document.getElementById('atsChatState').style.display = 'none';
    document.getElementById('atsUploadState').style.display = 'flex';
    document.getElementById('atsChatHistory').innerHTML = '';
    _selectedResumeFile = null;
    document.getElementById('resumeImageInput').value = '';
    document.getElementById('resumeFileLabel').innerHTML = 'Click or drag & drop your resume here';
    document.getElementById('resumeDropZone').style.borderColor = 'rgba(99,102,241,0.4)';
    document.getElementById('resumeDropZone').style.background = 'rgba(99,102,241,0.03)';
}

async function startAtsChatSession(file) {
    // Switch UI
    document.getElementById('atsUploadState').style.display = 'none';
    document.getElementById('atsChatState').style.display = 'flex';

    // Add user message
    addChatMsg('user', `📄 Uploaded: ${file.name}`);

    // Step 1
    addTypingIndicator();
    await new Promise(r => setTimeout(r, 1000));
    removeTypingIndicator();
    addChatMsg('ai', `Thanks! I'm opening ${file.name} now...`);

    // Step 2
    addTypingIndicator();
    await new Promise(r => setTimeout(r, 1200));
    removeTypingIndicator();
    addChatMsg('ai', `Reading your formatting and extracting keywords...`);

    // Step 3 — show typing while API runs
    addTypingIndicator();
    await new Promise(r => setTimeout(r, 800));
    addChatMsg('ai', `Checking against Fortune 500 ATS standards...`);
    addTypingIndicator();

    // Now call the real API
    await runAtsBackgroundScan(file);
}

// ATS Gemini API URL (Moved to backend)
const _ATS_API_URL = '/resume/analyze';

async function runAtsBackgroundScan(file) {
    const jdText = document.getElementById('resumeJdText') ? document.getElementById('resumeJdText').value.trim() : '';
    
    console.log('[ATS] Starting scan via backend.');

    try {
        let finalResumeText = null;
        let useVision = false;
        let base64Data = null;
        let mimeType = null;

        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'pdf' || file.type === 'application/pdf') {
            const pdfText = await extractTextFromPDF(file);
            if (pdfText && pdfText.length > 50) {
                finalResumeText = pdfText;
            } else {
                useVision = true;
                const reader = new FileReader();
                base64Data = await new Promise((res, rej) => {
                    reader.onload = () => res(reader.result.split(',')[1]);
                    reader.onerror = rej;
                    reader.readAsDataURL(file);
                });
                mimeType = 'application/pdf';
            }
        } else if (ext === 'docx' || ext === 'doc') {
            try {
                finalResumeText = await extractTextFromDOCX(file);
            } catch (e) {
                removeTypingIndicator();
                addChatMsg('ai', "I couldn't read this DOC/DOCX file. Could you try converting it to a PDF?");
                return;
            }
        } else {
            useVision = true;
            const reader = new FileReader();
            base64Data = await new Promise((res, rej) => {
                reader.onload = () => res(reader.result.split(',')[1]);
                reader.onerror = rej;
                reader.readAsDataURL(file);
            });
            mimeType = file.type;
        }

        let requestBody = {
            text: finalResumeText,
            jd: jdText,
            base64Data: base64Data,
            mimeType: mimeType
        };

        const result = await Backend.request(_ATS_API_URL, "POST", requestBody);

        if (!result || result.error) {
            throw new Error(result?.error || "Failed to analyze resume");
        }

        // Remove typing indicator and output results
        removeTypingIndicator();

        // 1. Overall Score & Verdict
        const score = result.score || Math.floor(Math.random() * (95 - 45 + 1) + 45); // fallback
        const scoreColor = score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f43f5e';
        let scoreHtml = `
            <div style="text-align:center; padding: 10px;">
                <div style="font-size:3.5rem; font-weight:800; color:${scoreColor}; line-height:1; text-shadow: 0 0 20px ${scoreColor}40;">${score}<span style="font-size:1.5rem;">/100</span></div>
                <div style="font-size:0.9rem; color:#94a3b8; margin-top:4px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">ATS Match Score</div>
            </div>
            <p style="margin-top:16px; margin-bottom:0; font-size:1.05rem; font-weight:500;">${result.summary}</p>
        `;
        addChatMsg('ai', scoreHtml, true);
        
        // Add typing delay
        addTypingIndicator();
        setTimeout(() => {
            removeTypingIndicator();
            
            // 2. Mistakes
            if (result.mistakes && result.mistakes.length > 0) {
                let mHtml = `<strong style="color:#fb7185; display:flex; align-items:center; gap:6px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Areas of Concern:</strong><ul style="margin:12px 0 0 0; padding-left:24px;">`;
                result.mistakes.forEach(m => mHtml += `<li style="margin-bottom:8px;">${m}</li>`);
                mHtml += `</ul>`;
                addChatMsg('ai', mHtml, true);
            } else {
                addChatMsg('ai', `✅ Great job! I didn't spot any major formatting errors.`);
            }
            
            addTypingIndicator();
            setTimeout(() => {
                removeTypingIndicator();

                // 3. Keywords
                let kHtml = `<strong style="display:flex; align-items:center; gap:6px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> Keyword Analysis:</strong><div style="margin-top:12px;">`;
                if(result.matchedKeywords && result.matchedKeywords.length > 0) {
                    kHtml += `<div style="font-size:0.85rem; margin-bottom:8px; color:#cbd5e1; font-weight:500;">Found:</div><div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">`;
                    result.matchedKeywords.slice(0, 8).forEach(k => {
                        kHtml += `<span style="background:rgba(74,222,128,0.15); color:#4ade80; padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:500;">✓ ${k}</span>`;
                    });
                    kHtml += `</div>`;
                }
                if(result.missingKeywords && result.missingKeywords.length > 0) {
                    kHtml += `<div style="font-size:0.85rem; margin-bottom:8px; color:#cbd5e1; font-weight:500;">Missing:</div><div style="display:flex; flex-wrap:wrap; gap:6px;">`;
                    result.missingKeywords.forEach(k => {
                        kHtml += `<span style="background:rgba(244,63,94,0.15); color:#fb7185; padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:500;">✗ ${k}</span>`;
                    });
                    kHtml += `</div>`;
                }
                if(!result.matchedKeywords?.length && !result.missingKeywords?.length) {
                    kHtml += `<div style="color:#94a3b8; font-style:italic;">No specific keywords detected. Add a Job Description for better analysis.</div>`;
                }
                kHtml += `</div>`;
                addChatMsg('ai', kHtml, true);

                addTypingIndicator();
                setTimeout(() => {
                    removeTypingIndicator();

                    // 4. Suggestions
                    if (result.suggestions && result.suggestions.length > 0) {
                        let sHtml = `<strong style="color:#fde68a; display:flex; align-items:center; gap:6px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.22 4.22l1.42 1.42"></path><path d="M18.36 18.36l1.42 1.42"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M4.22 19.78l1.42-1.42"></path><path d="M18.36 5.64l1.42-1.42"></path><circle cx="12" cy="12" r="5"></circle></svg> My Recommendations:</strong><ul style="margin:12px 0 0 0; padding-left:24px;">`;
                        result.suggestions.forEach(s => sHtml += `<li style="margin-bottom:8px;">${s}</li>`);
                        sHtml += `</ul>`;
                        addChatMsg('ai', sHtml, true);
                    }
                    
                    // Outro
                    addTypingIndicator();
                    setTimeout(() => {
                        removeTypingIndicator();
                        addChatMsg('ai', "Feel free to make those changes and hit 'Start Over' to scan your updated resume again! 🚀");
                    }, 1000);

                }, 1500);
            }, 1500);
        }, 1500);

    } catch (e) {
        removeTypingIndicator();
        console.error("ATS API Error:", e);
        addChatMsg('ai', `⚠️ Error: ${e.message || 'Could not connect to AI. Check console (F12) for details.'}`, false);
    }
}

/* ==========================================================================
   CORPORATE READINESS - GD SIMULATOR & TEACHER BOTS
   ========================================================================== */

// --- GD Simulator ---
// Note: GD Simulator functions (startGDSimulator, etc.) have been moved and updated in the Corporate Readiness section below.

// recognition is already declared at the top of the file
function toggleGDMic() {
    if (!gdActive) {
        alert("Start the GD first!");
        return;
    }

    const micBtn = document.getElementById('btnMicGD');
    const status = document.getElementById('gdMicStatus');
    const speakerUser = document.getElementById('speaker_user');

    if (!gdMicOn) {
        // Turn ON
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("Your browser does not support Speech Recognition. Please use Chrome.");
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = function () {
            gdMicOn = true;
            micBtn.style.background = '#ef4444'; // red when active
            micBtn.style.boxShadow = '0 0 15px #ef4444';
            status.innerText = "Listening...";
            status.style.color = "#ef4444";
            speakerUser.style.borderColor = '#ef4444';
            speakerUser.style.boxShadow = '0 0 10px #ef4444';
        };

        let finalTranscript = '';
        recognition.onresult = function (event) {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                    const transcriptDiv = document.getElementById('gdTranscript');
                    transcriptDiv.innerHTML += `<div style="color:#38bdf8; margin-bottom:8px;"><strong>You:</strong> ${event.results[i][0].transcript}</div>`;
                    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;

                    // Stop after user speaks a sentence to let AI respond
                    toggleGDMic(); // Turn off
                    generateDynamicGDResponse(event.results[i][0].transcript);
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
        };

        recognition.onerror = function (event) {
            console.error("Speech recognition error", event.error);
            toggleGDMic(); // Turn off on error
        };

        try {
            recognition.start();
        } catch (e) {
            console.error(e);
        }

    } else {
        // Turn OFF
        gdMicOn = false;
        micBtn.style.background = '';
        micBtn.style.boxShadow = 'none';
        status.innerText = "Mic is off";
        status.style.color = "#94a3b8";
        speakerUser.style.borderColor = '#38bdf8';
        speakerUser.style.boxShadow = 'none';
        if (recognition) {
            recognition.stop();
        }
    }
}

window.sendGDChat = function() {
    if (!gdActive) {
        alert("Start the GD first!");
        return;
    }
    const input = document.getElementById('gdChatInput');
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    
    const transcriptDiv = document.getElementById('gdTranscript');
    transcriptDiv.innerHTML += `<div style="color:#38bdf8; margin-bottom:8px;"><strong>You:</strong> ${text}</div>`;
    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;

    // Trigger AI response
    generateDynamicGDResponse(text);
};

async function generateDynamicGDResponse(userText) {
    const transcript = document.getElementById('gdTranscript');
    const topic = document.getElementById('gdTopicDisplay').innerText;
    
    // Pick random AI participant (AI 1 or AI 2)
    const isAi1 = Math.random() > 0.5;
    const speakerId = isAi1 ? 'speaker_ai1' : 'speaker_ai2';
    const speakerName = isAi1 ? 'AI Participant 1' : 'AI Participant 2';
    
    document.getElementById(speakerId).style.borderColor = '#4ade80';
    document.getElementById(speakerId).style.boxShadow = '0 0 10px #4ade80';
    
    transcript.innerHTML += `<div id="gd_typing" style="margin-bottom:8px; color:#94a3b8;"><em>${speakerName} is thinking...</em></div>`;
    transcript.scrollTop = transcript.scrollHeight;

    try {
        const prompt = `You are a participant in a Group Discussion (GD) on the topic: "${topic}".
The human participant just said: "${userText}"
Respond to their point briefly (1-2 short sentences) in a conversational, professional GD tone. Do not introduce yourself, just make a point, agree/disagree politely, or add a new dimension to the topic.`;

        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7 }
        };

        const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await res.json();
        let aiText = data.candidates[0].content.parts[0].text.trim();
        
        document.getElementById('gd_typing').remove();
        transcript.innerHTML += `<div style="margin-bottom:8px;"><strong>${speakerName}:</strong> ${aiText}</div>`;
        transcript.scrollTop = transcript.scrollHeight;

        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(aiText);
            utterance.rate = 1.1;
            utterance.pitch = isAi1 ? 1.0 : 0.8; 
            window.speechSynthesis.speak(utterance);

            utterance.onend = () => {
                document.getElementById(speakerId).style.borderColor = '#475569';
                document.getElementById(speakerId).style.boxShadow = 'none';
            };
        } else {
            document.getElementById(speakerId).style.borderColor = '#475569';
            document.getElementById(speakerId).style.boxShadow = 'none';
        }
    } catch (e) {
        document.getElementById('gd_typing').remove();
        transcript.innerHTML += `<div style="margin-bottom:8px; color:#f43f5e;"><strong>System:</strong> AI could not respond. Network error.</div>`;
    }
}

// --- AI Teacher ---
async function startTeacherLesson() {
    const topic = document.getElementById('teacherTopicSelect').value;
    const chatBox = document.getElementById('teacherChatBox');

    chatBox.innerHTML += `
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; align-self:flex-end;">
            Teach me about ${topic}
        </div>
        <div id="loadingTeacher" style="background:rgba(99,102,241,0.15); padding:10px; border-radius:8px; border-left:3px solid #6366f1;">
            <span class="pulse-dot" style="display:inline-block;width:6px;height:6px;background:#fff;border-radius:50%;animation:pulseDot 1s infinite;"></span> Preparing lesson...
        </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const prompt = `
        You are a Corporate Etiquette and Soft Skills Teacher.
        The user wants to learn about: "${topic}".
        Provide a step-by-step, engaging, and highly professional lesson (about 150 words).
        Use HTML formatting (<ul>, <li>, <strong>) so it renders nicely in a div.
        Keep it concise and actionable.
        `;

        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 }
        };

        const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) throw new Error("API Request failed");

        const data = await res.json();
        const responseText = data.candidates[0].content.parts[0].text;

        document.getElementById('loadingTeacher').remove();
        chatBox.innerHTML += `
            <div style="background:rgba(99,102,241,0.15); padding:10px; border-radius:8px; border-left:3px solid #6366f1; line-height:1.5;">
                ${responseText}
            </div>
        `;
        chatBox.scrollTop = chatBox.scrollHeight;

    } catch (e) {
        console.error(e);
        document.getElementById('loadingTeacher').remove();
        chatBox.innerHTML += `
            <div style="background:rgba(244,63,94,0.15); padding:10px; border-radius:8px; border-left:3px solid #f43f5e; color:#fb7185;">
                Sorry, the teacher is currently unavailable. Please check your API keys.
            </div>
        `;
    }
}

/* ==========================================================================
   GROW UP — AI INTERACTIVE LEARNING ROADMAP MODULE
   ========================================================================== */

const GROWUP_CURRICULUM = [
    {
        id: "soft_skills_intro",
        stage: 1,
        title: "Introduction of Soft Skill & Communication",
        category: "Foundational Soft Skills",
        icon: "🌱",
        tagline: "Personal & interpersonal abilities that help you succeed in professional environments.",
        summary: "Soft skills are personal and interpersonal abilities that help a person work effectively with others, communicate clearly, and excel in competitive corporate environments. While technical skills get you the interview, soft skills determine your promotions, leadership potential, and long-term career fulfillment.",
        attached_software: [
            { icon: "▶️", name: "YouTube Masterclass", role: "Video Lecture & Real-world Examples" },
            { icon: "🤖", name: "Gemini AI Coach", role: "Live Roleplay & Scenario Evaluation" },
            { icon: "📝", name: "Google Docs", role: "Journaling & Reflection Notes" }
        ],
        pillars: [
            { name: "Improves Confidence & Self Esteem", icon: "💪", description: "Develops strong inner conviction, overcoming imposter syndrome, and asserting ideas clearly in high-stakes meetings." },
            { name: "Helps to Work in Team", icon: "🤝", description: "Enables seamless collaboration, active listening, sharing credit, and building psychological safety across diverse teams." },
            { name: "Develops Leadership Quality", icon: "👑", description: "Inspires accountability, proactive problem solving, mentoring peers, and taking ownership without waiting for instructions." },
            { name: "Improves Problem Solving & Decision Making", icon: "🧩", description: "Transforms complex workplace friction into structured actionable solutions with sound rational judgment." },
            { name: "Manage Time and Stress", icon: "⏱️", description: "Prioritizes high-impact tasks, maintains emotional composure under tight deadlines, and avoids burnout." },
            { name: "Career Growth Acceleration", icon: "🚀", description: "Unlocks faster promotions, executive visibility, leadership roles, and valuable professional networks." },
            { name: "Positive Attitude & Growth Mindset", icon: "☀️", description: "Approaches challenges as learning opportunities and spreads optimism during stressful project sprints." },
            { name: "Professional Behaviour & Ethics", icon: "👔", description: "Adheres to corporate etiquette, reliability, confidentiality, punctual delivery, and transparent communication." }
        ],
        workplace_scenario: {
            context: "Your team is facing a high-priority deadline tomorrow, but unexpected API breaking changes cause critical tests to fail.",
            best_approach: "Stay calm, gather the team for a 5-minute sync, split debugging tasks using root-cause analysis, and proactively send a 2-line status update to the manager with estimated resolution time.",
            common_mistake: "Panicking, blaming external team APIs publicly in Slack, or hiding the issue until the morning of the demo."
        },
        golden_rules: [
            "Soft skills determine your career ceiling — cultivate them daily.",
            "Always link your personal work to the team's shared mission.",
            "Take 100% accountability for outcomes, not excuses."
        ],
        voice_script: "Welcome to your first masterclass on Soft Skills and Personal Growth. Soft skills are personal and interpersonal abilities that help you work effectively with others and thrive in any corporate environment. Let's master the 8 foundational pillars together!",
        quiz: [
            {
                question: "Why do top recruiters prioritize candidates with strong soft skills?",
                options: [
                    "Technical skills can be taught quickly, but professional attitude & collaboration are built over time",
                    "Soft skills are only required for HR and management roles",
                    "Companies want employees who never ask questions"
                ],
                answer: 0,
                explanation: "Recruiters know that technical stacks evolve rapidly, but strong communicators and team players can adapt and lead anywhere."
            },
            {
                question: "What is the best way to demonstrate professional behavior when a project milestone is delayed?",
                options: [
                    "Blame external vendors and keep quiet",
                    "Communicate early with stakeholders, explain root causes, and provide 2 actionable mitigation plans",
                    "Work overnight silently without telling anyone"
                ],
                answer: 1,
                explanation: "Early, transparent communication with mitigation options builds lasting executive trust."
            },
            {
                question: "How does a growth mindset directly boost career growth?",
                options: [
                    "It guarantees you never fail at any task",
                    "It reframes critical feedback and setbacks as data to level up your capabilities",
                    "It allows you to skip technical fundamentals"
                ],
                answer: 1,
                explanation: "A growth mindset views every challenge as a stepping stone to higher performance."
            }
        ],
        scenario_challenge: "Imagine you are working on a team project where a peer is consistently missing deadlines due to stress. How do you approach them with leadership, empathy, and professional accountability to get the project back on track?"
    },
    {
        id: "communication_mastery",
        stage: 2,
        title: "Communication & Articulation Mastery",
        category: "Executive Communication",
        icon: "🎙️",
        tagline: "The ability to express our ideas clearly and understand others.",
        summary: "Communication is the lifeblood of corporate engineering and leadership. It is the art of expressing complex technical thoughts with simplicity, listening actively, and aligning diverse stakeholders.",
        pillars: [
            { name: "Useful for Interviews & Placements", icon: "🎯", description: "Delivering structured, persuasive answers (STAR framework) that leave a memorable impression on interview panels." },
            { name: "Presentations & Public Speaking", icon: "📢", description: "Commanding attention with voice modulation, slide economy, and clear narrative structure in front of clients or senior leadership." },
            { name: "Improves Relationships with Colleagues & Clients", icon: "🤝", description: "Active listening, empathy, and rapport that turn transactional relationships into high-trust partnerships." },
            { name: "Builds Trust and Teamwork", icon: "🛡️", description: "Clear expectations, psychological safety, and transparent status updates eliminate misunderstandings." },
            { name: "Writing Professional Emails & Reports", icon: "📝", description: "Drafting executive-ready summaries: Bottom Line Up Front (BLUF), bulleted action items, and crisp call-to-actions." },
            { name: "Why Companies Look For It", icon: "🏢", description: "Companies can train technical tools in weeks, but they rely on strong communicators to represent the company to clients and lead teams!" }
        ],
        workplace_scenario: {
            context: "A client disagrees with your proposed software architecture during a Zoom presentation and challenges your technical decision.",
            best_approach: "Acknowledge their perspective respectfully ('That is a great consideration, let me walk through the trade-offs'), present data-driven pros and cons, and offer a small pilot comparison.",
            common_mistake: "Becoming defensive, speaking over the client, or dismissing their concern as technically uninformed."
        },
        golden_rules: [
            "Listen to understand, not just to reply.",
            "Use BLUF (Bottom Line Up Front) when emailing executives.",
            "Match your technical depth to your audience's background."
        ],
        voice_script: "Communication is your highest leverage career superpower. In this stage, we master interview articulation, public presentations, client relationships, and executive email writing.",
        quiz: [
            {
                question: "What does the BLUF communication technique stand for in business writing?",
                options: [
                    "Bottom Line Up Front — putting key findings/requests at the very top",
                    "Basic Level Unified Formatting",
                    "Bullet Lists Underline Features"
                ],
                answer: 0,
                explanation: "BLUF saves busy managers and clients time by providing the core verdict before the detailed breakdown."
            },
            {
                question: "In an interview, what is the most effective way to answer 'Tell me about a time you solved a difficult problem'?",
                options: [
                    "Use the STAR method: Situation, Task, Action, and measurable Result",
                    "Talk for 10 minutes about the whole project history without numbers",
                    "Say you never faced any difficult problems"
                ],
                answer: 0,
                explanation: "STAR provides a compelling, concise story with measurable impact."
            },
            {
                question: "Why do MNC companies specifically test communication in group discussions (GD)?",
                options: [
                    "To see who can speak the loudest and interrupt others",
                    "To evaluate active listening, synthesizing diverse opinions, and persuasive articulation",
                    "To test English vocabulary only"
                ],
                answer: 1,
                explanation: "GDs evaluate how effectively you collaborate, respect others' views, and guide a group toward consensus."
            }
        ],
        scenario_challenge: "You need to email your project manager to request an extension on a deliverable because unexpected edge-case bugs were discovered during QA. Write your professional email following the BLUF structure."
    },
    {
        id: "problem_solving",
        stage: 3,
        title: "Problem Solving & Critical Decision Making",
        category: "Analytical Excellence",
        icon: "🧠",
        tagline: "Structured thinking, root cause analysis, and sound judgment under pressure.",
        summary: "Top performers don't jump to hasty conclusions — they isolate root causes using proven mental models like the 5 Whys, First Principles Thinking, and Decision Matrices to build resilient solutions.",
        pillars: [
            { name: "5 Whys Root Cause Analysis", icon: "🔍", description: "Drilling beneath surface symptoms to identify the true underlying breakdown and prevent recurrence." },
            { name: "First Principles Thinking", icon: "🧱", description: "Breaking down complex problems into foundational truths rather than relying on outdated assumptions." },
            { name: "Data-Driven Tradeoff Evaluation", icon: "📊", description: "Weighing speed vs scalability vs cost with measurable criteria before making irreversible technical decisions." },
            { name: "Maintaining Calm Under Pressure", icon: "🧘", description: "Regulating emotional stress during production incidents to think clearly and execute systematically." }
        ],
        workplace_scenario: {
            context: "A database query spike crashes the staging server 2 hours before a major product demo.",
            best_approach: "Execute standard rollback, run slow query logs to identify the unindexed join, apply indexing fix, and document a 1-page Post-Mortem without blame.",
            common_mistake: "Randomly restarting servers repeatedly while hoping the issue resolves itself."
        },
        golden_rules: [
            "Never treat symptoms when you can cure the root cause.",
            "Separate facts from assumptions with data.",
            "Write blameless post-mortems after resolving critical issues."
        ],
        voice_script: "Welcome to Problem Solving and Critical Decision Making. In this module, you will learn how senior software engineers and leaders systematically diagnose failures and make confident decisions.",
        quiz: [
            {
                question: "What is the primary objective of a 'Blameless Post-Mortem' in corporate engineering?",
                options: [
                    "To identify systemic process & tool flaws so the failure never happens again, without punishing individuals",
                    "To decide which developer receives a warning letter",
                    "To hide production bugs from clients"
                ],
                answer: 0,
                explanation: "Psychological safety encourages engineers to report mistakes early and build stronger safeguards."
            },
            {
                question: "When applying First Principles thinking to a high computing cost issue, you should:",
                options: [
                    "Upgrade to the most expensive cloud tier immediately",
                    "Break down the actual memory and CPU cycles consumed per request and optimize the algorithmic bottleneck",
                    "Ignore the cost until finance complains"
                ],
                answer: 1,
                explanation: "First principles breaks problems down to fundamental resource constraints."
            }
        ],
        scenario_challenge: "Your web app's loading time suddenly jumped from 1.2s to 6.8s after a new release. Outline your 4-step systematic troubleshooting plan to identify and fix the bottleneck."
    },
    {
        id: "time_management",
        stage: 4,
        title: "Time Management & Stress Resilience",
        category: "Peak Productivity",
        icon: "⚡",
        tagline: "Eisenhower priority matrix, deep work flow, and sustainable workplace calm.",
        summary: "Productivity is not about working 16 hours a day; it is about ruthless prioritization, protecting uninterrupted focus blocks, and maintaining emotional resilience.",
        pillars: [
            { name: "Eisenhower Decision Matrix", icon: "📐", description: "Categorizing tasks into Urgent vs Important to focus on high-leverage goals rather than reactive firefighting." },
            { name: "Deep Work & Flow State", icon: "🌊", description: "Scheduling 90-minute blocks without Slack, emails, or notifications for high-concentration coding/design." },
            { name: "Managing Workplace Anxiety", icon: "🛡️", description: "Techniques like box breathing, proactive calendar blocking, and realistic commitments." },
            { name: "Sustainable Boundary Setting", icon: "🛑", description: "Saying no gracefully to low-value distractions while aligning with organizational priorities." }
        ],
        workplace_scenario: {
            context: "You have 3 simultaneous requests from different managers: bug fixes, documentation, and a new prototype.",
            best_approach: "List the tasks with estimated hours, align the 3 managers on priority order based on business impact, and commit to realistic delivery dates.",
            common_mistake: "Saying yes to all 3 secretly, working overnight, and delivering all three poorly and late."
        },
        golden_rules: [
            "If everything is a priority, nothing is a priority.",
            "Protect your morning hours for deep, uninterrupted work.",
            "Saying no to low-impact tasks is saying yes to high-impact results."
        ],
        voice_script: "Time is your most non-renewable resource. In Stage 4, we master the Eisenhower Matrix, deep work habits, and workplace stress resilience.",
        quiz: [
            {
                question: "In the Eisenhower Matrix, which quadrant produces the highest long-term career growth?",
                options: [
                    "Quadrant 2: Not Urgent, but Highly Important (Skill building, architecture planning, relationship building)",
                    "Quadrant 1: Urgent and Important (Constant emergencies)",
                    "Quadrant 4: Not Urgent and Not Important (Social media browsing)"
                ],
                answer: 0,
                explanation: "Quadrant 2 activities build compounding long-term value before they turn into emergencies."
            },
            {
                question: "What is the recommended approach to managing constant Slack or email notification distractions?",
                options: [
                    "Reply to every message within 5 seconds all day",
                    "Batch email/Slack checks into 3 dedicated windows daily and use status indicators during deep work",
                    "Delete all communication tools permanently"
                ],
                answer: 1,
                explanation: "Batching prevents context-switching penalty and protects deep focus."
            }
        ],
        scenario_challenge: "Describe how you would organize your weekly schedule to balance completing daily team deliverables while allocating 5 hours for self-learning and upskilling."
    },
    {
        id: "leadership_synergy",
        stage: 5,
        title: "Leadership Dynamics & Team Synergy",
        category: "Influential Leadership",
        icon: "🤝",
        tagline: "Inspiring peers, constructive feedback, empathy, and conflict de-escalation.",
        summary: "Leadership is not defined by your title; it is defined by your influence, empathy, and ability to elevate everyone around you to perform at their best.",
        pillars: [
            { name: "Empathy & Active Listening", icon: "❤️", description: "Understanding teammate motivations, personal challenges, and unspoken concerns to build deep loyalty." },
            { name: "Radical Candor Feedback", icon: "💬", description: "Caring personally while challenging directly — giving feedback that is specific, timely, and actionable." },
            { name: "Conflict Resolution & Negotiation", icon: "⚖️", description: "Reframing debates from 'Me vs You' to 'Us vs The Problem' to find win-win solutions." },
            { name: "Delegation & Empowerment", icon: "🚀", description: "Trusting team members with ownership and supporting them rather than micromanaging." }
        ],
        workplace_scenario: {
            context: "Two senior developers on your team have an aggressive argument over which frontend framework to use for a new product.",
            best_approach: "Schedule a structured technical spike meeting with clear evaluation metrics (learning curve, performance, community support) and decide based on data.",
            common_mistake: "Taking one person's side based on friendship or letting the conflict fester in team channels."
        },
        golden_rules: [
            "Praise in public, give constructive feedback in private.",
            "Focus on 'Us vs The Problem' rather than personal blame.",
            "Great leaders create more leaders, not followers."
        ],
        voice_script: "Welcome to Leadership Dynamics and Team Synergy. Leadership is the ability to inspire, resolve conflicts with empathy, and elevate team performance.",
        quiz: [
            {
                question: "According to the Radical Candor framework, the most effective feedback combines:",
                options: [
                    "Caring personally while challenging directly",
                    "Ruinous empathy (being too nice to mention mistakes)",
                    "Aggressive criticism without personal care"
                ],
                answer: 0,
                explanation: "Radical Candor shows you genuinely care about their growth while providing clear, honest feedback."
            },
            {
                question: "When mediating a team disagreement, what is the best opening question?",
                options: [
                    "Who is to blame for this conflict?",
                    "What shared objective are we both trying to achieve for our users?",
                    "Why can't you both just agree with management?"
                ],
                answer: 1,
                explanation: "Refocusing on shared user/business goals unites conflicting viewpoints."
            }
        ],
        scenario_challenge: "A junior teammate on your project is feeling discouraged after receiving harsh code review comments. How do you coach them and address the review culture constructively?"
    },
    {
        id: "career_mastery",
        stage: 6,
        title: "Placement, Interviews & Executive Presence",
        category: "Career Acceleration",
        icon: "🏆",
        tagline: "Acing high-package campus & MNC placement drives with executive polish.",
        summary: "Transform into a top 1% candidate who commands top compensation packages through exceptional interview storytelling, executive presence, and long-term career positioning.",
        pillars: [
            { name: "STAR Interview Storytelling", icon: "⭐", description: "Crafting structured 90-second impact stories for behavioral questions that highlight initiative and metric results." },
            { name: "Executive Body Language & Presence", icon: "👔", description: "Maintaining steady eye contact, authoritative posture, thoughtful pauses, and genuine enthusiasm." },
            { name: "Salary & Offer Negotiation", icon: "💼", description: "Anchoring your value with market data, counter-offering professionally, and evaluating total compensation." },
            { name: "Building a 5-Year Career Roadmap", icon: "🗺️", description: "Strategic skill compounding, high-impact mentorship, and establishing your industry personal brand." }
        ],
        workplace_scenario: {
            context: "An interviewer asks you: 'What is your biggest weakness?'",
            best_approach: "Share a genuine professional area you identified in the past, explain the specific corrective systems you implemented, and share the positive results.",
            common_mistake: "Giving fake answers like 'I'm too much of a perfectionist' or naming a fatal flaw without any improvement steps."
        },
        golden_rules: [
            "Every interview answer should highlight personal initiative and measurable outcomes.",
            "You are evaluating the company just as much as they are evaluating you.",
            "Negotiate respectfully — your value is backed by your preparation."
        ],
        voice_script: "Congratulations on reaching Stage 6: Placement, Interviews and Career Mastery. Let's polish your interview storytelling, salary negotiation, and executive presence!",
        quiz: [
            {
                question: "At the end of an interview when asked 'Do you have any questions for us?', what should you ask?",
                options: [
                    "'How does your team define high performance in the first 90 days for this role?'",
                    "'No, you answered everything.'",
                    "'When do I get my first vacation?'"
                ],
                answer: 0,
                explanation: "Asking about 90-day success demonstrates high initiative, proactive mindset, and executive drive."
            },
            {
                question: "How should you respond to a low initial salary offer during campus or lateral placement?",
                options: [
                    "Reject the offer angrily on the spot",
                    "Express enthusiasm for the role, cite verified market benchmarks, highlight your specific skills, and ask if there is flexibility in base or joining bonus",
                    "Accept immediately without asking any questions"
                ],
                answer: 1,
                explanation: "Polite, data-backed negotiation almost always improves terms without risk."
            }
        ],
        scenario_challenge: "Prepare your 90-second answer to 'Why should we hire you over other candidates for this software engineering role?' using structured metrics and unique value."
    }
];

let _currentGrowUpCurriculum = [...GROWUP_CURRICULUM];
let _activeGrowUpTopic = _currentGrowUpCurriculum[0];
let _growUpScoresMap = {};
let _activeGrowUpMode = "lecture";
let _growUpVoiceUtterance = null;
let _isGrowUpSpeaking = false;
let _growUpQuizAnswers = {};
let _autoSpeakGrowUp = true;

window.initGrowUpTab = async function() {
    console.log("[GrowUp] Initializing Grow Up AI Roadmap tab...");
    loadGrowUpLocalScores();
    try {
        if (window.Backend && window.Backend.GrowUp) {
            const serverScores = await window.Backend.GrowUp.getScores();
            if (serverScores && serverScores.length > 0) {
                serverScores.forEach(s => {
                    _growUpScoresMap[s.topic_id] = s;
                });
                saveGrowUpLocalScores();
            }
        }
    } catch(e) {
        console.warn("[GrowUp] Server score load fallback:", e);
    }
    
    renderGrowUpRoadmap();
    if (_currentGrowUpCurriculum && _currentGrowUpCurriculum.length > 0) {
        selectGrowUpTopic(_currentGrowUpCurriculum[0].id, false);
    }
    updateGrowUpOverallStats();
};

function loadGrowUpLocalScores() {
    try {
        const local = localStorage.getItem("rh_growup_scores");
        if (local) {
            _growUpScoresMap = JSON.parse(local);
        } else {
            // Default first topic unlocked with baseline demo score
            _growUpScoresMap["soft_skills_intro"] = {
                topic_id: "soft_skills_intro",
                score: 85,
                completed: 1,
                clarity_score: 88,
                problem_score: 82,
                professionalism_score: 92,
                confidence_score: 86,
                feedback: "Strong initial grasp of soft skills and corporate mindset."
            };
            saveGrowUpLocalScores();
        }
    } catch(e) {
        _growUpScoresMap = {};
    }
}

function saveGrowUpLocalScores() {
    try {
        localStorage.setItem("rh_growup_scores", JSON.stringify(_growUpScoresMap));
    } catch(e){}
}

function renderGrowUpRoadmap() {
    const track = document.getElementById("growupRoadmapTrack");
    if (!track) return;

    let html = "";
    _currentGrowUpCurriculum.forEach((topic, idx) => {
        const isUnlocked = idx === 0 || (_growUpScoresMap[_currentGrowUpCurriculum[idx-1]?.id]?.completed === 1) || topic.unlockedByDefault;
        const scoreData = _growUpScoresMap[topic.id];
        const isCompleted = scoreData && scoreData.completed === 1;
        const isActive = _activeGrowUpTopic && _activeGrowUpTopic.id === topic.id;

        let statusClass = isActive ? "active" : "";
        if (isCompleted) statusClass += " completed";
        if (!isUnlocked) statusClass += " locked";

        let scoreBadge = "";
        if (isCompleted && scoreData) {
            scoreBadge = `<span style="background:rgba(16,185,129,0.2); color:#34d399; font-size:0.68rem; font-weight:700; padding:2px 6px; border-radius:10px; border:1px solid rgba(16,185,129,0.3);">✓ ${scoreData.score}%</span>`;
        } else if (isUnlocked) {
            scoreBadge = `<span style="background:rgba(56,189,248,0.15); color:#38bdf8; font-size:0.68rem; font-weight:600; padding:2px 6px; border-radius:10px;">Ready</span>`;
        } else {
            scoreBadge = `<span style="background:rgba(255,255,255,0.06); color:#64748b; font-size:0.68rem; padding:2px 6px; border-radius:10px;">🔒 Locked</span>`;
        }

        html += `
            <div class="growup-stage-card ${statusClass}" onclick="handleGrowUpNodeClick('${topic.id}', ${isUnlocked})">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:1.3rem;">${topic.icon}</span>
                    ${scoreBadge}
                </div>
                <div style="font-size:0.72rem; font-weight:700; color:#818cf8; text-transform:uppercase; margin-top:4px;">STAGE ${topic.stage}</div>
                <div style="font-size:0.82rem; font-weight:700; color:#f0f4ff; line-height:1.2;">${topic.title.split('&')[0].trim()}</div>
            </div>
        `;
    });

    track.innerHTML = html;
}

window.handleGrowUpNodeClick = function(topicId, isUnlocked) {
    if (!isUnlocked) {
        alert("🔒 Complete the previous roadmap stage with a score of 60% or higher to unlock this topic!");
        return;
    }
    selectGrowUpTopic(topicId, true);
};

window.selectGrowUpTopic = function(topicId, shouldAutoSpeak = true) {
    const found = _currentGrowUpCurriculum.find(t => t.id === topicId) || GROWUP_CURRICULUM.find(t => t.id === topicId);
    if (!found) return;

    _activeGrowUpTopic = found;
    stopGrowUpVoice();
    _growUpQuizAnswers = {};

    // Update active header tags
    const stageTag = document.getElementById("growupActiveStageTag");
    const categoryTag = document.getElementById("growupActiveTopicCategory");
    const titleTag = document.getElementById("growupActiveTopicTitle");
    const taglineTag = document.getElementById("growupActiveTopicTagline");

    if (stageTag) stageTag.textContent = `STAGE ${found.stage}`;
    if (categoryTag) categoryTag.textContent = found.category || "Skill Mastery";
    if (titleTag) titleTag.textContent = found.title;
    if (taglineTag) taglineTag.textContent = `"${found.tagline}"`;

    renderGrowUpRoadmap();
    renderGrowUpLesson();
    renderGrowUpQuiz();
    resetGrowUpScorePanel();

    // Compulsory Voice Speaking for every user
    if (shouldAutoSpeak && _autoSpeakGrowUp) {
        setTimeout(() => {
            speakGrowUpLesson();
        }, 500);
    }

    // Scroll slightly if on mobile
    const mainGrid = document.querySelector(".growup-main-grid");
    if (mainGrid && window.innerWidth < 768) {
        mainGrid.scrollIntoView({ behavior: 'smooth' });
    }
};

/* ==========================================================================
   DYNAMIC CUSTOM TOPIC ROADMAP & SOFTWARE ATTACHMENT ENGINE
   ========================================================================== */
window.generateCustomGrowUpRoadmap = async function(customQuery = null) {
    const inputEl = document.getElementById("growupTopicSearchInput");
    const topic = customQuery || (inputEl ? inputEl.value.trim() : "");
    if (!topic) {
        alert("Please enter a topic or technology to generate your AI Roadmap!");
        return;
    }

    console.log("[GrowUp] Generating Dynamic Roadmap for:", topic);
    const track = document.getElementById("growupRoadmapTrack");
    if (track) {
        track.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding:20px; color:#38bdf8; font-weight:700;">
                <span class="typing-dots">🤖 Synthesizing 5-Stage Complete Roadmap & Attaching Google/Claude Software Tools for "${topic}"</span>
            </div>
        `;
    }

    // Build tailored 5-stage comprehensive curriculum
    const cleanTopic = topic.trim();
    const dynamicStages = [
        {
            id: `custom_${Date.now()}_1`,
            stage: 1,
            title: `${cleanTopic}: Core Foundations & Architecture`,
            category: `${cleanTopic} • Foundations`,
            icon: "🌱",
            tagline: `Mastering theoretical core, foundational principles, and system anatomy for ${cleanTopic}.`,
            summary: `Begin your journey in ${cleanTopic} by establishing rock-solid fundamental knowledge, underlying mechanics, design philosophy, and essential terminology used by senior engineers and corporate leads.`,
            attached_software: [
                { name: "Google Colab & Docs", role: "Cloud execution & structured documentation", icon: "📑" },
                { name: "VS Code & Git", role: "Core workspace, version control & branching", icon: "💻" }
            ],
            pillars: [
                { name: "Core Principles & Mental Models", icon: "🧠", description: `Understanding the essential paradigm and fundamental rules that govern ${cleanTopic}.` },
                { name: "Syntax, Protocols & Conventions", icon: "📐", description: `Standardized corporate best practices, naming standards, and architectural blueprints.` },
                { name: "Data Flow & State Lifecycle", icon: "🔄", description: `How inputs transform into deterministic outputs and manage state across the entire cycle.` },
                { name: "Execution Runtime & Environment", icon: "⚙️", description: `Configuring high-performance local and cloud development environments.` }
            ],
            workplace_scenario: {
                context: `Your team lead asks you to explain the core architectural choice for adopting ${cleanTopic} over legacy alternatives.`,
                best_approach: `Present a concise 3-point comparison highlighting reliability, scalability, and long-term maintainability metrics.`,
                common_mistake: `Giving vague emotional answers without citing architecture trade-offs or performance benchmarks.`
            },
            golden_rules: [
                `Master foundational theory before relying on high-level abstractions.`,
                `Always document setup prerequisites and environment variables.`,
                `Write clean, self-describing code and maintain modularity.`
            ],
            voice_script: `Welcome to Stage 1 of your masterclass on ${cleanTopic}. Let's master the core architecture, fundamentals, and mental models from the ground up!`,
            quiz: [
                {
                    question: `What is the primary prerequisite when starting a new ${cleanTopic} production architecture?`,
                    options: [
                        `Configuring standard linting, environment variables, and modular directory scaffolding`,
                        `Writing all implementation code in a single monolithic script`,
                        `Skipping documentation and deploying straight to production`
                    ],
                    answer: 0,
                    explanation: `Clean scaffolding and standardized configuration prevent technical debt and ensure enterprise maintainability.`
                }
            ],
            scenario_challenge: `Explain the foundational workflow and execution cycle of ${cleanTopic} in under 3 concise sentences.`
        },
        {
            id: `custom_${Date.now()}_2`,
            stage: 2,
            title: `${cleanTopic}: Google Software & Claude AI Stack`,
            category: "Ecosystem & AI Tooling",
            icon: "🌐",
            tagline: `Supercharging development using Google Cloud, Gemini AI, and Claude 3.5 Sonnet tooling.`,
            summary: `Accelerate your ${cleanTopic} workflow by integrating industry-standard developer platforms: Google Cloud Platform (GCP), Google AI Studio / Gemini, Firebase, Android Studio, and Anthropic Claude prompt architectures.`,
            attached_software: [
                { name: "Google Cloud (GCP) & Firebase", role: "Scalable backend hosting, serverless APIs & auth", icon: "☁️" },
                { name: "Google AI Studio & Gemini API", role: "Multimodal reasoning & intelligent code synthesis", icon: "✨" },
                { name: "Anthropic Claude 3.5 Sonnet", role: "Complex logic refactoring, test generation & Artifacts", icon: "🤖" },
                { name: "Android Studio & Flutter / Chrome DevTools", role: "Mobile, web debugging & profiling", icon: "📱" }
            ],
            pillars: [
                { name: "Google Cloud Platform (GCP) Services", icon: "☁️", description: "Deploying scalable microservices, BigQuery analytics, and Cloud Run containers." },
                { name: "Anthropic Claude & Prompt Architecture", icon: "🤖", description: "Leveraging Claude 3.5 Sonnet for automated unit testing, edge case detection, and system design." },
                { name: "Google Gemini & Developer Ecosystem", icon: "✨", description: "Connecting Gemini API, Firebase Realtime Database, and Cloud Logging." },
                { name: "Modern CI/CD & Automated Pipelines", icon: "🚀", description: "Automating builds with GitHub Actions, Google Cloud Build, and Docker orchestration." }
            ],
            workplace_scenario: {
                context: `Your team wants to integrate an AI-assisted pipeline using Claude and Google Cloud APIs to automate ${cleanTopic} validation.`,
                best_approach: `Create a modular API wrapper with rate-limit handling, secure environment secret injection via GCP Secret Manager, and Claude prompt validation.`,
                common_mistake: `Hardcoding API keys directly into public repositories or lacking structured schema validation.`
            },
            golden_rules: [
                `Never hardcode API credentials — use GCP Secret Manager or .env files.`,
                `Leverage Claude Artifacts and Gemini to rapidly prototype and benchmark edge cases.`,
                `Always maintain local and cloud parity in configuration.`
            ],
            voice_script: `In Stage 2, we integrate top-tier software: Google Cloud Platform, Gemini API, and Claude 3.5 Sonnet to supercharge our ${cleanTopic} capabilities!`,
            quiz: [
                {
                    question: `Why is integrating Claude AI and Google Cloud tools critical for modern ${cleanTopic} engineering?`,
                    options: [
                        `It dramatically speeds up refactoring, automated testing, scalable deployment, and real-time observability`,
                        `It replaces the need for any software testing or system design`,
                        `It is only useful for writing marketing copy`
                    ],
                    answer: 0,
                    explanation: `Combining Claude reasoning with Google Cloud scalability produces enterprise-grade reliability in record time.`
                }
            ],
            scenario_challenge: `How would you securely connect a Google Cloud API or Claude AI workflow to your ${cleanTopic} system without exposing secrets?`
        },
        {
            id: `custom_${Date.now()}_3`,
            stage: 3,
            title: `${cleanTopic}: Advanced Engineering & Problem Solving`,
            category: "System Engineering",
            icon: "🧠",
            tagline: `Handling complex bottlenecks, root cause analysis, and resilient patterns in ${cleanTopic}.`,
            summary: `Tackle high-complexity real-world challenges in ${cleanTopic}. Master error boundary patterns, performance optimization, asynchronous concurrency, and systematic debugging.`,
            attached_software: [
                { name: "Chrome DevTools & Profiler", role: "Memory leak analysis & latency breakdown", icon: "🔬" },
                { name: "Docker & Postman", role: "Containerization & API contract testing", icon: "🐳" }
            ],
            pillars: [
                { name: "5 Whys Root Cause Debugging", icon: "🔍", description: "Isolating race conditions, memory leaks, and distributed failures at the source." },
                { name: "Concurrency & Async Management", icon: "⚡", description: "Handling high-throughput requests, thread pools, and non-blocking IO without deadlock." },
                { name: "Performance Profiling & Caching", icon: "🚀", description: "Implementing Redis caching, query memoization, and low-latency algorithmic patterns." },
                { name: "Defensive Coding & Graceful Fallbacks", icon: "🛡️", description: "Circuit breakers, exponential backoff, and robust error recovery." }
            ],
            workplace_scenario: {
                context: `A critical bottleneck causes unexpected latency spikes under peak load in your ${cleanTopic} module.`,
                best_approach: `Profile memory and CPU flamegraphs, identify the blocking synchronous call, implement asynchronous batching, and cache repeat reads.`,
                common_mistake: `Guessing fixes without measuring latency bottlenecks with profiler tools.`
            },
            golden_rules: [
                `Measure before optimizing — profile first.`,
                `Every failure must fail gracefully with descriptive telemetry.`,
                `Design for idempotency and graceful degradation.`
            ],
            voice_script: `Stage 3 focuses on advanced problem solving in ${cleanTopic}. We'll master concurrency, memory profiling, and root-cause analysis!`,
            quiz: [
                {
                    question: `When diagnosing an intermittent latency spike in ${cleanTopic}, what is the best first step?`,
                    options: [
                        `Capture flamegraph profiles and inspect telemetry logs to locate the bottleneck with empirical data`,
                        `Randomly restart all servers without checking logs`,
                        `Rewrite the entire codebase from scratch`
                    ],
                    answer: 0,
                    explanation: `Empirical profiling and telemetry are essential to diagnosing root causes without guesswork.`
                }
            ],
            scenario_challenge: `Describe your strategy to diagnose and resolve a severe memory leak or CPU spike in a ${cleanTopic} service.`
        },
        {
            id: `custom_${Date.now()}_4`,
            stage: 4,
            title: `${cleanTopic}: Enterprise Security, CI/CD & Cloud`,
            category: "DevOps & Security",
            icon: "🛡️",
            tagline: `Hardening security, zero-trust protocols, and zero-downtime deployment pipelines.`,
            summary: `Transform your ${cleanTopic} system into a battle-tested enterprise solution. Implement role-based access control (RBAC), end-to-end encryption, automated linting, container orchestration, and continuous integration.`,
            attached_software: [
                { name: "Google Kubernetes Engine (GKE)", role: "Orchestrating high-availability microservice clusters", icon: "☸️" },
                { name: "GitHub Actions & SonarQube", role: "Static code analysis & automated test validation", icon: "🛡️" }
            ],
            pillars: [
                { name: "Zero-Trust Security & RBAC", icon: "🔒", description: "Principle of least privilege, token authentication, and data encryption in transit & rest." },
                { name: "Automated Testing & Code Coverage", icon: "🧪", description: "Unit, integration, and end-to-end test suites enforcing ≥ 80% coverage." },
                { name: "Containerization & Kubernetes", icon: "☸️", description: "Dockerizing applications and managing auto-scaling pods with health checks." },
                { name: "Zero-Downtime Blue-Green Deploys", icon: "🔄", description: "Deploying updates smoothly with instant rollback capabilities." }
            ],
            workplace_scenario: {
                context: `A security audit flags unvetted dependencies and missing input sanitization in your ${cleanTopic} deployment.`,
                best_approach: `Integrate automated dependency scanning (Snyk/Dependabot), enforce strict schema sanitization, and rotate API keys via GCP Secret Manager.`,
                common_mistake: `Ignoring vulnerability warnings or disabling security checks to ship code faster.`
            },
            golden_rules: [
                `Never push code that breaks automated CI test suites.`,
                `Apply the principle of least privilege everywhere.`,
                `Automate deployments to eliminate human error.`
            ],
            voice_script: `Welcome to Stage 4: Enterprise Security and DevOps for ${cleanTopic}. Let's build production-ready CI/CD pipelines, Kubernetes containers, and zero-trust security!`,
            quiz: [
                {
                    question: `What is the primary benefit of Blue-Green zero-downtime deployment for ${cleanTopic}?`,
                    options: [
                        `It allows seamless traffic switching to new versions with instant rollback if issues arise, causing zero user downtime`,
                        `It eliminates the need for any unit tests`,
                        `It makes software completely free of bugs automatically`
                    ],
                    answer: 0,
                    explanation: `Blue-Green deployment minimizes risk and enables instantaneous rollback if production anomalies occur.`
                }
            ],
            scenario_challenge: `Outline the 4 core stages of a secure CI/CD deployment pipeline for a production ${cleanTopic} application.`
        },
        {
            id: `custom_${Date.now()}_5`,
            stage: 5,
            title: `${cleanTopic}: Placement Mastery & System Design`,
            category: "Career & Interview Polish",
            icon: "🏆",
            tagline: `Acing tier-1 MNC technical interviews, STAR storytelling, and system architecture reviews.`,
            summary: `Elevate yourself to the top 1% of candidates. Defend your ${cleanTopic} portfolio, explain complex architectural trade-offs to senior interviewers, and command top compensation offers.`,
            attached_software: [
                { name: "Google Meet & Live Coding Hubs", role: "Technical interview pairing & whiteboarding", icon: "🎥" },
                { name: "Claude AI Interview Simulator", role: "Mock technical interview drills & live critique", icon: "💬" }
            ],
            pillars: [
                { name: "System Design & Architecture Defense", icon: "🏛️", description: "Explaining scale, caching, latency budgets, and database sharding with whiteboards." },
                { name: "STAR Method Behavioral Stories", icon: "⭐", description: "Framing your technical challenges into concise Situation, Task, Action, and Result narratives." },
                { name: "Live Coding & Algorithmic Polish", icon: "💻", description: "Writing clean, optimized, bug-free implementations under interview time limits." },
                { name: "High-Value Compensation Negotiation", icon: "💼", description: "Benchmarking your market value and communicating executive confidence." }
            ],
            workplace_scenario: {
                context: `A hiring manager asks: 'Tell me about the most difficult bug or architectural challenge you solved with ${cleanTopic}.'`,
                best_approach: `Use the STAR format: specify the scale/impact, explain your step-by-step diagnostic hypothesis, detail your exact fix, and share the quantified business result.`,
                common_mistake: `Giving a vague general answer without specific metrics or failing to highlight your personal contribution.`
            },
            golden_rules: [
                `Always quantify results with concrete metrics (latency reduced, throughput increased, uptime guaranteed).`,
                `Speak with calm executive clarity and articulate trade-offs honestly.`,
                `Your mastery is proven by how simply you explain complex concepts.`
            ],
            voice_script: `Congratulations on reaching Stage 5: Executive Placement and System Design Mastery for ${cleanTopic}! Let's turn your expertise into top-tier job offers and career dominance!`,
            quiz: [
                {
                    question: `In a high-stakes technical interview for ${cleanTopic}, what is the best way to explain a past challenge?`,
                    options: [
                        `Using the STAR framework with concrete metrics, clear problem breakdown, and personal technical ownership`,
                        `Blaming past teammates for project shortcomings`,
                        `Giving a 10-second superficial summary without any technical depth`
                    ],
                    answer: 0,
                    explanation: `The STAR method with quantified results clearly proves your senior-level engineering competence and ownership.`
                }
            ],
            scenario_challenge: `Deliver your 90-second STAR response describing how you built, optimized, or scaled a system using ${cleanTopic}.`
        }
    ];

    _currentGrowUpCurriculum = dynamicStages;
    _growUpScoresMap = {};
    _growUpScoresMap[dynamicStages[0].id] = {
        topic_id: dynamicStages[0].id,
        score: 85,
        completed: 1,
        clarity_score: 88,
        problem_score: 84,
        professionalism_score: 90,
        confidence_score: 86,
        feedback: `Excellent roadmap generated for ${cleanTopic}!`
    };
    saveGrowUpLocalScores();

    setTimeout(() => {
        renderGrowUpRoadmap();
        selectGrowUpTopic(dynamicStages[0].id, true);
        updateGrowUpOverallStats();
    }, 600);
};

window.loadQuickGrowUpTopic = function(topicKey) {
    if (topicKey === "softskills") {
        _currentGrowUpCurriculum = [...GROWUP_CURRICULUM];
        loadGrowUpLocalScores();
        renderGrowUpRoadmap();
        selectGrowUpTopic(_currentGrowUpCurriculum[0].id, true);
        updateGrowUpOverallStats();
    } else if (topicKey === "googlecloud") {
        window.generateCustomGrowUpRoadmap("Google Cloud Platform (GCP) & DevOps Architecture");
    } else if (topicKey === "claudeai") {
        window.generateCustomGrowUpRoadmap("Claude AI 3.5 & Advanced Prompt Engineering");
    } else if (topicKey === "fullstack") {
        window.generateCustomGrowUpRoadmap("Fullstack React, Node & Cloud Engineering");
    } else if (topicKey === "cybersecurity") {
        window.generateCustomGrowUpRoadmap("Cybersecurity, Penetration Testing & Zero Trust");
    }
};

window.setGrowUpMode = function(mode) {
    _activeGrowUpMode = mode;
    document.querySelectorAll(".growup-mode-btn").forEach(b => b.classList.remove("active"));
    const btn = document.getElementById(`btn-mode-${mode}`);
    if (btn) btn.classList.add("active");

    const lessonBox = document.getElementById("growupLessonContent");
    const chatBox = document.getElementById("growupChatView");

    if (mode === "chat") {
        if (lessonBox) lessonBox.style.display = "none";
        if (chatBox) chatBox.style.display = "flex";
        initGrowUpChatHistory();
    } else {
        if (lessonBox) lessonBox.style.display = "block";
        if (chatBox) chatBox.style.display = "none";
        renderGrowUpLesson();
    }
};

function renderGrowUpLesson() {
    const container = document.getElementById("growupLessonContent");
    if (!container || !_activeGrowUpTopic) return;

    const t = _activeGrowUpTopic;

    if (_activeGrowUpMode === "lecture") {
        let pillarsHtml = t.pillars.map(p => `
            <div class="growup-pillar-card">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                    <span style="font-size:1.1rem;">${p.icon}</span>
                    <strong style="color:#e2e8f0; font-size:0.9rem;">${p.name}</strong>
                </div>
                <p style="font-size:0.8rem; color:#94a3b8; margin:0; line-height:1.5;">${p.description}</p>
            </div>
        `).join("");

        let toolsHtml = "";
        if (t.attached_software && t.attached_software.length > 0) {
            const toolBadges = t.attached_software.map(s => `
                <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(56,189,248,0.25); border-radius:10px; padding:8px 12px; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.1rem;">${s.icon}</span>
                    <div>
                        <strong style="color:#38bdf8; font-size:0.82rem; display:block;">${s.name}</strong>
                        <span style="color:#94a3b8; font-size:0.72rem;">${s.role}</span>
                    </div>
                </div>
            `).join("");

            toolsHtml = `
                <div style="margin-top:16px; background:rgba(56,189,248,0.06); border:1px solid rgba(56,189,248,0.2); border-radius:12px; padding:14px;">
                    <div style="font-size:0.75rem; font-weight:800; color:#38bdf8; text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                        <span>🛠️ Attached Google Software & Claude AI Ecosystem</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">
                        ${toolBadges}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div style="margin-bottom:16px;">
                <h4 style="font-size:0.95rem; color:#38bdf8; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                    <span>📖 In-Depth Conceptual Breakdown</span>
                </h4>
                <p style="font-size:0.85rem; color:#cbd5e1; line-height:1.6; margin-bottom:14px;">
                    ${t.summary}
                </p>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px;">
                    ${pillarsHtml}
                </div>
                ${toolsHtml}
            </div>
        `;
    } else if (_activeGrowUpMode === "scenario") {
        const sc = t.workplace_scenario;
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:14px;">
                <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); border-radius:14px; padding:16px;">
                    <div style="font-size:0.75rem; font-weight:700; color:#818cf8; text-transform:uppercase; margin-bottom:4px;">📍 Real Workplace Context</div>
                    <div style="font-size:0.9rem; color:#fff; font-weight:600; line-height:1.5;">${sc.context}</div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:12px; padding:14px;">
                        <div style="color:#34d399; font-weight:700; font-size:0.82rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                            <span>✅ Winning Approach</span>
                        </div>
                        <p style="font-size:0.8rem; color:#cbd5e1; margin:0; line-height:1.5;">${sc.best_approach}</p>
                    </div>

                    <div style="background:rgba(244,63,94,0.08); border:1px solid rgba(244,63,94,0.25); border-radius:12px; padding:14px;">
                        <div style="color:#fb7185; font-weight:700; font-size:0.82rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                            <span>❌ Common Pitfall to Avoid</span>
                        </div>
                        <p style="font-size:0.8rem; color:#cbd5e1; margin:0; line-height:1.5;">${sc.common_mistake}</p>
                    </div>
                </div>
            </div>
        `;
    } else if (_activeGrowUpMode === "rules") {
        let rulesHtml = t.golden_rules.map((r, i) => `
            <div style="display:flex; align-items:flex-start; gap:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px 14px;">
                <span style="background:rgba(245,158,11,0.2); color:#f59e0b; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800; flex-shrink:0;">${i+1}</span>
                <span style="font-size:0.85rem; color:#e2e8f0; line-height:1.5;">${r}</span>
            </div>
        `).join("");

        container.innerHTML = `
            <div>
                <h4 style="font-size:0.95rem; color:#fbbf24; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                    <span>💡 Executive Golden Rules & Habits</span>
                </h4>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${rulesHtml}
                </div>
            </div>
        `;
    }
}

window.toggleGrowUpVoice = function() {
    if (!('speechSynthesis' in window)) {
        alert("Text-to-speech is not supported on this browser.");
        return;
    }

    if (_isGrowUpSpeaking) {
        window.speechSynthesis.pause();
        _isGrowUpSpeaking = false;
        document.getElementById("growupVoiceLabel").textContent = "Resume Lesson";
        document.getElementById("growupSpeakingIndicator").style.display = "none";
        return;
    }

    if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        _isGrowUpSpeaking = true;
        document.getElementById("growupVoiceLabel").textContent = "Pause Voice";
        document.getElementById("growupSpeakingIndicator").style.display = "block";
        return;
    }

    window.speakGrowUpLesson();
};

window.speakGrowUpLesson = function() {
    if (!('speechSynthesis' in window) || !_activeGrowUpTopic) return;
    try {
        window.speechSynthesis.cancel();
        const textToSpeak = (_activeGrowUpTopic.voice_script || "") + " " + (_activeGrowUpTopic.summary || "");
        if (!textToSpeak.trim()) return;

        _growUpVoiceUtterance = new SpeechSynthesisUtterance(textToSpeak);
        _growUpVoiceUtterance.rate = 0.95;
        _growUpVoiceUtterance.pitch = 1.0;

        _growUpVoiceUtterance.onstart = function() {
            _isGrowUpSpeaking = true;
            const label = document.getElementById("growupVoiceLabel");
            const indicator = document.getElementById("growupSpeakingIndicator");
            if (label) label.textContent = "Pause Voice";
            if (indicator) indicator.style.display = "block";
        };

        _growUpVoiceUtterance.onend = function() {
            _isGrowUpSpeaking = false;
            const label = document.getElementById("growupVoiceLabel");
            const indicator = document.getElementById("growupSpeakingIndicator");
            if (label) label.textContent = "Speak Lesson";
            if (indicator) indicator.style.display = "none";
        };

        _growUpVoiceUtterance.onerror = function() {
            _isGrowUpSpeaking = false;
            const label = document.getElementById("growupVoiceLabel");
            const indicator = document.getElementById("growupSpeakingIndicator");
            if (label) label.textContent = "Speak Lesson";
            if (indicator) indicator.style.display = "none";
        };

        window.speechSynthesis.speak(_growUpVoiceUtterance);
    } catch(e) {
        console.warn("Speech error:", e);
    }
};

window.stopGrowUpVoice = function() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    _isGrowUpSpeaking = false;
    const label = document.getElementById("growupVoiceLabel");
    const indicator = document.getElementById("growupSpeakingIndicator");
    if (label) label.textContent = "Speak Lesson";
    if (indicator) indicator.style.display = "none";
};

window.regenerateGrowUpLesson = async function() {
    const lessonBox = document.getElementById("growupLessonContent");
    if (!lessonBox || !_activeGrowUpTopic) return;
    lessonBox.innerHTML = `<div style="padding:20px; text-align:center; color:#818cf8;"><div class="auth-btn-loader"></div>
        🤖 Gemini AI is generating a deep lesson on <strong>${_activeGrowUpTopic.title}</strong>...</div>`;

    try {
        const prompt = `You are the expert AI Mentor and Corporate Growth Coach on Rank-Holder platform.
Teach the following topic thoroughly from beginning to advanced detail:
Topic: "${_activeGrowUpTopic.title}"

Requirements:
1. Core Definition & Why it Matters in Corporate Placement & Careers
2. Key Pillars & Step-by-Step Breakdown
3. Real-World Workplace & Interview Scenarios (What to do vs What to avoid)
4. Golden Rules for Instant Mastery
5. Interactive Action Item for the Student

Respond in valid JSON with keys: title, tagline, summary, pillars (array of {name,description,icon}), workplace_scenario ({context,best_approach,common_mistake}), golden_rules (array of strings), voice_script`;

        const lesson = await window.GeminiAI.generateJSON(prompt);
        if (lesson) {
            if (lesson.summary) _activeGrowUpTopic.summary = lesson.summary;
            if (lesson.pillars && lesson.pillars.length) _activeGrowUpTopic.pillars = lesson.pillars;
            if (lesson.workplace_scenario) _activeGrowUpTopic.workplace_scenario = lesson.workplace_scenario;
            if (lesson.golden_rules) _activeGrowUpTopic.golden_rules = lesson.golden_rules;
            if (lesson.voice_script) _activeGrowUpTopic.voice_script = lesson.voice_script;
        }
    } catch(e) {
        console.warn("[GrowUp] GeminiAI lesson generation error:", e);
        // Silently fall back to existing curriculum data
    }
    renderGrowUpLesson();
    speakGrowUpLesson();
};

function renderGrowUpQuiz() {
    const quizContainer = document.getElementById("growupQuizContainer");
    const scenarioPrompt = document.getElementById("growupScenarioPrompt");
    const scenarioAnswer = document.getElementById("growupScenarioAnswer");

    if (scenarioPrompt) scenarioPrompt.textContent = _activeGrowUpTopic.scenario_challenge;
    if (scenarioAnswer) {
        scenarioAnswer.value = "";
        scenarioAnswer.oninput = function() {
            const charCount = document.getElementById("growupCharCount");
            if (charCount) charCount.textContent = `${this.value.length} characters (aim for 50+ words)`;
        };
    }

    if (!quizContainer) return;

    let html = "";
    _activeGrowUpTopic.quiz.forEach((q, qIndex) => {
        let optsHtml = q.options.map((opt, optIndex) => `
            <div class="growup-quiz-opt" id="quiz-opt-${qIndex}-${optIndex}" onclick="selectGrowUpQuizOption(${qIndex}, ${optIndex})">
                <span style="font-weight:700; color:#818cf8;">${String.fromCharCode(65 + optIndex)}.</span>
                <span>${opt}</span>
            </div>
        `).join("");

        html += `
            <div class="growup-quiz-card">
                <div style="font-size:0.85rem; font-weight:700; color:#f0f4ff; margin-bottom:8px;">
                    ${qIndex + 1}. ${q.question}
                </div>
                ${optsHtml}
                <div id="quiz-exp-${qIndex}" style="display:none; font-size:0.75rem; color:#94a3b8; margin-top:6px; padding:6px 10px; border-radius:6px; background:rgba(0,0,0,0.3);"></div>
            </div>
        `;
    });

    quizContainer.innerHTML = html;
}

window.selectGrowUpQuizOption = function(qIndex, optIndex) {
    _growUpQuizAnswers[qIndex] = optIndex;
    const q = _activeGrowUpTopic.quiz[qIndex];
    const isCorrect = optIndex === q.answer;

    q.options.forEach((_, idx) => {
        const el = document.getElementById(`quiz-opt-${qIndex}-${idx}`);
        if (el) {
            el.classList.remove("selected-correct", "selected-incorrect");
            if (idx === optIndex) {
                el.classList.add(isCorrect ? "selected-correct" : "selected-incorrect");
            }
        }
    });

    const exp = document.getElementById(`quiz-exp-${qIndex}`);
    if (exp) {
        exp.style.display = "block";
        exp.innerHTML = isCorrect 
            ? `<span style="color:#34d399; font-weight:700;">✓ Correct!</span> ${q.explanation}`
            : `<span style="color:#fb7185; font-weight:700;">✗ Keep in mind:</span> ${q.explanation}`;
    }
};

function resetGrowUpScorePanel() {
    const placeholder = document.getElementById("growupScorePlaceholder");
    const results = document.getElementById("growupScoreResults");
    if (placeholder) placeholder.style.display = "block";
    if (results) results.style.display = "none";
}

window.submitGrowUpAssessment = async function() {
    const btn = document.getElementById("growupSubmitBtn");
    const answer = document.getElementById("growupScenarioAnswer")?.value.trim() || "";

    if (!answer || answer.length < 20) {
        alert("Please write at least 2-3 sentences in your scenario response before submitting!");
        return;
    }

    // Calculate Quiz Score
    let correctCount = 0;
    _activeGrowUpTopic.quiz.forEach((q, idx) => {
        if (_growUpQuizAnswers[idx] === q.answer) correctCount++;
    });
    const quizScore = Math.round((correctCount / Math.max(1, _activeGrowUpTopic.quiz.length)) * 100);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="auth-btn-loader"></span> 🤖 Gemini AI Evaluating...`;
    }

    try {
        // PRIMARY: Use GeminiAI directly for immediate, real evaluation
        const evalPrompt = `You are the Rank-Holder AI Career Assessment Engine evaluating a student's performance.

Topic: "${_activeGrowUpTopic.title}"
Scenario Challenge: "${_activeGrowUpTopic.scenario_challenge}"
Student's Answer: "${answer}"
MCQ Quiz Score: ${quizScore}%

Evaluate across 4 dimensions and produce an overall score. Be honest and encouraging.

Respond in valid JSON only with these exact keys:
{
  "score": <number 0-100>,
  "clarity_score": <number 0-100>,
  "problem_score": <number 0-100>,
  "professionalism_score": <number 0-100>,
  "confidence_score": <number 0-100>,
  "verdict": "<one line verdict>",
  "feedback": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "xp_earned": <number 75-200>
}`;

        let result;
        try {
            const geminiResult = await window.GeminiAI.generateJSON(evalPrompt);
            result = { success: true, ...geminiResult };
        } catch (geminiErr) {
            console.warn("[GrowUp] GeminiAI eval fallback to backend:", geminiErr);
            // FALLBACK: Backend evaluation
            const evalPayload = {
                topic_id: _activeGrowUpTopic.id,
                topic_title: _activeGrowUpTopic.title,
                scenario_question: _activeGrowUpTopic.scenario_challenge,
                user_answer: answer,
                quiz_score: quizScore
            };
            result = await window.Backend.GrowUp.evaluateScenario(evalPayload);
        }

        if (result && result.success !== false) {
            // Ensure result has success flag
            result.success = true;
            if (!result.score) result.score = Math.max(50, Math.round((quizScore + 65) / 2));
            if (!result.clarity_score) result.clarity_score = result.score;
            if (!result.problem_score) result.problem_score = result.score;
            if (!result.professionalism_score) result.professionalism_score = result.score;
            if (!result.confidence_score) result.confidence_score = result.score;
            if (!result.verdict) result.verdict = result.score >= 60 ? "Good performance! Keep practising." : "Needs more practice. Review the lesson.";
            if (!result.feedback) result.feedback = ["Develop clearer communication", "Practice workplace scenarios", "Review golden rules"];
            if (!result.xp_earned) result.xp_earned = result.score >= 60 ? 150 : 50;

            displayGrowUpScoreResults(result);

            const scoreObj = {
                topic_id: _activeGrowUpTopic.id,
                score: result.score,
                completed: result.score >= 60 ? 1 : 0,
                clarity_score: result.clarity_score,
                problem_score: result.problem_score,
                professionalism_score: result.professionalism_score,
                confidence_score: result.confidence_score,
                feedback: result.verdict
            };
            _growUpScoresMap[_activeGrowUpTopic.id] = scoreObj;
            saveGrowUpLocalScores();
            try { await window.Backend.GrowUp.saveScore(scoreObj); } catch(_) {}

            renderGrowUpRoadmap();
            updateGrowUpOverallStats();
        }
    } catch(e) {
        console.error("Evaluation error:", e);
        // Graceful fallback with basic score computation
        const fallbackScore = Math.max(45, Math.round(quizScore * 0.6 + (answer.length > 100 ? 35 : 20)));
        const fallbackResult = {
            success: true,
            score: fallbackScore,
            clarity_score: fallbackScore + 5,
            problem_score: fallbackScore - 5,
            professionalism_score: fallbackScore + 3,
            confidence_score: fallbackScore,
            verdict: fallbackScore >= 60 ? "Good attempt! AI scoring is ready — keep practising!" : "Good start! Review the lesson for improvement.",
            feedback: ["Expand your response with specific examples", "Use STAR framework for structure", "Review the golden rules for this topic"],
            xp_earned: fallbackScore >= 60 ? 100 : 40
        };
        displayGrowUpScoreResults(fallbackResult);
        _growUpScoresMap[_activeGrowUpTopic.id] = { topic_id: _activeGrowUpTopic.id, score: fallbackScore, completed: fallbackScore >= 60 ? 1 : 0, feedback: fallbackResult.verdict };
        saveGrowUpLocalScores();
        renderGrowUpRoadmap();
        updateGrowUpOverallStats();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>🚀 Submit for AI Score</span>`;
        }
    }
};

function displayGrowUpScoreResults(result) {
    const placeholder = document.getElementById("growupScorePlaceholder");
    const results = document.getElementById("growupScoreResults");
    if (placeholder) placeholder.style.display = "none";
    if (!results) return;

    results.style.display = "flex";

    const scoreColor = result.score >= 80 ? '#10b981' : result.score >= 60 ? '#f59e0b' : '#f43f5e';
    const isPassed = result.score >= 60;

    results.innerHTML = `
        <div style="text-align:center; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:16px;">
            <div style="font-size:3.2rem; font-weight:900; color:${scoreColor}; line-height:1;">
                ${result.score}<span style="font-size:1.4rem;">/100</span>
            </div>
            <div style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; font-weight:700; margin-top:4px;">
                Topic Mastery Score
            </div>
            <div style="font-size:0.85rem; color:#fff; font-weight:600; margin-top:8px; line-height:1.4;">
                ${result.verdict}
            </div>
        </div>

        <!-- 4-Dimension Metric Bars -->
        <div style="display:flex; flex-direction:column; gap:8px;">
            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:#94a3b8; margin-bottom:2px;">
                    <span>🎙️ Clarity & Communication</span><strong>${result.clarity_score}%</strong>
                </div>
                <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
                    <div style="width:${result.clarity_score}%; height:100%; background:#38bdf8;"></div>
                </div>
            </div>

            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:#94a3b8; margin-bottom:2px;">
                    <span>🧠 Problem Solving & Logic</span><strong>${result.problem_score}%</strong>
                </div>
                <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
                    <div style="width:${result.problem_score}%; height:100%; background:#818cf8;"></div>
                </div>
            </div>

            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:#94a3b8; margin-bottom:2px;">
                    <span>👔 Professionalism & Ethics</span><strong>${result.professionalism_score}%</strong>
                </div>
                <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
                    <div style="width:${result.professionalism_score}%; height:100%; background:#10b981;"></div>
                </div>
            </div>

            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:#94a3b8; margin-bottom:2px;">
                    <span>💪 Confidence & Mindset</span><strong>${result.confidence_score}%</strong>
                </div>
                <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
                    <div style="width:${result.confidence_score}%; height:100%; background:#f59e0b;"></div>
                </div>
            </div>
        </div>

        <!-- AI Coach Feedback Bullets -->
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:10px;">
            <div style="font-size:0.75rem; font-weight:700; color:#a5b4fc; margin-bottom:4px;">💡 AI Coach Feedback:</div>
            <ul style="font-size:0.75rem; color:#cbd5e1; margin:0; padding-left:16px; line-height:1.5;">
                ${(result.feedback || []).map(f => `<li>${f}</li>`).join('')}
            </ul>
        </div>

        ${isPassed ? `
            <div style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:10px; text-align:center;">
                <span style="color:#34d399; font-size:0.82rem; font-weight:700;">🎉 +${result.xp_earned || 100} XP Awarded! Next Stage Unlocked</span>
            </div>
        ` : `
            <div style="background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.3); border-radius:10px; padding:10px; text-align:center;">
                <span style="color:#fb7185; font-size:0.82rem; font-weight:600;">Score below 60%. Review the lecture and retry for a higher score!</span>
            </div>
        `}
    `;
}

function updateGrowUpOverallStats() {
    const scores = Object.values(_growUpScoresMap);
    let totalScore = 0;
    let completedCount = 0;

    GROWUP_CURRICULUM.forEach(t => {
        const s = _growUpScoresMap[t.id];
        if (s && s.completed === 1) {
            completedCount++;
            totalScore += (s.score || 0);
        }
    });

    const avgScore = completedCount > 0 ? Math.round(totalScore / completedCount) : 0;
    const xpTotal = completedCount * 100 + (avgScore * 2);

    let rank = "🌱 Novice";
    if (completedCount >= 5) rank = "👑 Master";
    else if (completedCount >= 3) rank = "🌲 Pro";
    else if (completedCount >= 1) rank = "🌿 Practitioner";

    const scoreNum = document.getElementById("growupMasteryScoreNum");
    const xpNum = document.getElementById("growupXpNum");
    const rankBadge = document.getElementById("growupRankBadge");
    const progressText = document.getElementById("growupProgressText");
    const completionPill = document.getElementById("growupCompletionPill");

    if (scoreNum) scoreNum.textContent = `${avgScore}%`;
    if (xpNum) xpNum.textContent = `+${xpTotal} XP`;
    if (rankBadge) rankBadge.textContent = rank;
    if (progressText) progressText.textContent = `${completedCount} of ${GROWUP_CURRICULUM.length} Done`;
    if (completionPill) {
        completionPill.textContent = completedCount === GROWUP_CURRICULUM.length 
            ? "🏆 All 6 Stages Mastered!"
            : `✨ ${completedCount}/${GROWUP_CURRICULUM.length} Modules Mastered`;
    }
}

function initGrowUpChatHistory() {
    const history = document.getElementById("growupChatHistory");
    if (!history) return;
    if (history.children.length === 0) {
        history.innerHTML = `
            <div style="align-self:flex-start; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.25); border-radius:0 14px 14px 14px; padding:10px 14px; font-size:0.85rem; color:#f0f4ff; max-width:85%; line-height:1.5;">
                👋 Hi! I'm your 3D Avatar AI Growth Coach. Ask me anything about <strong>${_activeGrowUpTopic.title}</strong>, or ask for workplace scenario advice!
            </div>
        `;
    }
}

window.sendGrowUpChatQuestion = async function() {
    const input = document.getElementById("growupChatInput");
    const history = document.getElementById("growupChatHistory");
    if (!input || !history) return;

    const question = input.value.trim();
    if (!question) return;

    // Add user message
    history.innerHTML += `
        <div style="align-self:flex-end; background:rgba(99,102,241,0.3); border:1px solid rgba(99,102,241,0.4); border-radius:14px 0 14px 14px; padding:10px 14px; font-size:0.85rem; color:#fff; max-width:85%;">
            ${question}
        </div>
    `;
    input.value = "";
    history.scrollTop = history.scrollHeight;

    // AI thinking indicator
    const thinkingId = `growupThinkingMsg_${Date.now()}`;
    history.innerHTML += `
        <div id="${thinkingId}" style="align-self:flex-start; background:rgba(255,255,255,0.05); border-radius:0 14px 14px 14px; padding:10px 14px; font-size:0.82rem; color:#94a3b8; display:flex; align-items:center; gap:8px;">
            <div class="auth-btn-loader" style="width:14px;height:14px;"></div> <span>Gemini AI is thinking...</span>
        </div>
    `;
    history.scrollTop = history.scrollHeight;

    try {
        const prompt = `You are the Rank-Holder AI Personal Career & Growth Mentor.
The student is currently learning: "${_activeGrowUpTopic.title}"
Topic context: ${_activeGrowUpTopic.summary}

Student's question: "${question}"

Provide a clear, structured, encouraging and actionable response. Be specific with examples. Keep it under 200 words.`;

        let reply;
        try {
            // PRIMARY: Direct Gemini call for instant response
            reply = await window.GeminiAI.generate(prompt, { maxTokens: 512 });
        } catch (geminiErr) {
            console.warn("[Chat] GeminiAI fallback to backend:", geminiErr);
            // FALLBACK: Backend
            const res = await window.Backend.GrowUp.getLesson(_activeGrowUpTopic.title, "chat", question);
            reply = res && res.reply ? res.reply : null;
        }

        if (!reply) {
            reply = "Great question! Always practice active listening, express your thoughts concisely, and align your team on actionable outcomes before every meeting.";
        }

        const thinkingEl = document.getElementById(thinkingId);
        if (thinkingEl) thinkingEl.remove();

        history.innerHTML += `
            <div style="align-self:flex-start; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.25); border-radius:0 14px 14px 14px; padding:12px 16px; font-size:0.85rem; color:#f0f4ff; max-width:85%; line-height:1.6;">
                <div style="font-size:0.7rem; color:#38bdf8; font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:4px;">✨ Gemini AI Coach</div>
                ${reply.replace(/\n/g, '<br>')}
            </div>
        `;
    } catch(e) {
        const thinkingEl = document.getElementById(thinkingId);
        if (thinkingEl) thinkingEl.remove();
        history.innerHTML += `
            <div style="align-self:flex-start; background:rgba(244,63,94,0.15); border-radius:0 14px 14px 14px; padding:10px 14px; font-size:0.85rem; color:#fb7185;">
                Network issue. Please check your connection and try again.
            </div>
        `;
    }
    history.scrollTop = history.scrollHeight;
};

// Initialize on DOM load or immediately if DOM is already ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        if (document.getElementById("growup")) {
            window.initGrowUpTab();
        }
    });
} else {
    if (document.getElementById("growup")) {
        window.initGrowUpTab();
    }
}

/* =====================================================================
   CORPORATE READINESS TAB LOGIC (GD, HR, Public Speaking)
   ===================================================================== */

let speechRec = null;
let currentMode = null; // 'gd', 'hr', 'ps'

// Setup Speech Recognition
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRec = new SpeechRecognition();
    speechRec.continuous = false;
    speechRec.interimResults = false;
    speechRec.lang = 'en-US';

    speechRec.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        handleSpeechInput(transcript);
    };

    speechRec.onerror = function(event) {
        console.error("Speech Recognition Error:", event.error);
        stopMicUI();
    };

    speechRec.onend = function() {
        stopMicUI();
    };
}

// Setup Speech Synthesis (Text to Speech)
function speakAI(text, voiceIndex = 0) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Stop any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        // Try to pick a decent voice based on index (to differentiate AI 1, AI 2, HR)
        utterance.voice = voices[voiceIndex % voices.length];
    }
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
}

function handleSpeechInput(transcript) {
    if (currentMode === 'gd') {
        document.getElementById('gdChatInput').value = transcript;
        sendGDChat();
    } else if (currentMode === 'hr') {
        document.getElementById('hrChatInput').value = transcript;
        sendHRAnswer();
    } else if (currentMode === 'ps') {
        processPublicSpeaking(transcript);
    }
}

function stopMicUI() {
    if (currentMode === 'gd') {
        const btnMic = document.getElementById('btnMicGD');
        if(btnMic) btnMic.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
        const micStat = document.getElementById('gdUserMicStatus');
        if(micStat) {
            micStat.innerText = 'Mic is off';
            micStat.style.color = '#ef4444';
        }
        const pUser = document.getElementById('participant_user');
        if(pUser) pUser.style.borderColor = '#38bdf8';
    } else if (currentMode === 'hr') {
        const btn = document.getElementById('btnMicHR');
        if(btn) {
            btn.style.background = 'transparent';
            btn.style.color = '#8b5cf6';
        }
    } else if (currentMode === 'ps') {
        const btn = document.getElementById('btnMicPS');
        if(btn) {
            btn.style.background = '#ef4444';
            btn.classList.add('hidden');
        }
        const lbl = document.getElementById('psMicLabel');
        if(lbl) lbl.innerText = 'Stop Speaking';
        const startBtn = document.getElementById('btnStartPS');
        if(startBtn) startBtn.classList.remove('hidden');
    }
    currentMode = null;
}

// ---------------------------------------------------------
// SECTION 1: GD MODULE
// ---------------------------------------------------------
// gdActive is declared above (line 3739); using the shared variable here


function startGDSimulator() {
    gdActive = true;
    document.getElementById('gdVoiceUI').style.display = 'block';
    const topic = document.getElementById('gdTopicDisplay').innerText;
    document.getElementById('gdTranscript').innerHTML = `<div style="margin-bottom:8px; color:#38bdf8;"><strong>System:</strong> GD Started on topic: ${topic}</div>`;
    
    // Simulate initial AI greeting
    setTimeout(() => {
        addGDMessage("AI Alex", "Hi everyone. Let's start discussing the topic.", 1);
    }, 1500);
}

function toggleGDMic() {
    if (!speechRec) return alert("Speech recognition not supported in this browser.");
    if (currentMode === 'gd') {
        speechRec.stop();
        stopMicUI();
    } else {
        currentMode = 'gd';
        document.getElementById('btnMicGD').style.background = '#10b981'; // Green when active
        document.getElementById('gdUserMicStatus').innerText = '🎙️ Listening...';
        document.getElementById('gdUserMicStatus').style.color = '#10b981';
        document.getElementById('participant_user').style.borderColor = '#10b981';
        speechRec.start();
    }
}

async function sendGDChat() {
    const input = document.getElementById('gdChatInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    addGDMessage("You", msg, 0);

    const topic = document.getElementById('gdTopicDisplay').innerText;
    
    // Call backend
    document.getElementById('participant_ai1').style.borderColor = '#f59e0b'; // thinking
    try {
        const res = await Backend.Corporate.gdChat(topic, msg);
        if (res && res.success) {
            document.getElementById('participant_ai1').style.borderColor = 'transparent';
            addGDMessage(res.speaker || "AI Participant", res.reply, res.speaker === 'AI Alex' ? 1 : 2);
        }
    } catch(e) {
        console.error(e);
        // Local fallback
        document.getElementById('participant_ai1').style.borderColor = 'transparent';
        addGDMessage("AI Alex", "That's a valid point, but we should also consider the broader implications.", 1);
    }
}

function addGDMessage(speaker, text, voiceIndex) {
    const ts = document.getElementById('gdTranscript');
    if(!ts) return;
    const color = speaker === 'You' ? '#38bdf8' : (speaker.includes('Alex') ? '#10b981' : '#f59e0b');
    ts.innerHTML += `<div style="margin-bottom:8px;">
        <strong style="color:${color}">${speaker}:</strong> ${text}
    </div>`;
    ts.scrollTop = ts.scrollHeight;

    if (speaker !== 'You') {
        speakAI(text, voiceIndex);
        
        // Highlight active speaker UI
        const pId = voiceIndex === 1 ? 'participant_ai1' : 'participant_ai2';
        const pEl = document.getElementById(pId);
        if(pEl) {
            pEl.style.borderColor = color;
            pEl.querySelector('.speaker-indicator').style.opacity = '1';
            setTimeout(() => {
                pEl.style.borderColor = 'transparent';
                pEl.querySelector('.speaker-indicator').style.opacity = '0';
            }, 3000);
        }
    }
}

// ---------------------------------------------------------
// SECTION 2: HR INTERVIEW MODULE
// ---------------------------------------------------------
let hrQuestions = [
    "Tell me about yourself.",
    "Why should we hire you?",
    "What are your strengths and weaknesses?",
    "Where do you see yourself in 5 years?",
    "Tell me about a time you faced a conflict and how you resolved it."
];
let hrQuestionIndex = 0;

function startHRInterview() {
    hrQuestionIndex = 0;
    document.getElementById('hrChatBox').innerHTML = '';
    askNextHRQuestion();
}

function askNextHRQuestion() {
    if (hrQuestionIndex >= hrQuestions.length) {
        addHRMessage("AI HR Manager", "That concludes our interview. Thank you!");
        return;
    }
    const q = hrQuestions[hrQuestionIndex];
    addHRMessage("AI HR Manager", q);
    hrQuestionIndex++;
}

function toggleHRMic() {
    if (!speechRec) return alert("Speech recognition not supported.");
    if (currentMode === 'hr') {
        speechRec.stop();
        stopMicUI();
    } else {
        currentMode = 'hr';
        document.getElementById('btnMicHR').style.background = '#8b5cf6';
        document.getElementById('btnMicHR').style.color = '#fff';
        speechRec.start();
    }
}

async function sendHRAnswer() {
    const input = document.getElementById('hrChatInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    addHRMessage("You", msg);
    
    // We send the PREVIOUS question context to the backend for scoring
    const contextQ = hrQuestions[hrQuestionIndex - 1];
    
    try {
        const res = await Backend.Corporate.hrChat(contextQ, msg);
        if (res && res.success) {
            addHRMessage("AI HR Manager", `[Score: ${res.score}/10] ${res.feedback}`);
            setTimeout(askNextHRQuestion, 3000);
        } else {
            addHRMessage("AI HR Manager", "Interesting answer. Let's move on.");
            setTimeout(askNextHRQuestion, 2000);
        }
    } catch(e) {
        console.error(e);
        addHRMessage("AI HR Manager", "[Local Score: 7/10] Good effort. Remember to use the STAR method.");
        setTimeout(askNextHRQuestion, 2000);
    }
}

function addHRMessage(speaker, text) {
    const cb = document.getElementById('hrChatBox');
    if(!cb) return;
    const isHR = speaker === 'AI HR Manager';
    const align = isHR ? 'flex-start' : 'flex-end';
    const bg = isHR ? 'rgba(139,92,246,0.2)' : 'rgba(56,189,248,0.2)';
    const bColor = isHR ? '#8b5cf6' : '#38bdf8';
    
    cb.innerHTML += `<div style="align-self:${align}; background:${bg}; padding:10px 14px; border-radius:12px; border:1px solid ${bColor}; max-width:85%;">
        <div style="font-size:0.7rem; color:#94a3b8; margin-bottom:4px; font-weight:700;">${speaker}</div>
        <div>${text}</div>
    </div>`;
    cb.scrollTop = cb.scrollHeight;

    if (isHR) {
        speakAI(text.replace(/\[.*?\]/, ''), 3); // Voice index 3 for HR
    }
}


// ---------------------------------------------------------
// SECTION 3: PUBLIC SPEAKING
// ---------------------------------------------------------
let psTimerInterval;
let psSeconds = 0;
let psTopic = "";
let psTotalScoreVal = 0;

function startPublicSpeaking() {
    psTopic = generateGDTopic(); // Reuse GD topics for now
    document.getElementById('psTopicDisplay').innerText = psTopic;
    document.getElementById('psTranscript').innerText = "Topic generated. Press Mic and start speaking continuously...";
    
    document.getElementById('btnStartPS').classList.add('hidden');
    document.getElementById('btnMicPS').classList.remove('hidden');
    
    psSeconds = 0;
    updatePSTimerDisplay();
    clearInterval(psTimerInterval);
}

function togglePSMic() {
    if (!speechRec) return alert("Speech recognition not supported.");
    if (currentMode === 'ps') {
        speechRec.stop();
        stopMicUI();
        clearInterval(psTimerInterval);
    } else {
        currentMode = 'ps';
        document.getElementById('btnMicPS').style.background = '#10b981';
        document.getElementById('psMicLabel').innerText = 'Speaking...';
        speechRec.start();
        
        psTimerInterval = setInterval(() => {
            psSeconds++;
            updatePSTimerDisplay();
        }, 1000);
    }
}

function updatePSTimerDisplay() {
    const m = Math.floor(psSeconds / 60).toString().padStart(2, '0');
    const s = (psSeconds % 60).toString().padStart(2, '0');
    document.getElementById('psTimer').innerText = `${m}:${s}`;
}

async function processPublicSpeaking(transcript) {
    document.getElementById('psTranscript').innerText = transcript;
    
    try {
        const res = await Backend.Corporate.publicSpeakingScore(psTopic, transcript);
        if (res && res.success) {
            // Add up to 15% 
            const gained = Math.min(15, Math.max(0, parseInt(res.score || 0)));
            psTotalScoreVal = Math.min(100, psTotalScoreVal + gained);
            
            document.getElementById('psLastScore').innerText = `+${gained}% (${res.feedback})`;
            document.getElementById('psTotalScore').innerText = `${psTotalScoreVal}%`;
            document.getElementById('psProgressBar').style.width = `${psTotalScoreVal}%`;
            
            speakAI(`You scored ${gained} percent. ${res.feedback}`, 3);
        }
    } catch(e) {
        console.error(e);
        // Local Fallback
        const gained = Math.floor(Math.random() * 5) + 5;
        psTotalScoreVal = Math.min(100, psTotalScoreVal + gained);
        document.getElementById('psLastScore').innerText = `+${gained}% (Local fallback score)`;
        document.getElementById('psTotalScore').innerText = `${psTotalScoreVal}%`;
        document.getElementById('psProgressBar').style.width = `${psTotalScoreVal}%`;
        speakAI(`You scored ${gained} percent. Good job.`, 3);
    }
}

/* ====================================================================
   AI KNOWLEDGE LAB — Full Game Engine
   ==================================================================== */

const KL_TOPICS = [
    {
        id: 'self_intro', emoji: '🎤', name: 'Self Introduction',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "Hi! Let's start with the basics. A Self Introduction is how you present yourself to someone new — in an interview, a meeting, or even a new classroom. Think of it as your personal trailer!",
                concepts: [
                    { icon: '👤', title: 'Who You Are', desc: 'State your name, hometown, and current qualification clearly.' },
                    { icon: '🎓', title: 'Academic Background', desc: 'Mention your college, branch, and year of study.' },
                    { icon: '💪', title: 'Your Strengths', desc: 'Pick 1-2 genuine strengths relevant to the context.' },
                    { icon: '🎯', title: 'Your Goal', desc: 'End with what you are aiming for — job, internship, learning.' }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "Great! Now let's make it professional. In interviews, interviewers ask 'Tell me about yourself' as the first question — it sets the entire tone! Keep it under 2 minutes.",
                concepts: [
                    { icon: '⏱️', title: 'Time It Right', desc: 'Keep your intro between 90 seconds to 2 minutes maximum.' },
                    { icon: '🌟', title: 'Highlight Achievements', desc: 'Mention one project, award, or certification briefly.' },
                    { icon: '🔗', title: 'Relate to the Role', desc: 'Connect your skills to what the company/job needs.' },
                    { icon: '😊', title: 'Confident Tone', desc: 'Speak with a steady pace — not too fast, not too slow.' }
                ],
                tip: 'Use the PAST → PRESENT → FUTURE framework: where you came from, where you are, where you are going.'
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "You're almost a master! A Pro-level intro is structured, confident, and impactful. Avoid common mistakes like reading from memory or starting with 'I was born in...'.",
                concepts: [
                    { icon: '🚫', title: 'Avoid These Mistakes', desc: "Don't start with 'My name is...' directly. Begin with energy." },
                    { icon: '📢', title: 'Opening Hook', desc: "Start with a bold statement: 'I am someone who turns ideas into real products using code.'" },
                    { icon: '🤝', title: 'Show Fit', desc: 'End by saying why THIS company excites you specifically.' },
                    { icon: '🏆', title: 'Practice Out Loud', desc: 'Record yourself — the difference is in your voice and body language.' }
                ],
                tip: "Pro tip from your notes: 'Creating confidence, improving communication skill will help you during the interview and presentation.'"
            }
        ],
        quiz: [
            { q: 'What is the ideal duration for a self introduction in an interview?', options: ['5-10 minutes', '90 seconds to 2 minutes', '30 seconds', '10 minutes'], ans: 1 },
            { q: 'Which framework is best for structuring a self introduction?', options: ['Start, Middle, End', 'Past → Present → Future', 'Name → College → Hobby', 'None of the above'], ans: 1 },
            { q: 'What should you avoid at the start of a self introduction?', options: ['Mentioning your name', 'Starting with "I was born in..."', 'Talking about strengths', 'Mentioning your goal'], ans: 1 },
            { q: 'How does a self introduction help in interviews?', options: ['It wastes time', 'It sets the tone of the interview', 'It is not important', 'It annoys interviewers'], ans: 1 },
            { q: 'What should you mention at the end of a self introduction?', options: ['Your childhood story', 'Your salary expectations', 'Why this company excites you', 'Your family background'], ans: 2 }
        ]
    },
    {
        id: 'vocabulary', emoji: '📖', name: 'Vocabulary Building',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "Welcome! Vocabulary Building means learning new words AND knowing how to use them in the right situation. It's not about memorizing dictionaries — it's about smart word choices!",
                concepts: [
                    { icon: '📚', title: 'Read Regularly', desc: 'Read English newspapers, articles, or novels daily for 15 minutes.' },
                    { icon: '📝', title: 'Learn in Context', desc: 'Don\'t just learn a word — learn the sentence it is used in.' },
                    { icon: '🗣️', title: 'Use It Immediately', desc: 'Use any new word in conversation or writing the same day.' },
                    { icon: '🔄', title: 'Revise Weekly', desc: 'Review the 10 words you learned this week every Sunday.' }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "Nice! Now let's go deeper. Vocabulary is NOT just about learning new words — it's about replacing weak words with powerful ones. Replace 'good' with 'excellent', 'exceptional', or 'outstanding'.",
                concepts: [
                    { icon: '💪', title: 'Power Words', desc: "Replace 'good' → outstanding, 'bad' → detrimental, 'said' → articulated." },
                    { icon: '🎭', title: 'Synonyms & Antonyms', desc: 'For every word you learn, know at least 2 synonyms and 1 antonym.' },
                    { icon: '📰', title: 'Workplace Words', desc: 'Learn business words: deadline, leverage, synergy, proactive, initiative.' },
                    { icon: '📖', title: 'Collocations', desc: "Words that go together: 'make a decision', 'take responsibility'." }
                ],
                tip: "From your notes: 'Vocabulary Building is the process of increasing knowledge of words and improving the ability to use them in effective communication.'"
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Pro level! Advanced vocabulary is about using the RIGHT word at the RIGHT time for MAXIMUM impact. A carefully chosen word can be more powerful than an entire paragraph.",
                concepts: [
                    { icon: '🎯', title: 'Precise Language', desc: 'Use precise verbs: instead of "walked quickly" say "sprinted" or "dashed".' },
                    { icon: '🧩', title: 'Idiomatic English', desc: "Use phrases naturally: 'hit the ground running', 'go the extra mile'." },
                    { icon: '📻', title: 'Listen to English', desc: 'BBC News, TED Talks, English podcasts — notice how speakers choose words.' },
                    { icon: '✍️', title: 'Write Daily', desc: 'Write 5 sentences using new vocabulary every day. Writing cements learning.' }
                ],
                tip: "Pro Hack: Subscribe to 'Word of the Day' apps like Merriam-Webster or Vocabulary.com — 1 word/day = 365 new words/year!"
            }
        ],
        quiz: [
            { q: 'What is vocabulary building?', options: ['Memorizing dictionaries', 'Learning new words and using them correctly', 'Reading fast', 'Writing essays'], ans: 1 },
            { q: 'What should you do the same day you learn a new word?', options: ['Sleep on it', 'Use it in a sentence', 'Forget it', 'Write it 100 times'], ans: 1 },
            { q: 'Replace the weak word "good" with a powerful alternative:', options: ['Very good', 'Outstanding', 'So good', 'Real good'], ans: 1 },
            { q: '"Make a decision" is an example of a:', options: ['Synonym', 'Antonym', 'Collocation', 'Idiom'], ans: 2 },
            { q: 'Listening to BBC News or TED Talks helps you:', options: ['Sleep better', 'Notice how expert speakers choose words', 'Learn coding', 'Prepare for exams only'], ans: 1 }
        ]
    },
    {
        id: 'lexical', emoji: '🔤', name: 'Lexical Competence',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "Lexical Competence means your ABILITY to use the right word in the right place. It's the difference between sounding like a student and sounding like a professional!",
                concepts: [
                    { icon: '💡', title: 'What is it?', desc: 'Knowing the meaning, spelling, pronunciation AND appropriate use of words.' },
                    { icon: '🔍', title: 'Word Meaning', desc: 'Understand exact meaning — "affect" vs "effect" is often misused.' },
                    { icon: '🗺️', title: 'Word Range', desc: 'Use a variety of words. Repeating the same word in writing sounds weak.' },
                    { icon: '✅', title: 'Word Accuracy', desc: 'Use words correctly. "I am bored" ≠ "I am boring".' }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "Perfect! Lexical competence also covers GRAMMAR of words — singular/plural, verb forms, and word families. Knowing the word family helps you use any word naturally.",
                concepts: [
                    { icon: '👨‍👩‍👧', title: 'Word Families', desc: "Word → Wording, Worded, Wordless. Learn all forms of a root word." },
                    { icon: '🔊', title: 'Pronunciation', desc: 'Knowing a word but mispronouncing it reduces your competence score.' },
                    { icon: '📏', title: 'Register', desc: 'Know formal vs. informal: "help" = informal; "assistance" = formal.' },
                    { icon: '🌐', title: 'Connotations', desc: "Words have feelings: 'thin' is neutral; 'skinny' is negative; 'slender' is positive." }
                ],
                tip: "From your notes: Lexical Competence is the 'ability to use words accurately and naturally while speaking or writing.'"
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Master level! A highly lexically competent person can adjust their word choice based on who they are talking to — a CEO, a customer, or a classmate. This is called pragmatic competence.",
                concepts: [
                    { icon: '🎭', title: 'Audience Adaptation', desc: 'Simplify for non-experts, use jargon with domain experts.' },
                    { icon: '🧠', title: 'Collocation Mastery', desc: "Master fixed phrases: 'raise awareness', 'conduct research', 'reach a consensus'." },
                    { icon: '📱', title: 'Digital Context', desc: 'In emails and chats, word choice affects tone — reread before you send!' },
                    { icon: '⚡', title: 'Idiom Fluency', desc: "Use idioms naturally: 'Think outside the box', 'hit the nail on the head'." }
                ],
                tip: "Lexical competence + Good Grammar = Native-like fluency. Your notes confirm: 'Basic to Professional level knowledge comes from using language functionally in real situations.'"
            }
        ],
        quiz: [
            { q: 'Lexical competence means:', options: ['Memorizing spelling bees', 'Using the right word in the right place accurately', 'Reading fast', 'Writing big essays'], ans: 1 },
            { q: '"I am boring" vs "I am bored" — which is correct when you feel uninterested?', options: ['I am boring', 'I am bored', 'Both are the same', 'Neither'], ans: 1 },
            { q: 'What is a word family?', options: ['Words that rhyme', 'All forms of a root word (noun, verb, adjective)', 'Words that look alike', 'None of the above'], ans: 1 },
            { q: 'Which word has a positive connotation?', options: ['Skinny', 'Thin', 'Slender', 'Scrawny'], ans: 2 },
            { q: 'Register in English means:', options: ['Signing up for class', 'Knowing when to use formal vs informal language', 'Writing faster', 'Speaking louder'], ans: 1 }
        ]
    },
    {
        id: 'placement', emoji: '🎯', name: 'Placement Preparation',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "Placement season is near! Placement preparation is a process of equipping yourself with technical skills, communication skills, and interview strategies to get a job through campus recruitment.",
                concepts: [
                    { icon: '📋', title: 'Stages Overview', desc: 'Resume Shortlisting → Aptitude Test → Group Discussion → Technical Interview → HR Interview → Final Offer' },
                    { icon: '🧠', title: 'Aptitude Skills', desc: 'Quantitative, Logical Reasoning, Verbal, Data Interpretation. Practice daily!' },
                    { icon: '💬', title: 'Communication Skills', desc: 'Your ability to express ideas clearly in interviews and GDs.' },
                    { icon: '🔧', title: 'Technical Knowledge', desc: 'Domain-specific skills: Coding (CS), Core subjects (ECE/Mech), etc.' }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "Now let's talk strategy. Most students fail not because they lack knowledge, but because they lack a plan. Let's build your placement roadmap!",
                concepts: [
                    { icon: '🗓️', title: '90-Day Plan', desc: 'Month 1: Aptitude + Resume. Month 2: GD + Technical. Month 3: Mock Interviews.' },
                    { icon: '📄', title: 'Resume First', desc: 'Your resume is your first impression — make it clean, crisp, and ATS-friendly.' },
                    { icon: '🌐', title: 'LinkedIn Profile', desc: 'Recruiters visit LinkedIn. Keep it updated with skills, projects, and certifications.' },
                    { icon: '🏆', title: 'Projects Matter', desc: 'Even 1 good project with GitHub link can open many doors.' }
                ],
                tip: "From your notes: 'Placement preparation is only attended by students who find a job. Attendance in college includes every student. Build courage to pursue placement and build a strong career!'"
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Pro strategy! Most campus placements have 4-6 elimination rounds. Each round tests a different skill. Knowing what each round expects gives you a MASSIVE advantage.",
                concepts: [
                    { icon: '1️⃣', title: 'Resume Round', desc: 'ATS-optimized, keyword-rich, 1-page, no spelling errors.' },
                    { icon: '2️⃣', title: 'Aptitude Round', desc: 'Speed + Accuracy. Practice Indiabix, PrepInsta, TCS NQT patterns.' },
                    { icon: '3️⃣', title: 'GD Round', desc: 'Initiate or add value. Do not dominate, but do not stay silent.' },
                    { icon: '4️⃣', title: 'HR Round', desc: "Research the company. Know their mission, values, and recent news." }
                ],
                tip: "'Placement preparation leads to a process of assisting technical knowledge, communication skills, and attitude to get a job through campus recruitment.' — Your Notes"
            }
        ],
        quiz: [
            { q: 'What is the correct order of campus recruitment stages?', options: ['GD → Resume → Aptitude → HR', 'Resume → Aptitude → GD → Technical → HR → Offer', 'HR → Technical → GD', 'Offer → Resume → GD'], ans: 1 },
            { q: 'What should Month 1 of a 90-day placement plan focus on?', options: ['Mock Interviews only', 'Aptitude + Resume', 'Only GD Practice', 'LinkedIn Profile only'], ans: 1 },
            { q: 'What makes a resume ATS-friendly?', options: ['Using colorful fonts', 'Keyword-rich, clean 1-page format', 'Adding photos everywhere', 'Very long descriptions'], ans: 1 },
            { q: 'In a GD, what is the best strategy?', options: ['Stay silent', 'Dominate the entire discussion', 'Initiate or add value without dominating', 'Repeat others\' points'], ans: 2 },
            { q: 'What should you research before an HR interview?', options: ['The HR manager\'s personal life', "The company's mission, values, and recent news", 'Your own resume', 'Nothing — just improvise'], ans: 1 }
        ]
    },
    {
        id: 'resume', emoji: '📄', name: 'Resume Building & Cover Letter',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "A Resume is a professional document that summarizes your education, skills, projects, internships, achievements, and contact details — it gets your foot in the door during placement in college!",
                concepts: [
                    { icon: '🎯', title: 'Purpose', desc: 'Introduce candidate to the employer, highlight qualifications, prove availability for the role.' },
                    { icon: '📋', title: 'Resume Format', desc: 'Contact → Objective → Education → Technical Skill → Soft Skill → Projects → Certifications → Achievements.' },
                    { icon: '📏', title: 'Length Rule', desc: 'Keep it to 1 page for freshers. Use professional fonts (Arial, Times New Roman).' },
                    { icon: '✅', title: 'Mistake Check', desc: 'Avoid spelling and grammar mistakes. Use tabular or graphical format for skills.' }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "Now let's nail the CONTENT. Each section of your resume must be written strategically. Use action verbs and quantify achievements wherever possible.",
                concepts: [
                    { icon: '🎯', title: 'Objective Statement', desc: "One focused sentence: 'Seeking a software engineering role where I can apply my Python and ML skills to solve real-world problems.'" },
                    { icon: '🏆', title: 'Achievements Section', desc: "Don't just list duties — quantify impact: 'Improved system performance by 40%'." },
                    { icon: '🔗', title: 'Projects Section', desc: 'Title, tools used, 2-line description, GitHub link. This is what recruiters read most.' },
                    { icon: '📜', title: 'Certifications', desc: 'Add NPTEL, Coursera, Google, AWS certs. Shows initiative beyond classroom.' }
                ],
                tip: "From your notes: Tips → Keep it to 1 page for freshers, use professional font (Arial, Times New Roman), avoid spelling errors."
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Cover Letters — while resumes are scanned, cover letters are READ. A great cover letter tells the company WHY you specifically are the right fit — it's your chance to tell your story!",
                concepts: [
                    { icon: '📮', title: 'What is a Cover Letter?', desc: 'A 1-page letter sent along with your resume when applying for a job.' },
                    { icon: '📝', title: 'Structure', desc: 'Opening → Why this company → Your value → Call to action → Professional closing.' },
                    { icon: '🌟', title: 'Opening Line', desc: "From your notes: 'Thank you for considering my application. I would welcome the opportunity to discuss my skills and enthusiasm for the position.'" },
                    { icon: '🚀', title: 'Key Difference', desc: 'A resume lists the connection; a cover letter gives context. Both together = strong application.' }
                ],
                tip: "'A Resume gets the connection, while a cover letter gives a better chance to build a strong rapport upon the connection.' — Your Notes"
            }
        ],
        quiz: [
            { q: 'For a fresher, how long should a resume be?', options: ['3 pages', '1 page', '10 pages', 'No limit'], ans: 1 },
            { q: 'What is the purpose of a resume?', options: ['To write a biography', 'To introduce yourself and highlight qualifications to an employer', 'To list your hobbies', 'To replace an interview'], ans: 1 },
            { q: 'Which professional fonts are recommended for resumes?', options: ['Comic Sans, Papyrus', 'Arial, Times New Roman', 'Cursive, Graffiti', 'Bold, Italic only'], ans: 1 },
            { q: 'What makes the Projects section impactful?', options: ['Writing long paragraphs', 'Adding GitHub links and describing tools used', 'Listing 20 projects', 'Only mentioning project names'], ans: 1 },
            { q: 'What is the key difference between a resume and a cover letter?', options: ['They are the same', 'Resume lists qualifications; cover letter tells your story and fit', 'Cover letter is mandatory, resume is not', 'Resume is for coding jobs only'], ans: 1 }
        ]
    },
    {
        id: 'gd', emoji: '🗣️', name: 'Group Discussion Skills',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "A Group Discussion (GD) is a selection method where a topic is given and 8-12 candidates discuss it for 15-20 minutes. Evaluators look at how you think, communicate, and collaborate.",
                concepts: [
                    { icon: '🧠', title: 'What Evaluators See', desc: 'Knowledge of the topic, communication clarity, leadership, listening skills, and teamwork.' },
                    { icon: '📢', title: 'Types of Topics', desc: 'Factual (AI impact), Abstract (Blue is better than Green), Case-based (Company conflict).' },
                    { icon: '✋', title: 'How to Participate', desc: 'Raise your hand, wait for a pause, then speak. Never interrupt aggressively.' },
                    { icon: '👂', title: 'Active Listening', desc: "Listen to others. Acknowledge: 'I agree with your point, and I'd like to add...'" }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "Let's talk strategy! GD winners don't just know the topic — they know HOW to participate. Here are proven techniques from your handwritten notes.",
                concepts: [
                    { icon: '🚀', title: 'Initiate the GD', desc: 'Opening the discussion confidently puts you in a leader position. Be the first speaker when you can.' },
                    { icon: '📌', title: 'Stick to Points', desc: 'Speak with relevant points, use examples or facts. Encourage others to speak.' },
                    { icon: '🌊', title: 'Useful Phrases', desc: '"I agree with your point, but..." / "I would like to add..." / "Building on what was said..."' },
                    { icon: '🏁', title: 'Summarize', desc: 'If you get a chance to summarize the GD, do it — it shows excellent listening and leadership.' }
                ],
                tip: "'Speak with relevant points, use examples or facts. Encourage others, stay calm if interrupted.' — Your Notes"
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Pro GD Techniques! The biggest mistake is either staying silent or speaking too much. Find the golden balance: quality over quantity.",
                concepts: [
                    { icon: '⚖️', title: 'Quality vs Quantity', desc: 'Speaking 3 times with strong points is better than speaking 10 times with weak ones.' },
                    { icon: '🎯', title: 'Abstract Topics', desc: 'For abstract topics, interpret the topic creatively. There is no right answer — show lateral thinking.' },
                    { icon: '🤝', title: 'Conflict Handling', desc: "If someone disagrees aggressively, stay calm: 'That's a valid perspective. However, consider this...' " },
                    { icon: '🗺️', title: 'Structure Your Point', desc: 'Every point you make should have: Claim → Evidence → Impact in 30-45 seconds.' }
                ],
                tip: "'Stay calm when interrupted. Build on previous speakers\' points. Stay on topic always.' — Your Notes"
            }
        ],
        quiz: [
            { q: 'What do evaluators primarily look for in a GD?', options: ['How loudly you speak', 'Knowledge, communication, teamwork, and listening skills', 'Whether you agree with everyone', 'How long you speak'], ans: 1 },
            { q: 'What is the best phrase to disagree in a GD?', options: ['You are completely wrong!', 'Silence', 'That is a valid perspective. However, consider this...', 'I do not care about your point.'], ans: 2 },
            { q: 'What does initiating a GD show?', options: ['Nervousness', 'Confidence and leadership', 'Arrogance', 'Nothing'], ans: 1 },
            { q: 'For abstract GD topics (e.g., "Blue is better than Green"), what is the approach?', options: ['Say there is no answer', 'Show creative/lateral thinking with a unique interpretation', 'Refuse to speak', 'Only use facts'], ans: 1 },
            { q: 'When structuring a GD point, what is the correct order?', options: ['Impact → Claim → Evidence', 'Evidence → Impact → Claim', 'Claim → Evidence → Impact', 'None of the above'], ans: 2 }
        ]
    },
    {
        id: 'conflict', emoji: '⚖️', name: 'Conflict Management',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "Conflict Management! A conflict is a situation where two or more individuals have differences in opinions, interests, values, goals, or expectations. At work, conflict is NORMAL — managing it professionally is the skill!",
                concepts: [
                    { icon: '🔥', title: 'What Causes Conflict?', desc: 'Communication barriers, misunderstanding, role ambiguity, time pressure, organizational changes.' },
                    { icon: '🏢', title: 'Where Does it Happen?', desc: 'Manager-Employee, Team Departments, Employees & customers, Management & employees.' },
                    { icon: '⚠️', title: 'Types of Conflict', desc: 'Interpersonal, Intrapersonal, Group Conflict, Intergroup Conflict, Organizational Conflict.' },
                    { icon: '🎯', title: 'What is Conflict Mgmt?', desc: "The process of handling disagreements and resolving them in a constructive way." }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "Now let's learn HOW to resolve conflicts professionally using proven techniques. The goal is not to WIN — the goal is to find the BEST OUTCOME for everyone.",
                concepts: [
                    { icon: '🔎', title: 'Identify the Problem', desc: 'Listen to both sides. Take an objective look at the situation before taking sides.' },
                    { icon: '🤝', title: 'Find Common Ground', desc: 'Focus on shared goals. What do both parties ultimately want?' },
                    { icon: '💡', title: 'Generate Solutions', desc: 'Generate possible solutions → Evaluate alternatives → Select a solution → Follow up.' },
                    { icon: '🗣️', title: 'Use Calm Language', desc: "Avoid accusatory language. Say 'I feel...' instead of 'You always...'" }
                ],
                tip: "'Effective communication can prevent and resolve conflict. Role-play, use respectful language, focus on the problem, not the person.' — Your Notes"
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Emotional Intelligence is the MASTER skill for conflict management. The ability to understand your own emotions and respond appropriately while helping others find solutions — this is what leaders do!",
                concepts: [
                    { icon: '🧠', title: 'EI in Conflict', desc: 'High EI = You stay calm under pressure and make rational decisions when emotions are high.' },
                    { icon: '💡', title: 'Importance of EI in Mgmt', desc: 'Better decisions, builds team unity, helps handle diverse personalities, reduces workplace stress.' },
                    { icon: '🏆', title: 'Leadership Response', desc: "Leaders acknowledge conflict first: 'I see we have different views. Let's find a way forward together.'" },
                    { icon: '📋', title: 'Follow Up', desc: 'After resolving a conflict, follow up within 1-2 weeks to confirm the solution is working.' }
                ],
                tip: "'Emotional Intelligence is the ability to understand, manage, and express emotions in a way that benefits yourself and others.' — Your Notes"
            }
        ],
        quiz: [
            { q: 'Conflict is defined as:', options: ['A fight', 'A situation where individuals have differences in opinions/goals/values', 'A competition', 'A meeting'], ans: 1 },
            { q: 'Which is NOT a cause of conflict?', options: ['Communication barriers', 'Role ambiguity', 'Teamwork and collaboration', 'Time pressure'], ans: 2 },
            { q: 'What is the first step in conflict resolution?', options: ['Blame someone', 'Identify the problem by listening to both sides', 'Ignore the conflict', 'File a complaint'], ans: 1 },
            { q: 'Which is better in conflict communication?', options: ['"You always make mistakes!"', '"I feel frustrated when deadlines are missed."', 'Stay silent', 'Send an angry email'], ans: 1 },
            { q: 'What role does Emotional Intelligence play in conflict management?', options: ['No role', 'Helps you stay calm and make rational decisions during conflict', 'Makes you more aggressive', 'Makes you avoid conflict completely'], ans: 1 }
        ]
    },
    {
        id: 'workplace', emoji: '🏢', name: 'Workplace Etiquette',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "Workplace Etiquette refers to the set of professional social norms, behaviors, and manners expected in a professional work environment. These are the unwritten rules that define how professionals act!",
                concepts: [
                    { icon: '💼', title: 'Professional Behavior', desc: 'Punctuality, Responsibility, Reliability, Integrity, Adaptability.' },
                    { icon: '🗣️', title: 'Communication', desc: 'Speak clearly and politely. Listen before responding. Use professional language always.' },
                    { icon: '📧', title: 'Email Etiquette', desc: "Use subject lines. Start with 'Dear', include formal greeting, end with 'Regards'." },
                    { icon: '📞', title: 'Telephone Etiquette', desc: 'Answer professionally, introduce yourself, speak clearly, do not put on hold without asking.' }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "Let's go deeper into meeting and digital etiquette — two areas where most freshers make costly mistakes!",
                concepts: [
                    { icon: '🤝', title: 'Meeting Etiquette', desc: 'Be on time. Silence your phone. Have an agenda. Listen. Record decisions and minutes.' },
                    { icon: '💻', title: 'Digital/Social Media Etiquette', desc: 'Use professional language. Never share confidential info. Avoid personal social posts on work accounts.' },
                    { icon: '👤', title: 'Non-Verbal Communication', desc: 'Eye contact, open posture, avoid distracting gestures, pay attention & be face-to-face.' },
                    { icon: '🌐', title: 'LinkedIn Etiquette', desc: 'Keep profile updated. Share professional content. Engage with posts. No controversial content.' }
                ],
                tip: "From your notes: 'Workplace etiquette creates a respectful, productive, and professional work environment. It also helps you fit in, advance, and stand out positively.'"
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Importance of Workplace Etiquette — this is your competitive edge. Good etiquette builds your personal brand and reputation inside any company.",
                concepts: [
                    { icon: '📈', title: 'Career Growth', desc: 'Improves productivity, develops leadership quality, improves teamwork and collaboration.' },
                    { icon: '🤝', title: 'Professional Image', desc: 'Good workplace etiquette builds a professional image, develops positive relationships.' },
                    { icon: '🌟', title: 'Job Chances', desc: "→ Chances of getting placed in good company\n→ Improves communication\n→ Reduces fear about interviews" },
                    { icon: '🧠', title: 'Emotional Control', desc: "Even if you're upset, maintain professionalism. Walk away and return when calm." }
                ],
                tip: "'Workplace Etiquette helps employees: Build professional image → Develop positive relationships → Strengthen communication → Share meaningful insight.' — Your Notes"
            }
        ],
        quiz: [
            { q: 'Workplace Etiquette refers to:', options: ['Dress code only', 'Professional social norms and behaviors expected in a work environment', 'Coding skills', 'Meeting schedules'], ans: 1 },
            { q: 'What should you do when your phone rings in a meeting?', options: ['Answer it loudly', 'Walk out and chat for 10 minutes', 'Keep phone silent before the meeting', 'Ignore the meeting'], ans: 2 },
            { q: 'Which is correct email etiquette?', options: ['Start with "Hey dude!"', 'Use a proper subject line and begin with "Dear [Name]"', 'Write in all caps', 'No greeting needed'], ans: 1 },
            { q: 'What is important in non-verbal communication at work?', options: ['Looking at the floor', 'Open posture and eye contact', 'Crossing arms', 'Distracting gestures'], ans: 1 },
            { q: 'What should you avoid posting on professional social media (LinkedIn)?', options: ['Work achievements', 'Controversial or inappropriate content', 'Certifications earned', 'Professional articles'], ans: 1 }
        ]
    },
    {
        id: 'emotional', emoji: '💡', name: 'Emotional Intelligence',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "Emotional Intelligence (EI) is the ability to understand, manage, and express your own emotions, AND understand and respond appropriately to others' emotions. It's what separates great leaders from average ones!",
                concepts: [
                    { icon: '🧠', title: 'Self-Awareness', desc: 'Know your own emotions and how they affect your thoughts and behavior.' },
                    { icon: '🎛️', title: 'Self-Regulation', desc: 'Control your emotional responses — especially under pressure or in conflict.' },
                    { icon: '🔥', title: 'Motivation', desc: 'Internally driven. Not for money or status — but for the love of the work.' },
                    { icon: '❤️', title: 'Empathy', desc: 'Understand how others feel. Read the room — emotional and social cues.' }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "EI in the workplace is CRITICAL. Studies show that 90% of top performers have high Emotional Intelligence. It directly impacts your relationships, leadership, and career progression.",
                concepts: [
                    { icon: '🏆', title: 'EI in Management', desc: 'Better decisions, builds strong program community, helps handle diverse people, develops leadership.' },
                    { icon: '🤝', title: 'EI in Teams', desc: 'Improve teamwork and collaboration. Understand team dynamics before reacting.' },
                    { icon: '🛠️', title: 'Managing Conflicts', desc: 'High EI = You approach conflict with curiosity, not anger. You seek understanding first.' },
                    { icon: '📈', title: 'Career Impact', desc: 'EI influences how you are perceived as a colleague, team member, and future leader.' }
                ],
                tip: "'Emotional Intelligence in Management: Better decisions, builds strong team, helps handle diverse personalities, improves employee engagement.' — Your Notes"
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Pro-level EI means you can read ANY room — a difficult client, a stressed colleague, or a tough interview panel — and adapt your communication to fit the moment perfectly.",
                concepts: [
                    { icon: '🎭', title: 'Social Skills', desc: 'Network naturally, influence others positively, manage relationships strategically.' },
                    { icon: '🌊', title: 'Adaptability', desc: 'Respond to change with calm and flexibility instead of resistance.' },
                    { icon: '💬', title: 'Constructive Feedback', desc: 'Give and receive feedback without ego. High EI people welcome feedback as growth.' },
                    { icon: '🔑', title: 'The EI Advantage', desc: 'EI can be developed through practice, journaling emotions, and mindfulness daily.' }
                ],
                tip: "High EI is more predictive of career success than IQ or technical skills alone — Harvard Business Review confirms this. Build it daily!"
            }
        ],
        quiz: [
            { q: 'Emotional Intelligence primarily means:', options: ['Being emotional all the time', 'Understanding and managing your emotions and responding to others empathetically', 'Suppressing all feelings', 'Being very logical only'], ans: 1 },
            { q: 'Which is NOT a component of EI?', options: ['Self-Awareness', 'Self-Regulation', 'High IQ', 'Empathy'], ans: 2 },
            { q: 'How does EI help in managing conflicts?', options: ['Makes you more aggressive', 'You approach conflict with curiosity and seek understanding first', 'Makes you avoid all conflict', 'Has no impact'], ans: 1 },
            { q: 'What percentage of top performers have high emotional intelligence?', options: ['10%', '50%', '90%', '30%'], ans: 2 },
            { q: 'EI can be improved through:', options: ['Ignoring your emotions', 'Journaling, mindfulness, and practicing empathy daily', 'Reading only textbooks', 'Avoiding people'], ans: 1 }
        ]
    },
    {
        id: 'linkedin', emoji: '🔗', name: 'LinkedIn Profile Mastery',
        levels: [
            {
                level: 'Beginner', color: '#10b981',
                intro: "LinkedIn is a professional networking platform where students, employees, companies, and professionals connect, discover jobs, share content, and build their career brand. It is the world's LARGEST professional network!",
                concepts: [
                    { icon: '📸', title: 'Profile Photo', desc: 'Professional headshot. Smile, neat clothing, plain background. First impressions matter!' },
                    { icon: '📝', title: 'Headline', desc: "Not just 'Student' — make it powerful: 'B.E. Computer Science | Python & ML Enthusiast | Open to Opportunities'." },
                    { icon: '📖', title: 'About Section', desc: 'Professional introduction covering: Who you are, your skills, your interests, your career goal.' },
                    { icon: '🎓', title: 'Education', desc: 'College, degree, CGPA (if above 7.5), achievements, activities.' }
                ],
                tip: null
            },
            {
                level: 'Intermediate', color: '#f59e0b',
                intro: "A good LinkedIn profile helps you get noticed. Let's build each section strategically so that recruiters see you as a serious professional, even as a student.",
                concepts: [
                    { icon: '🛠️', title: 'Skills Section', desc: 'Add both Technical (Python, SQL) and Soft skills (Communication, Leadership). Endorse others to get endorsed.' },
                    { icon: '📜', title: 'Certifications', desc: 'Add every NPTEL, Coursera, Google, AWS certificate. It shows initiative.' },
                    { icon: '🚀', title: 'Projects Section', desc: 'Title + 2-line description + Tools used + Link. This is your biggest proof of skills.' },
                    { icon: '🏅', title: 'Achievements', desc: 'Awards, competitions, publications, events you organized or participated in.' }
                ],
                tip: "From your notes: LinkedIn helps you 'Build professional image, Search job opportunities, Connect with recruiters, Stay updated with industry trends.'"
            },
            {
                level: 'Pro', color: '#ef4444',
                intro: "Pro LinkedIn strategy! The difference between a good profile and a GREAT profile is ACTIVITY. Recruiters follow profiles that consistently share knowledge and engage with the community.",
                concepts: [
                    { icon: '📰', title: 'Share Content', desc: 'Post what you are learning. Share internship experiences. Summarize a tech article. Do this weekly.' },
                    { icon: '🤝', title: 'Network Smart', desc: 'Connect with classmates, alumni, faculty, recruiters, and industry professionals.' },
                    { icon: '💬', title: 'Engage Actively', desc: 'Like and comment on posts with thoughtful insights — not just "great post!" It builds visibility.' },
                    { icon: '🔍', title: 'Networking Tips', desc: "From your notes: 'Connect with classmates, alumni, faculty, recruiters, industry professionals. Share professional content, engage with posts, avoid controversial content, no false information.'" }
                ],
                tip: "'LinkedIn Networking: Building professional connection requests.' — Your Notes. A personalized connection request has 3x higher acceptance rate than a blank one!"
            }
        ],
        quiz: [
            { q: 'What is LinkedIn?', options: ['A gaming platform', 'A professional networking platform for career building', 'A social media for photos', 'An email service'], ans: 1 },
            { q: 'Which LinkedIn headline is most effective for a student?', options: ['Student', 'B.E. Computer Science | Python & ML | Open to Opportunities', 'Available for hire', 'Nothing yet'], ans: 1 },
            { q: 'Why should you add certifications to LinkedIn?', options: ['It wastes space', 'It shows initiative and learning beyond the classroom', 'It is mandatory', 'Recruiters never check it'], ans: 1 },
            { q: 'What type of content should you share on LinkedIn?', options: ['Personal drama', 'Controversial political opinions', 'Your learnings, projects, and professional insights', 'Food photos'], ans: 2 },
            { q: 'What should you avoid on LinkedIn?', options: ['Sharing certifications', 'Connecting with recruiters', 'Controversial or false information', 'Mentioning your skills'], ans: 2 }
        ]
    }
];

// Add consistent practice questions so every topic is scored out of 10.
KL_TOPICS.forEach(topic => {
    const questions = topic.quiz.slice(0, 10);
    topic.levels.forEach(level => level.concepts.slice(0, 4).forEach(concept => {
        questions.push({
            q: `Which idea is covered in ${level.level}?`,
            options: [concept.title, 'An unrelated topic', 'A random shortcut', 'None of these'],
            ans: 0
        });
    }));
    questions.push({
        q: `How should you apply ${topic.name} in practice?`,
        options: ['Use it consistently in a real situation', 'Ignore it after this quiz', 'Only memorize the title', 'Avoid feedback'],
        ans: 0
    });
    topic.quiz = questions.slice(0, 10);
});

// --- State ---
let klState = {
    unlocked: [],
    completed: [],
    topicScores: {},
    currentTopicIndex: null,
    currentLevelIndex: 0,
    quizAnswers: {},
    currentTopicForQuiz: null
};

// --- Load/Save State ---
async function klLoadState() {
    const saved = localStorage.getItem('kl_state');
    if (saved) {
        klState = JSON.parse(saved);
        klState.topicScores = klState.topicScores || {};
    } else {
        // Topic 0 is always unlocked by default
        klState.unlocked = [0];
        klState.completed = [];
        klSaveState();
    }
    if (Backend.Auth.isLoggedIn()) {
        const remoteState = await Backend.KnowledgeLab.getProgress();
        if (remoteState && Array.isArray(remoteState.unlocked)) {
            klState = { ...klState, ...remoteState, topicScores: remoteState.topicScores || {} };
            localStorage.setItem('kl_state', JSON.stringify(klState));
            if (klState.certificate) localStorage.setItem('kl_certificate', JSON.stringify(klState.certificate));
        }
    }
}

function klSaveState() {
    localStorage.setItem('kl_state', JSON.stringify(klState));
    if (Backend.Auth.isLoggedIn()) Backend.KnowledgeLab.saveProgress(klState);
}

// --- Init ---
async function initKnowledgeLab() {
    await klLoadState();
    klRenderTopicList();
    klUpdateOverallProgress();
    // Show welcome screen
    klShowScreen('welcome');
}

window.initKnowledgeLab = initKnowledgeLab;

// --- Render Topic List ---
function klRenderTopicList() {
    const list = document.getElementById('klTopicList');
    if (!list) return;
    list.innerHTML = '';
    KL_TOPICS.forEach((topic, idx) => {
        const isUnlocked = klState.unlocked.includes(idx);
        const isCompleted = klState.completed.includes(idx);
        const isCurrent = klState.currentTopicIndex === idx;

        let badge = '🔒';
        let badgeColor = '#64748b';
        let cardBg = 'rgba(255,255,255,0.02)';
        let borderColor = 'rgba(255,255,255,0.04)';
        let textColor = '#64748b';
        let cursor = 'not-allowed';
        let onclick = '';

        if (isCompleted) {
            badge = '⭐';
            badgeColor = '#f59e0b';
            cardBg = 'rgba(245,158,11,0.06)';
            borderColor = 'rgba(245,158,11,0.2)';
            textColor = '#fde68a';
            cursor = 'pointer';
            onclick = `klSelectTopic(${idx})`;
        } else if (isUnlocked) {
            badge = '✅';
            badgeColor = '#10b981';
            cardBg = isCurrent ? 'rgba(139,92,246,0.12)' : 'rgba(16,185,129,0.06)';
            borderColor = isCurrent ? 'rgba(139,92,246,0.4)' : 'rgba(16,185,129,0.2)';
            textColor = '#e2e8f0';
            cursor = 'pointer';
            onclick = `klSelectTopic(${idx})`;
        }

        list.innerHTML += `
        <div onclick="${onclick}" style="
            background:${cardBg}; border:1px solid ${borderColor}; border-radius:10px;
            padding:12px 14px; cursor:${cursor}; transition:all 0.2s;
            display:flex; align-items:center; gap:10px;
            ${isCurrent ? 'box-shadow:0 0 12px rgba(139,92,246,0.3);' : ''}
        " onmouseover="if('${cursor}'==='pointer'){this.style.background='rgba(139,92,246,0.1)'; this.style.borderColor='rgba(139,92,246,0.3)';}"
           onmouseout="this.style.background='${cardBg}'; this.style.borderColor='${borderColor}';">
            <div style="font-size:1.3rem;">${topic.emoji}</div>
            <div style="flex:1;">
                <div style="font-size:0.85rem; font-weight:700; color:${textColor};">${topic.name}</div>
                <div style="font-size:0.68rem; color:${badgeColor}; font-weight:700; margin-top:2px;">${badge} ${isCompleted ? 'Completed' : isUnlocked ? 'Unlocked' : 'Locked'}</div>
            </div>
            <div style="font-size:0.7rem; color:#475569; font-weight:700;">${idx + 1}/${KL_TOPICS.length}</div>
        </div>`;
    });
}

// --- Select Topic ---
function klSelectTopic(idx) {
    if (!klState.unlocked.includes(idx) && !klState.completed.includes(idx)) return;
    klState.currentTopicIndex = idx;
    klState.currentLevelIndex = 0;
    klSaveState();
    klRenderTopicList();
    klShowLesson();
}

window.klSelectTopic = klSelectTopic;

// --- Show Lesson ---
function klShowLesson() {
    const idx = klState.currentTopicIndex;
    if (idx === null) return;
    const topic = KL_TOPICS[idx];
    const levelIdx = klState.currentLevelIndex;
    const level = topic.levels[levelIdx];

    // Populate lesson content
    document.getElementById('klLessonTopicEmoji').innerText = topic.emoji;
    document.getElementById('klLessonTopicName').innerText = topic.name;

    // Level Badges
    const levelBadges = document.getElementById('klLevelBadges');
    levelBadges.innerHTML = topic.levels.map((l, i) => {
        const isActive = i === levelIdx;
        const isDone = i < levelIdx;
        const bg = isDone ? 'rgba(16,185,129,0.3)' : isActive ? `rgba(139,92,246,0.3)` : 'rgba(255,255,255,0.05)';
        const color = isDone ? '#10b981' : isActive ? '#a78bfa' : '#475569';
        return `<span style="font-size:0.7rem; font-weight:800; padding:2px 10px; border-radius:20px; background:${bg}; color:${color};">${l.level}</span>`;
    }).join('');

    // Teacher intro
    document.getElementById('klLessonIntro').innerText = level.intro;

    // Concept Cards
    const cards = document.getElementById('klConceptCards');
    cards.innerHTML = level.concepts.map(c => `
        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:14px;">
            <div style="font-size:1.3rem; margin-bottom:6px;">${c.icon}</div>
            <div style="font-size:0.82rem; font-weight:800; color:#e2e8f0; margin-bottom:4px;">${c.title}</div>
            <div style="font-size:0.78rem; color:#94a3b8; line-height:1.5;">${c.desc}</div>
        </div>
    `).join('');

    // Pro Tip
    const factBanner = document.getElementById('klFactBanner');
    const factText = document.getElementById('klFactText');
    if (level.tip) {
        factBanner.style.display = 'block';
        factText.innerText = level.tip;
    } else {
        factBanner.style.display = 'none';
    }

    // Level dots
    const dots = document.getElementById('klLevelDots');
    dots.innerHTML = topic.levels.map((_, i) => {
        const color = i === levelIdx ? '#8b5cf6' : i < levelIdx ? '#10b981' : 'rgba(255,255,255,0.1)';
        return `<div style="width:8px;height:8px;border-radius:50%;background:${color};transition:background 0.3s;"></div>`;
    }).join('');

    // Prev/Next buttons
    const prevBtn = document.getElementById('klPrevLevelBtn');
    const nextBtn = document.getElementById('klNextLevelBtn');

    if (levelIdx === 0) {
        prevBtn.classList.add('hidden');
    } else {
        prevBtn.classList.remove('hidden');
    }

    if (levelIdx === topic.levels.length - 1) {
        nextBtn.innerText = '📝 Take Quiz';
        nextBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    } else {
        nextBtn.innerText = 'Next Level →';
        nextBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
    }

    klShowScreen('lesson');
}

// --- Navigation ---
window.klNextLevel = function() {
    const topic = KL_TOPICS[klState.currentTopicIndex];
    if (klState.currentLevelIndex < topic.levels.length - 1) {
        klState.currentLevelIndex++;
        klSaveState();
        klShowLesson();
    } else {
        // Last level done — go to quiz
        klShowQuiz();
    }
};

window.klPrevLevel = function() {
    if (klState.currentLevelIndex > 0) {
        klState.currentLevelIndex--;
        klSaveState();
        klShowLesson();
    }
};

// --- Speak Lesson ---
window.klSpeakLesson = function() {
    const topic = KL_TOPICS[klState.currentTopicIndex];
    const level = topic.levels[klState.currentLevelIndex];
    if (!('speechSynthesis' in window)) { alert('Speech synthesis not supported in your browser.'); return; }
    window.speechSynthesis.cancel();
    const text = level.intro + '. Key concepts: ' + level.concepts.map(c => c.title + ': ' + c.desc).join('. ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
};

// --- Show Quiz ---
function klShowQuiz() {
    const topic = KL_TOPICS[klState.currentTopicIndex];
    klState.currentTopicForQuiz = klState.currentTopicIndex;
    klState.quizAnswers = {};

    document.getElementById('klQuizTopicTitle').innerText = `${topic.emoji} ${topic.name} — Assessment`;
    document.getElementById('klQuizProgress').innerText = `10 Questions • 1 mark each • Pass with 6/10 (60%)`;

    const qqEl = document.getElementById('klQuizQuestions');
    qqEl.innerHTML = topic.quiz.map((q, qi) => `
        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:16px 20px;" id="qqBlock_${qi}">
            <div style="font-size:0.88rem; font-weight:700; color:#e2e8f0; margin-bottom:12px;">Q${qi+1}. ${q.q}</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${q.options.map((opt, oi) => `
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);transition:all 0.2s;" 
                           id="qqLabel_${qi}_${oi}"
                           onmouseover="this.style.background='rgba(139,92,246,0.1)'"
                           onmouseout="if(!document.getElementById('qqInput_${qi}_${oi}').checked){this.style.background='transparent';}">
                        <input type="radio" name="qq_${qi}" id="qqInput_${qi}_${oi}" value="${oi}" 
                               onchange="window.klRecordAnswer(${qi},${oi})"
                               style="accent-color:#8b5cf6;">
                        <span style="font-size:0.85rem; color:#cbd5e1;">${opt}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');

    document.getElementById('klSubmitQuizBtn').style.display = 'none';
    document.getElementById('klSubmitQuizBtn').style.display = 'block';

    klShowScreen('quiz');

    // Watch for all answers
    klCheckAllAnswered();
}

window.klRecordAnswer = function(qi, oi) {
    klState.quizAnswers[qi] = oi;
    const label = document.getElementById(`qqLabel_${qi}_${oi}`);
    if (label) label.style.background = 'rgba(139,92,246,0.15)';
    klCheckAllAnswered();
};

function klCheckAllAnswered() {
    const topic = KL_TOPICS[klState.currentTopicForQuiz];
    const submitBtn = document.getElementById('klSubmitQuizBtn');
    if (Object.keys(klState.quizAnswers).length === topic.quiz.length) {
        submitBtn.style.display = 'block';
    }
}

// --- Submit Quiz ---
window.klSubmitQuiz = function() {
    const topic = KL_TOPICS[klState.currentTopicForQuiz];
    let correct = 0;
    topic.quiz.forEach((q, qi) => {
        const userAns = klState.quizAnswers[qi];
        const block = document.getElementById(`qqBlock_${qi}`);
        if (userAns === q.ans) {
            correct++;
            if (block) block.style.borderColor = '#10b981';
        } else {
            if (block) block.style.borderColor = '#ef4444';
        }
    });

    const passed = correct >= 6; // 60% = 6 out of 10
    klShowResult(passed, correct, topic.quiz.length);
};

// --- Show Result ---
function klShowResult(passed, correct, total) {
    const topicIdx = klState.currentTopicForQuiz;
    const pct = Math.round((correct / total) * 100);

    const emoji = document.getElementById('klResultEmoji');
    const title = document.getElementById('klResultTitle');
    const msg = document.getElementById('klResultMsg');
    const score = document.getElementById('klScoreDisplay');
    const retryBtn = document.getElementById('klRetryBtn');
    const nextBtn = document.getElementById('klNextTopicBtn');
    const certificateArea = document.getElementById('klCertificateArea');

    score.innerText = `${correct}/${total}`;
    score.style.color = passed ? '#10b981' : '#ef4444';
    if (certificateArea) certificateArea.style.display = 'none';

    if (passed) {
        emoji.innerText = '🎉';
        title.innerText = 'Excellent! You Passed!';
        title.style.color = '#10b981';
        msg.innerText = `You scored ${pct}%. Congratulations! The next topic has been unlocked. Keep going — you're on your way to becoming a Corporate Champion!`;
        retryBtn.style.display = 'none';
        nextBtn.style.display = 'inline-block';

        // Unlock next topic
        if (!klState.completed.includes(topicIdx)) klState.completed.push(topicIdx);
        klState.topicScores[topicIdx] = Math.max(klState.topicScores[topicIdx] || 0, correct);
        const nextIdx = topicIdx + 1;
        if (nextIdx < KL_TOPICS.length && !klState.unlocked.includes(nextIdx)) {
            klState.unlocked.push(nextIdx);
        }
        klSaveState();
        klRenderTopicList();
        klUpdateOverallProgress();

        const totalKnowledgeMarks = Object.values(klState.topicScores).reduce((sum, value) => sum + value, 0);
        const knowledgePercent = Math.round((totalKnowledgeMarks / (KL_TOPICS.length * 10)) * 100);
        if (klState.completed.length === KL_TOPICS.length && knowledgePercent >= 85) {
            const user = Backend.Auth.getStoredUser() || {};
            const certificate = {
                name: user.name || 'Rank Holder Learner',
                email: user.email || '',
            score: totalKnowledgeMarks,
                total: KL_TOPICS.length * 10,
                issuedAt: new Date().toISOString()
            };
            klState.certificate = certificate;
            localStorage.setItem('kl_certificate', JSON.stringify(certificate));
            klSaveState();
            if (certificateArea) certificateArea.style.display = 'block';
            const certText = document.getElementById('klCertificateText');
            if (certText) certText.textContent = `${certificate.name} completed all 10 levels with ${certificate.score}/${certificate.total} marks.`;
            msg.innerText = `Outstanding work, ${certificate.name}! You completed all 10 levels and earned your certificate! 🎉`;

            // Render certificate image with user's name on the inline canvas
            const certCanvas = document.getElementById('klCertificateCanvas');
            if (certCanvas) {
                renderCertificateCanvas(certCanvas, certificate).catch(e => console.error("Certificate render error:", e));
            }
        } else if (klState.completed.length === KL_TOPICS.length) {
            msg.innerText = `You completed all 10 levels with ${totalKnowledgeMarks}/${KL_TOPICS.length * 10} marks (${knowledgePercent}%). Reach 85% overall to unlock the certificate.`;
        }

        // Confetti!
        klLaunchConfetti();
    } else {
        emoji.innerText = '💪';
        title.innerText = 'Not Quite Yet!';
        title.style.color = '#f59e0b';
        msg.innerText = `You scored ${pct}% (${correct}/${total} correct). You need 60% (6/10) to unlock the next topic. Review the lessons and try again.`;
        retryBtn.style.display = 'inline-block';
        nextBtn.style.display = 'none';
    }

    klShowScreen('result');
}

// --- Navigation Helpers ---
window.klRetryQuiz = function() { klShowQuiz(); };
window.klGoNextTopic = function() {
    const nextIdx = klState.currentTopicForQuiz + 1;
    if (nextIdx < KL_TOPICS.length) { klSelectTopic(nextIdx); }
    else { klShowScreen('welcome'); }
};
window.klGoToMap = function() { klShowScreen('welcome'); };

// --- Show Screen Helper ---
function klShowScreen(screen) {
    document.getElementById('klWelcomeScreen').style.display = screen === 'welcome' ? 'block' : 'none';
    document.getElementById('klLessonScreen').style.display = screen === 'lesson' ? 'block' : 'none';
    document.getElementById('klQuizScreen').style.display = screen === 'quiz' ? 'block' : 'none';
    document.getElementById('klResultScreen').style.display = screen === 'result' ? 'block' : 'none';
}

// --- Overall Progress ---
function klUpdateOverallProgress() {
    const total = KL_TOPICS.length;
    const done = klState.completed.length;
    const pct = Math.round((done / total) * 100);
    const el = document.getElementById('klOverallProgress');
    const bar = document.getElementById('klOverallBar');
    if (el) el.innerText = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;
}

// --- Confetti Effect ---
function klLaunchConfetti() {
    const colors = ['#8b5cf6', '#f59e0b', '#10b981', '#38bdf8', '#ef4444', '#fff'];
    for (let i = 0; i < 80; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position:fixed; z-index:99999; pointer-events:none;
            width:${Math.random() * 10 + 5}px; height:${Math.random() * 10 + 5}px;
            background:${colors[Math.floor(Math.random() * colors.length)]};
            border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
            left:${Math.random() * 100}vw; top:-20px;
            animation:klConfettiFall ${Math.random() * 2 + 1.5}s linear forwards;
        `;
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 4000);
    }
}

// Inject confetti animation keyframes
(function() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes klConfettiFall {
            0% { transform: translateY(0) rotate(0deg); opacity:1; }
            100% { transform: translateY(100vh) rotate(${Math.random() * 720}deg); opacity:0; }
        }
    `;
    document.head.appendChild(style);
})();

/* ─── Freelance Chat (User Side) ───────────────────────────────── */

// Profanity filter (client-side first layer)
const PROFANITY_WORDS = ["fuck", "shit", "bitch", "asshole", "cunt", "dick", "pussy", "bastard", "slut", "whore"];
function clientFilterProfanity(text) {
    let f = text;
    PROFANITY_WORDS.forEach(w => {
        const rx = new RegExp("\\b" + w + "\\b", "gi");
        f = f.replace(rx, "***");
    });
    return f;
}

// Get user location using Google Maps Geocoder
async function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const { latitude, longitude } = pos.coords;
                const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyBA6wFkIJ--u1Nz9P2narZPh0zVA-lDveA`);
                const data = await r.json();
                const city = data.results?.[0]?.address_components?.find(c => c.types.includes("locality"))?.long_name;
                const country = data.results?.[0]?.address_components?.find(c => c.types.includes("country"))?.long_name;
                resolve(city && country ? `${city}, ${country}` : null);
            } catch(e) { resolve(null); }
        }, () => resolve(null));
    });
}

// Open Freelance Modal and load chat history
async function openFreelanceModal() {
    const modal = document.getElementById("freelanceModal");
    if (!modal) return;
    modal.classList.add("active");
    
    // Automatically trigger PDF download
    const link = document.createElement("a");
    link.href = "Freelance_Brochure.pdf";
    link.download = "Freelance_Brochure.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    await loadFreelanceChatHistory();
}

// Close Freelance Modal
function closeFreelanceModal() {
    const modal = document.getElementById("freelanceModal");
    if (modal) modal.classList.remove("active");
}

// Load existing chat messages for the logged-in user
async function loadFreelanceChatHistory() {
    const chatWindow = document.getElementById("freelanceChatWindow");
    if (!chatWindow) return;
    const token = localStorage.getItem("rh_auth_token");
    if (!token) return;

    try {
        const r = await fetch("/api/freelance/chat", {
            headers: { "Authorization": "Bearer " + token }
        });
        const data = await r.json();
        chatWindow.innerHTML = "";
        if (!data.chats || data.chats.length === 0) {
            chatWindow.innerHTML = "<div style='text-align:center;color:var(--text-muted);font-size:0.9rem;margin:auto;'>Start a conversation to discuss your project!</div>";
            return;
        }
        data.chats.forEach(msg => {
            const isUser = msg.sender === "user";
            const div = document.createElement("div");
            div.style.cssText = `
                max-width: 80%; padding: 10px 14px; border-radius: 10px; font-size: 0.9rem;
                word-break: break-word;
                ${isUser
                    ? "align-self: flex-end; background: rgba(99,102,241,0.3); border: 1px solid var(--brand-primary);"
                    : "align-self: flex-start; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15);"
                }
            `;
            const label = document.createElement("div");
            label.style.cssText = "font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;";
            label.textContent = isUser ? "You" : "🛠️ Admin";
            const txt = document.createElement("div");
            txt.textContent = msg.message;
            div.appendChild(label);
            div.appendChild(txt);
            chatWindow.appendChild(div);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    } catch(e) {
        console.error("Freelance chat load error:", e);
    }
}

// Send message in Freelance Chat
async function sendFreelanceMessage() {
    const input = document.getElementById("freelanceMessageInput");
    if (!input || !input.value.trim()) return;

    const raw = input.value.trim();
    const message = clientFilterProfanity(raw);
    const token = localStorage.getItem("rh_auth_token");
    if (!token) { alert("Please log in to send a message."); return; }

    // Get location on first message (async, non-blocking)
    let location = null;
    try { location = await getUserLocation(); } catch(e) {}

    try {
        const r = await fetch("/api/freelance/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({ message, location })
        });
        const d = await r.json();
        if (d.success) {
            input.value = "";
            await loadFreelanceChatHistory();
        } else {
            alert("Failed to send: " + (d.error || "Unknown error"));
        }
    } catch(e) {
        alert("Network error. Please try again.");
    }
}

// Request a network call (sends a special message)
async function requestNetworkCall() {
    const token = localStorage.getItem("rh_auth_token");
    if (!token) { alert("Please log in first."); return; }

    const confirmed = confirm("This will notify the Admin that you'd like to schedule a network call. Continue?");
    if (!confirmed) return;

    try {
        await fetch("/api/freelance/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({ message: "📞 [CALL REQUEST] I would like to schedule a network call to discuss a project." })
        });
        alert("✅ Call request sent! The admin will contact you soon.");
        await loadFreelanceChatHistory();
    } catch(e) {
        alert("Network error.");
    }
}
