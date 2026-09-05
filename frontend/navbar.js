const _API = window.location.protocol === "file:" ? "http://127.0.0.1:5000/api" : "/api";
function _getToken(){return localStorage.getItem("rh_auth_token")||"";}
window.toggleTheme=function(){document.body.classList.toggle("light-theme");var icon=document.getElementById("themeIcon")||document.getElementById("tIcon");var label=document.getElementById("themeLabel")||document.getElementById("tLabel");var isLight=document.body.classList.contains("light-theme");if(icon)icon.innerHTML=isLight?"&#127776;":"&#9728;";if(label)label.textContent=isLight?"Dark":"Light";localStorage.setItem("rh_theme",isLight?"light":"dark");};
window.toggleNotifPanel=function(){var np=document.getElementById("notifPanel");var pp=document.getElementById("profilePanel");var sp=document.getElementById("settingsPanel");if(!np)return;if(pp)pp.style.display="none";if(sp)sp.style.display="none";var open=np.style.display==="none"||np.style.display==="";np.style.display=open?"block":"none";if(open)_loadNotifs();};
async function _loadNotifs(){var c=document.getElementById("notifList");if(!c)return;c.innerHTML="<div style='padding:10px;text-align:center;font-size:0.8rem;color:#64748b;'>Loading...</div>";try{var r=await fetch(_API+"/notifications");var data=await r.json();var list=(data.notifications&&data.notifications.length)?data.notifications:[{id:1,title:"Google India Hiring",message:"SWE-1 openings posted this morning.",category:"job",tag:"Hiring Active"},{id:2,title:"TCS NQT Approaching",message:"Registration closes soon.",category:"job",tag:"Deadline Soon"},{id:3,title:"Zoho Off-Campus",message:"Interviews for Dev & QA roles.",category:"internship",tag:"Urgent Hiring"}];var icons={job:"💼",internship:"🎓",system:"⚙️",general:"🔔"};var colors={job:"#10b981",internship:"#6366f1",system:"#f59e0b"};c.innerHTML=list.map(function(n){var tc=colors[n.category]||"#10b981";return'<div class="notif-card" data-category="'+(n.category||"job")+'" style="padding:12px;border-radius:10px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);margin-bottom:8px;"><div style="font-size:0.85rem;font-weight:700;color:#f0f4ff;">'+(icons[n.category]||"🔔")+" "+n.title+'</div><span style="display:inline-block;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;margin-bottom:6px;background:rgba(16,185,129,0.15);color:'+tc+';">'+(n.tag||(n.category||"").toUpperCase())+'</span><div style="font-size:0.78rem;color:#94a3b8;">'+n.message+"</div></div>";}).join("");var badge=document.getElementById("notifBadge");if(badge&&list.length>0)badge.style.display="block";}catch(e){c.innerHTML="<div style='padding:10px;font-size:0.8rem;color:#f59e0b;'>Could not load notifications.</div>";}}
window.clearNotifications=async function(){try{await fetch(_API+"/notifications/clear",{method:"POST"});}catch(e){}var nl=document.getElementById("notifList");if(nl)nl.innerHTML="<div style='font-size:0.8rem;color:#64748b;padding:10px;text-align:center;'>No active notifications.</div>";var badge=document.getElementById("notifBadge");if(badge)badge.style.display="none";};
window.filterNotifs=function(ft){var ba=document.getElementById("notifFilterAll");var bj=document.getElementById("notifFilterJob");var bi=document.getElementById("notifFilterIntern");[ba,bj,bi].forEach(function(b){if(b){b.style.background="rgba(99,102,241,0.05)";b.style.borderColor="rgba(99,102,241,0.1)";b.style.color="#64748b";}});function act(b){if(b){b.style.background="rgba(99,102,241,0.18)";b.style.borderColor="rgba(99,102,241,0.3)";b.style.color="#6366f1";}}document.querySelectorAll("#notifList .notif-card").forEach(function(c){var cat=c.dataset.category||"job";if(ft==="all"){c.style.display="block";act(ba);}else if(ft==="job"){c.style.display=cat.includes("job")?"block":"none";act(bj);}else if(ft==="internship"){c.style.display=cat.includes("intern")?"block":"none";act(bi);}});};
window.toggleSettingsPanel=function(){var p=document.getElementById("settingsPanel");var pp=document.getElementById("profilePanel");var np=document.getElementById("notifPanel");if(!p)return;if(pp)pp.style.display="none";if(np)np.style.display="none";var open=p.style.display==="none"||p.style.display==="";p.style.display=open?"block":"none";if(open){_loadSettingsNotifs();_checkAdmin();_loadSettingsProfile();}};
async function _loadSettingsNotifs(){var c=document.getElementById("settingsNotifList");if(!c)return;try{var tok=_getToken();var opts=tok?{headers:{Authorization:"Bearer "+tok}}:{};var r=await fetch(_API+"/notifications",opts);var data=await r.json();var notifs=(data.notifications||[]).slice(0,5);if(!notifs.length){c.innerHTML="<span style='font-size:0.78rem;color:#64748b;'>No new alerts.</span>";return;}var icons={job:"💼",system:"⚙️",general:"🔔",internship:"🎓"};c.innerHTML=notifs.map(function(n){return'<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:8px;padding:8px 10px;"><div style="font-size:0.78rem;font-weight:700;color:#f0f4ff;margin-bottom:2px;">'+(icons[n.category]||"🔔")+" "+n.title+'</div><div style="font-size:0.72rem;color:#64748b;">'+n.message+"</div></div>";}).join("");}catch(e){c.innerHTML="<span style='font-size:0.78rem;color:#64748b;'>Could not load notifications.</span>";}}
window.loadSettingsNotifications=_loadSettingsNotifs;
async function _checkAdmin(){var s=document.getElementById("settingsAdminSection");if(!s)return;var tok=_getToken();if(!tok){s.style.display="none";return;}try{var r=await fetch(_API+"/auth/is-admin",{headers:{Authorization:"Bearer "+tok}});s.style.display=r.ok?"block":"none";}catch(e){s.style.display="none";}}
window.toggleProfilePanel=function(){var p=document.getElementById("profilePanel");var sp=document.getElementById("settingsPanel");var np=document.getElementById("notifPanel");if(!p)return;if(sp)sp.style.display="none";if(np)np.style.display="none";var open=p.style.display==="none"||p.style.display==="";p.style.display=open?"block":"none";};
window.openQuickAccess=function(){window.location.href="app.html";};
window.openAdminPanelSecure = async function() {
    var token = localStorage.getItem("rh_auth_token") || "";
    
    // Fast path: if already authenticated as admin, go straight to admin.html
    if (token) {
        try {
            var r = await fetch(_API + "/auth/is-admin", { headers: { "Authorization": "Bearer " + token } });
            if (r.ok) {
                var d = await r.json();
                if (d.is_admin) {
                    window.location.href = "admin.html";
                    return;
                }
            }
        } catch(e) {
            console.warn("Fast admin check failed:", e);
        }
    }

    // Otherwise, show the dedicated non-blocking Admin Authentication Modal
    showAdminAuthModal();
};

window.showAdminAuthModal = function() {
    var existingModal = document.getElementById("rhAdminAuthModal");
    if (existingModal) {
        existingModal.style.display = "flex";
        var pwdInput = document.getElementById("rhAdminPasswordInput");
        if (pwdInput) pwdInput.focus();
        return;
    }

    var modal = document.createElement("div");
    modal.id = "rhAdminAuthModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(10,14,35,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;";

    modal.innerHTML = `
        <div style="background:#131b35;border:1px solid rgba(99,102,241,0.4);border-radius:20px;max-width:440px;width:100%;padding:28px 24px;box-shadow:0 24px 64px rgba(0,0,0,0.6);color:#f0f4ff;font-family:system-ui,-apple-system,sans-serif;position:relative;animation:rhAdminFadeIn 0.25s ease-out;">
            <button onclick="closeAdminAuthModal()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#94a3b8;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" onmouseover="this.style.color='#fff';this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.color='#94a3b8';this.style.background='rgba(255,255,255,0.08)'">✕</button>
            
            <div style="text-align:center;margin-bottom:20px;">
                <div style="width:56px;height:56px;margin:0 auto 12px;background:linear-gradient(135deg,#6366f1,#818cf8);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 8px 24px rgba(99,102,241,0.4);">🛡️</div>
                <h3 style="margin:0 0 6px;font-size:1.3rem;font-weight:800;letter-spacing:-0.02em;color:#fff;">Admin Console Access</h3>
                <p style="margin:0;font-size:0.84rem;color:#94a3b8;">Super Administrator Authentication for <strong style="color:#a5b4fc;">tnesh833@gmail.com</strong></p>
            </div>

            <div id="rhAdminAuthError" style="display:none;background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.35);color:#fda4af;padding:10px 14px;border-radius:10px;font-size:0.82rem;font-weight:600;margin-bottom:16px;text-align:center;"></div>
            <div id="rhAdminAuthSuccess" style="display:none;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#6ee7b7;padding:10px 14px;border-radius:10px;font-size:0.82rem;font-weight:600;margin-bottom:16px;text-align:center;"></div>

            <div style="display:flex;gap:6px;background:rgba(0,0,0,0.25);padding:4px;border-radius:12px;margin-bottom:18px;">
                <button id="rhAdminTabPassword" onclick="switchAdminAuthTab('password')" style="flex:1;padding:8px;border:none;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;transition:all 0.2s;">🔑 Master Password</button>
                <button id="rhAdminTabOtp" onclick="switchAdminAuthTab('otp')" style="flex:1;padding:8px;border:none;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;background:transparent;color:#94a3b8;transition:all 0.2s;">📧 Email Code (OTP)</button>
            </div>

            <!-- TAB 1: MASTER PASSWORD -->
            <form id="rhAdminPasswordForm" onsubmit="submitAdminPasswordLogin(event)" style="display:flex;flex-direction:column;gap:14px;">
                <div>
                    <label style="display:block;font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Admin Master Password</label>
                    <div style="position:relative;">
                        <input type="password" id="rhAdminPasswordInput" placeholder="Enter Admin Master Password" required
                            style="width:100%;box-sizing:border-box;padding:12px 42px 12px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(99,102,241,0.3);border-radius:10px;color:#fff;font-size:0.9rem;outline:none;transition:border-color 0.2s;"
                            onfocus="this.style.borderColor='#818cf8'" onblur="this.style.borderColor='rgba(99,102,241,0.3)'">
                        <button type="button" onclick="toggleAdminPasswordVis()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#94a3b8;font-size:16px;">👁️</button>
                    </div>
                </div>
                <button type="submit" id="rhAdminPasswordSubmitBtn"
                    style="width:100%;padding:12px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;font-weight:700;font-size:0.9rem;border:none;border-radius:12px;cursor:pointer;box-shadow:0 4px 18px rgba(99,102,241,0.4);transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;"
                    onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform=''">
                    <span>Unlock Admin Panel →</span>
                </button>
            </form>

            <!-- TAB 2: EMAIL OTP -->
            <div id="rhAdminOtpContainer" style="display:none;flex-direction:column;gap:14px;">
                <div>
                    <p style="margin:0 0 10px;font-size:0.8rem;color:#94a3b8;line-height:1.5;">Click below to send a 6-digit verification code to <strong style="color:#a5b4fc;">tnesh833@gmail.com</strong>.</p>
                    <button type="button" id="rhAdminRequestOtpBtn" onclick="requestAdminEmailOtp()"
                        style="width:100%;padding:10px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.35);border-radius:10px;color:#a5b4fc;font-weight:700;font-size:0.82rem;cursor:pointer;transition:all 0.2s;"
                        onmouseover="this.style.background='rgba(99,102,241,0.25)'" onmouseout="this.style.background='rgba(99,102,241,0.15)'">
                        📧 Send Verification Code
                    </button>
                </div>
                <div>
                    <label style="display:block;font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">6-Digit Code</label>
                    <input type="text" id="rhAdminOtpInput" maxlength="6" placeholder="• • • • • •"
                        style="width:100%;box-sizing:border-box;padding:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(99,102,241,0.3);border-radius:10px;color:#fff;font-size:1.1rem;font-weight:700;letter-spacing:6px;text-align:center;outline:none;"
                        onfocus="this.style.borderColor='#818cf8'" onblur="this.style.borderColor='rgba(99,102,241,0.3)'">
                </div>
                <button type="button" id="rhAdminOtpSubmitBtn" onclick="submitAdminOtpLogin()"
                    style="width:100%;padding:12px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;font-weight:700;font-size:0.9rem;border:none;border-radius:12px;cursor:pointer;box-shadow:0 4px 18px rgba(99,102,241,0.4);transition:all 0.2s;"
                    onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform=''">
                    Verify Code &amp; Unlock →
                </button>
            </div>
            
            <div style="margin-top:16px;text-align:center;">
                <span style="font-size:0.75rem;color:#64748b;">🔒 Protected by Rank-Holder Administrative Shield</span>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    var pwdInput = document.getElementById("rhAdminPasswordInput");
    if (pwdInput) pwdInput.focus();
};

window.closeAdminAuthModal = function() {
    var modal = document.getElementById("rhAdminAuthModal");
    if (modal) modal.style.display = "none";
};

window.switchAdminAuthTab = function(tab) {
    var tabPwd = document.getElementById("rhAdminTabPassword");
    var tabOtp = document.getElementById("rhAdminTabOtp");
    var formPwd = document.getElementById("rhAdminPasswordForm");
    var formOtp = document.getElementById("rhAdminOtpContainer");
    var err = document.getElementById("rhAdminAuthError");
    var succ = document.getElementById("rhAdminAuthSuccess");
    if (err) err.style.display = "none";
    if (succ) succ.style.display = "none";

    if (tab === "password") {
        if (tabPwd) { tabPwd.style.background = "linear-gradient(135deg,#6366f1,#818cf8)"; tabPwd.style.color = "#fff"; }
        if (tabOtp) { tabOtp.style.background = "transparent"; tabOtp.style.color = "#94a3b8"; }
        if (formPwd) formPwd.style.display = "flex";
        if (formOtp) formOtp.style.display = "none";
        var inp = document.getElementById("rhAdminPasswordInput");
        if (inp) inp.focus();
    } else {
        if (tabOtp) { tabOtp.style.background = "linear-gradient(135deg,#6366f1,#818cf8)"; tabOtp.style.color = "#fff"; }
        if (tabPwd) { tabPwd.style.background = "transparent"; tabPwd.style.color = "#94a3b8"; }
        if (formPwd) formPwd.style.display = "none";
        if (formOtp) formOtp.style.display = "flex";
        var inp = document.getElementById("rhAdminOtpInput");
        if (inp) inp.focus();
    }
};

window.toggleAdminPasswordVis = function() {
    var inp = document.getElementById("rhAdminPasswordInput");
    if (inp) {
        inp.type = inp.type === "password" ? "text" : "password";
    }
};

window.submitAdminPasswordLogin = async function(event) {
    if (event) event.preventDefault();
    var pwdInput = document.getElementById("rhAdminPasswordInput");
    var pwd = pwdInput ? pwdInput.value.trim() : "";
    var btn = document.getElementById("rhAdminPasswordSubmitBtn");
    var err = document.getElementById("rhAdminAuthError");
    var succ = document.getElementById("rhAdminAuthSuccess");

    if (!pwd) {
        if (err) { err.textContent = "Please enter the Admin Master Password."; err.style.display = "block"; }
        return;
    }

    if (err) err.style.display = "none";
    if (succ) succ.style.display = "none";
    if (btn) { btn.textContent = "Verifying..."; btn.disabled = true; }

    try {
        var res = await fetch(_API + "/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "tnesh833@gmail.com", password: pwd })
        });
        var data = await res.json();

        if (data.success && data.token) {
            localStorage.setItem("rh_auth_token", data.token);
            localStorage.setItem("rh_user", JSON.stringify(data.user));
            localStorage.setItem("rh_registered_email", "tnesh833@gmail.com");
            if (succ) { succ.textContent = "✅ Admin access verified! Redirecting to Admin Console..."; succ.style.display = "block"; }
            setTimeout(function() {
                window.location.href = "admin.html";
            }, 500);
        } else {
            if (err) { err.textContent = data.error || "Incorrect Admin password. Please check and retry."; err.style.display = "block"; }
        }
    } catch(e) {
        if (err) { err.textContent = "Network error connecting to backend server."; err.style.display = "block"; }
    } finally {
        if (btn) { btn.textContent = "Unlock Admin Panel →"; btn.disabled = false; }
    }
};

window.requestAdminEmailOtp = async function() {
    var btn = document.getElementById("rhAdminRequestOtpBtn");
    var err = document.getElementById("rhAdminAuthError");
    var succ = document.getElementById("rhAdminAuthSuccess");
    if (err) err.style.display = "none";
    if (succ) succ.style.display = "none";
    if (btn) { btn.textContent = "Sending Code..."; btn.disabled = true; }

    try {
        var res = await fetch(_API + "/auth/login-otp-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "tnesh833@gmail.com", name: "Super Admin" })
        });
        var data = await res.json();
        if (data.success) {
            if (succ) { succ.textContent = "✅ 6-digit verification code sent to tnesh833@gmail.com!"; succ.style.display = "block"; }
            var inp = document.getElementById("rhAdminOtpInput");
            if (inp) inp.focus();
        } else {
            if (err) { err.textContent = data.error || "Failed to send code."; err.style.display = "block"; }
        }
    } catch(e) {
        if (err) { err.textContent = "Network error sending code."; err.style.display = "block"; }
    } finally {
        if (btn) { btn.textContent = "📧 Resend Verification Code"; btn.disabled = false; }
    }
};

window.submitAdminOtpLogin = async function() {
    var otpInput = document.getElementById("rhAdminOtpInput");
    var otp = otpInput ? otpInput.value.trim() : "";
    var btn = document.getElementById("rhAdminOtpSubmitBtn");
    var err = document.getElementById("rhAdminAuthError");
    var succ = document.getElementById("rhAdminAuthSuccess");

    if (!otp || otp.length !== 6) {
        if (err) { err.textContent = "Please enter the full 6-digit verification code."; err.style.display = "block"; }
        return;
    }

    if (err) err.style.display = "none";
    if (succ) succ.style.display = "none";
    if (btn) { btn.textContent = "Verifying Code..."; btn.disabled = true; }

    try {
        var res = await fetch(_API + "/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "tnesh833@gmail.com", otp: otp })
        });
        var data = await res.json();

        if (data.success && data.token) {
            localStorage.setItem("rh_auth_token", data.token);
            localStorage.setItem("rh_user", JSON.stringify(data.user));
            localStorage.setItem("rh_registered_email", "tnesh833@gmail.com");
            if (succ) { succ.textContent = "✅ Verification successful! Opening Admin Console..."; succ.style.display = "block"; }
            setTimeout(function() {
                window.location.href = "admin.html";
            }, 500);
        } else {
            if (err) { err.textContent = data.error || "Invalid or expired verification code."; err.style.display = "block"; }
        }
    } catch(e) {
        if (err) { err.textContent = "Network error verifying code."; err.style.display = "block"; }
    } finally {
        if (btn) { btn.textContent = "Verify Code & Unlock →"; btn.disabled = false; }
    }
};

/* ═══════════════════════════════════════════════════════════════
   SETTINGS PANEL PROFILE LOADER & PHOTO MANAGER
═══════════════════════════════════════════════════════════════ */
window._loadSettingsProfile = function() {
    var nameEl = document.getElementById("settingsProfileName");
    var emailEl = document.getElementById("settingsProfileEmail");
    var photoEl = document.getElementById("settingsProfilePhoto");
    var inputEl = document.getElementById("settingsPhotoUrlInput");
    var statusBadge = document.getElementById("settingsProfileStatusBadge");

    var user = null;
    try {
        user = JSON.parse(localStorage.getItem("rh_user") || localStorage.getItem("rh_auth_user") || "null");
    } catch(e){}

    var savedEmail = localStorage.getItem("rh_registered_email") || "";
    var savedPhoto = localStorage.getItem("rh_user_photo") || (user ? user.photo_url : "");

    if (user && user.name) {
        if (nameEl) nameEl.textContent = user.name;
        if (emailEl) emailEl.textContent = user.email || savedEmail || "Logged In User";
        if (statusBadge) {
            statusBadge.textContent = "Verified Account";
            statusBadge.style.background = "rgba(16,185,129,0.15)";
            statusBadge.style.color = "#10b981";
        }
    } else if (savedEmail) {
        if (nameEl) nameEl.textContent = savedEmail.split("@")[0] || "Registered User";
        if (emailEl) emailEl.textContent = savedEmail;
        if (statusBadge) {
            statusBadge.textContent = "Registered Device";
            statusBadge.style.background = "rgba(99,102,241,0.15)";
            statusBadge.style.color = "#818cf8";
        }
    } else {
        if (nameEl) nameEl.textContent = "Guest User";
        if (emailEl) emailEl.textContent = "Please Register / Log In";
        if (statusBadge) {
            statusBadge.textContent = "Guest";
            statusBadge.style.background = "rgba(148,163,184,0.15)";
            statusBadge.style.color = "#94a3b8";
        }
    }

    if (savedPhoto) {
        if (photoEl) {
            photoEl.src = savedPhoto;
            photoEl.onerror = function() { this.src = "3d_avatar.jpg"; };
        }
        if (inputEl && !inputEl.value) {
            inputEl.value = savedPhoto.startsWith("data:") ? "[File Uploaded]" : savedPhoto;
        }
    }
};

window.saveSettingsProfilePhoto = function(urlOverride) {
    var inputEl = document.getElementById("settingsPhotoUrlInput");
    var rawInput = inputEl ? inputEl.value : "";
    var photoUrl = (urlOverride || rawInput).trim();
    if (photoUrl === "[File Uploaded]") {
        photoUrl = localStorage.getItem("rh_user_photo") || "";
    }
    if (!photoUrl) {
        alert("Please enter or select a valid image file/URL.");
        return;
    }

    localStorage.setItem("rh_user_photo", photoUrl);
    try {
        var user = JSON.parse(localStorage.getItem("rh_user") || localStorage.getItem("rh_auth_user") || "{}");
        user.photo_url = photoUrl;
        localStorage.setItem("rh_user", JSON.stringify(user));
        localStorage.setItem("rh_auth_user", JSON.stringify(user));
    } catch(e){}

    var photoEl = document.getElementById("settingsProfilePhoto");
    if (photoEl) photoEl.src = photoUrl;
    var navPhoto = document.getElementById("navProfilePhoto");
    if (navPhoto) navPhoto.src = photoUrl;
    document.querySelectorAll(".logo-3d-avatar").forEach(function(img){ img.src = photoUrl; });

    alert("Profile photo updated successfully!");
};

window.handleSettingsPhotoUpload = function(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var dataUrl = e.target.result;
        saveSettingsProfilePhoto(dataUrl);
    };
    reader.readAsDataURL(file);
};

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK BOX SYSTEM
═══════════════════════════════════════════════════════════════ */
window.openFeedbackModal = function() {
    var modal = document.getElementById("rhFeedbackModal");
    if (modal) { modal.style.display = "flex"; return; }
    
    var user = null;
    try { user = JSON.parse(localStorage.getItem("rh_user") || "{}"); } catch(e){}
    var defaultName = (user && user.name) ? user.name : "";
    var defaultEmail = (user && user.email) ? user.email : (localStorage.getItem("rh_registered_email") || "");

    var div = document.createElement("div");
    div.id = "rhFeedbackModal";
    div.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(8px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px;";
    div.innerHTML = `
        <div style="background:var(--bg-surface, #0d1130); border:1px solid rgba(99,102,241,0.3); border-radius:18px; padding:28px; width:100%; max-width:440px; box-shadow:0 20px 60px rgba(0,0,0,0.6); position:relative; color:var(--text-primary, #fff);">
            <button onclick="closeFeedbackModal()" style="position:absolute; top:16px; right:16px; background:none; border:none; color:var(--text-muted, #94a3b8); font-size:1.3rem; cursor:pointer;">✕</button>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                <span style="font-size:1.5rem;">💬</span>
                <h3 style="margin:0; font-size:1.2rem; background:linear-gradient(135deg,#a5b4fc,#818cf8); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Share Your Feedback</h3>
            </div>
            <p style="font-size:0.8rem; color:var(--text-secondary, #94a3b8); margin-bottom:18px; margin-top:4px;">
                Your feedback will automatically be emailed directly to the Admin at <strong style="color:var(--brand-primary, #818cf8);">tnesh833@gmail.com</strong>.
            </p>
            <form id="rhFeedbackForm" onsubmit="submitRhFeedback(event)">
                <div id="rhFeedbackStatus" style="display:none; padding:10px; border-radius:8px; font-size:0.82rem; margin-bottom:12px;"></div>
                
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:var(--text-secondary, #94a3b8);">Your Name</label>
                    <input type="text" id="fbName" value="${defaultName}" placeholder="e.g. Alex Smith" required style="width:100%; padding:10px; border-radius:8px; border:1px solid rgba(99,102,241,0.25); background:var(--bg-body, #05081a); color:var(--text-primary, #fff); font-size:0.9rem; box-sizing:border-box;">
                </div>
                
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:var(--text-secondary, #94a3b8);">Your Email</label>
                    <input type="email" id="fbEmail" value="${defaultEmail}" placeholder="alex@example.com" required style="width:100%; padding:10px; border-radius:8px; border:1px solid rgba(99,102,241,0.25); background:var(--bg-body, #05081a); color:var(--text-primary, #fff); font-size:0.9rem; box-sizing:border-box;">
                </div>

                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:var(--text-secondary, #94a3b8);">Rating</label>
                    <select id="fbRating" style="width:100%; padding:10px; border-radius:8px; border:1px solid rgba(99,102,241,0.25); background:var(--bg-body, #05081a); color:var(--text-primary, #fff); font-size:0.9rem; box-sizing:border-box;">
                        <option value="5">⭐⭐⭐⭐⭐ 5 - Excellent</option>
                        <option value="4">⭐⭐⭐⭐ 4 - Good</option>
                        <option value="3">⭐⭐⭐ 3 - Average</option>
                        <option value="2">⭐⭐ 2 - Needs Improvement</option>
                        <option value="1">⭐ 1 - Poor</option>
                    </select>
                </div>

                <div style="margin-bottom:18px;">
                    <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:var(--text-secondary, #94a3b8);">Feedback Message</label>
                    <textarea id="fbMessage" rows="4" placeholder="Write your thoughts, ideas, or feedback here..." required style="width:100%; padding:10px; border-radius:8px; border:1px solid rgba(99,102,241,0.25); background:var(--bg-body, #05081a); color:var(--text-primary, #fff); font-size:0.9rem; resize:vertical; box-sizing:border-box;"></textarea>
                </div>

                <button type="submit" id="fbSubmitBtn" style="width:100%; padding:12px; border-radius:10px; border:none; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; font-weight:700; font-size:0.95rem; cursor:pointer; box-shadow:0 4px 18px rgba(99,102,241,0.4);">
                    Submit Feedback →
                </button>
            </form>
        </div>
    `;
    document.body.appendChild(div);
};

window.closeFeedbackModal = function() {
    var modal = document.getElementById("rhFeedbackModal");
    if (modal) modal.style.display = "none";
};

window.submitRhFeedback = async function(e) {
    e.preventDefault();
    var btn = document.getElementById("fbSubmitBtn");
    var status = document.getElementById("rhFeedbackStatus");
    var name = document.getElementById("fbName").value.trim();
    var email = document.getElementById("fbEmail").value.trim();
    var rating = document.getElementById("fbRating").value;
    var message = document.getElementById("fbMessage").value.trim();

    btn.disabled = true;
    btn.textContent = "Sending Email to Admin...";
    status.style.display = "none";

    try {
        var res = await fetch(_API + "/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, email: email, rating: rating, message: message })
        });
        var data = await res.json();
        if (res.ok && data.success) {
            status.className = "";
            status.style.background = "rgba(16,185,129,0.15)";
            status.style.border = "1px solid #10b981";
            status.style.color = "#10b981";
            status.style.display = "block";
            status.innerHTML = "✅ " + data.message;
            document.getElementById("fbMessage").value = "";
            setTimeout(function(){ closeFeedbackModal(); }, 2500);
        } else {
            throw new Error(data.error || "Failed to send feedback");
        }
    } catch(err) {
        status.style.background = "rgba(244,63,94,0.15)";
        status.style.border = "1px solid #f43f5e";
        status.style.color = "#f43f5e";
        status.style.display = "block";
        status.textContent = "❌ " + err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = "Submit Feedback →";
    }
};

function _injectFloatingFeedbackBtn() {
    if (document.getElementById("rhFloatingFeedbackBtn")) return;
    var btn = document.createElement("button");
    btn.id = "rhFloatingFeedbackBtn";
    btn.onclick = window.openFeedbackModal;
    btn.style.cssText = "position:fixed; bottom:24px; right:24px; z-index:9990; padding:10px 18px; border-radius:30px; border:1px solid rgba(99,102,241,0.4); background:linear-gradient(135deg, #6366f1, #4f46e5); color:#fff; font-weight:700; font-size:0.85rem; cursor:pointer; box-shadow:0 6px 20px rgba(99,102,241,0.4); display:flex; align-items:center; gap:8px; transition:transform 0.2s, box-shadow 0.2s;";
    btn.innerHTML = "<span>💬</span><span>Feedback</span>";
    btn.onmouseover = function(){ this.style.transform="scale(1.05)"; };
    btn.onmouseout = function(){ this.style.transform="scale(1)"; };
    document.body.appendChild(btn);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _injectFloatingFeedbackBtn);
} else {
    _injectFloatingFeedbackBtn();
}
