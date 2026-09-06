/**
 * Backend API Client for Rank-Holder Platform
 * Connects Frontend to Python Flask SQLite Backend at http://127.0.0.1:5000/api
 */

const API_BASE_URL = window.location.protocol === "file:" ? "http://127.0.0.1:5000/api" : "/api";

const Backend = {
    // Get stored session token
    getToken: function() {
        return localStorage.getItem("rh_auth_token") || "";
    },

    // Generic Helper — now includes Authorization header
    request: async function(endpoint, method = "GET", body = null) {
        const options = {
            method: method,
            headers: {
                "Content-Type": "application/json"
            }
        };
        // Attach auth token if available
        const token = this.getToken();
        if (token) {
            options.headers["Authorization"] = `Bearer ${token}`;
        }
        if (body) {
            options.body = JSON.stringify(body);
        }
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                // If auth required, signal to frontend
                if (response.status === 401 && errorData.auth_required) {
                    window.dispatchEvent(new CustomEvent("auth-required"));
                }
                // If user is blocked, force logout
                if (response.status === 403 && errorData.is_blocked) {
                    localStorage.removeItem("rh_auth_token");
                    localStorage.removeItem("rh_auth_user");
                    localStorage.removeItem("rh_user");
                    alert("🔒 Your account has been completely blocked by the Administrator.\nAccess Denied.");
                    window.location.href = "login.html";
                }
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.warn(`[Backend] ${method} ${endpoint}:`, error.message);
            // Return error object for auth routes so UI can show proper messages
            if (endpoint.startsWith('/auth/')) return { success: false, error: error.message };
            return null; // Return null for other routes so caller can fallback to local state
        }
    },

    // Healthcheck
    checkHealth: async function() {
        return await this.request("/health");
    },

    // --- Authentication Module ---
    Auth: {
        // REGISTER: Step 1 — Send user details to backend, triggers OTP email
        register: async function(name, phone, email, password) {
            return await Backend.request("/auth/register", "POST", { name, phone, email, password });
        },

        // REGISTER: Step 2 — Verify the OTP code received via email during registration
        verifyRegister: async function(email, otp) {
            return await Backend.request("/auth/verify-register", "POST", { email, otp });
        },

        // RESEND OTP: Re-send a fresh 6-digit code to the user's email
        resendOTP: async function(email, purpose = "verification") {
            return await Backend.request("/auth/resend-otp", "POST", { email, purpose });
        },

        // Update user profile info (phone, enrolled courses)
        updateProfile: async function(phone, courses) {
            return await Backend.request("/auth/profile", "POST", { phone, courses });
        },

        // LOGIN: Step 1 — Send OTP code to user's registered email for login
        // For new users: name and photo_url are used to auto-create their account
        requestLoginOTP: async function(email, name = "", photo_url = "") {
            return await Backend.request("/auth/login-otp-request", "POST", { email, name, photo_url });
        },

        // LOGIN: Step 2 — Verify OTP code or password and receive session token on success
        // Saves token + user info in localStorage for persistent session
        login: async function(email, otp = "", password = "") {
            const payload = { email };
            if (otp) payload.otp = otp;
            if (password) payload.password = password;
            const res = await Backend.request("/auth/login", "POST", payload);
            if (res && res.success && res.token) {
                localStorage.setItem("rh_auth_token", res.token);     // Store session token
                localStorage.setItem("rh_user", JSON.stringify(res.user)); // Store user info
                localStorage.setItem("rh_registered_email", (res.user && res.user.email) ? res.user.email.toLowerCase() : email.toLowerCase());
            }
            return res;
        },

        // Dedicated Admin Login
        adminLogin: async function(password = "", otp = "") {
            const payload = { email: "tnesh833@gmail.com" };
            if (password) payload.password = password;
            if (otp) payload.otp = otp;
            const res = await Backend.request("/admin/login", "POST", payload);
            if (res && res.success && res.token) {
                localStorage.setItem("rh_auth_token", res.token);
                localStorage.setItem("rh_user", JSON.stringify(res.user));
                localStorage.setItem("rh_registered_email", "tnesh833@gmail.com");
            }
            return res;
        },

        // Check if currently authenticated as admin
        checkIsAdmin: async function() {
            const token = this.getToken();
            if (!token) return false;
            try {
                const res = await fetch(`${API_BASE_URL}/auth/is-admin`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.is_admin === true;
                }
            } catch (e) {}
            return false;
        },

        // LOGIN: Step 2 — Verify the code sent by login-otp-request/login
        verifyLogin: async function(email, otp) {
            const res = await Backend.request("/auth/verify-login", "POST", { email, otp });
            if (res && res.success && res.token) {
                localStorage.setItem("rh_auth_token", res.token);
                localStorage.setItem("rh_user", JSON.stringify(res.user));
                localStorage.setItem("rh_registered_email", (res.user && res.user.email) ? res.user.email.toLowerCase() : email.toLowerCase());
            }
            return res;
        },

        // Fetch current logged-in user's info from the server
        getMe: async function() {
            return await Backend.request("/auth/me");
        },

        // Logout: invalidate server session token and clear localStorage
        logout: async function() {
            await Backend.request("/auth/logout", "POST");
            localStorage.removeItem("rh_auth_token");
            localStorage.removeItem("rh_auth_user");
            localStorage.removeItem("rh_user");
        },

        // Check if user is currently logged in (token exists in localStorage)
        isLoggedIn: function() {
            return !!localStorage.getItem("rh_auth_token");
        },

        // Get the stored user object from localStorage (no server call needed)
        getStoredUser: function() {
            const u = localStorage.getItem("rh_user") || localStorage.getItem("rh_auth_user");
            return u ? JSON.parse(u) : null;
        },
        getAuthToken: function() {
            return localStorage.getItem("rh_auth_token") || "";
        },
        getToken: function() {
            return localStorage.getItem("rh_auth_token") || "";
        }
    },

    // Admin Module
    AdminCustomers: {
        fetchCustomers: async function() {
            const res = await Backend.request("/admin/customers");
            return res ? res.customers : [];
        },
        updateStatus: async function(id, status) {
            return await Backend.request(`/admin/customers/${id}/status`, "POST", { status });
        }
    },

    // Feedback Module
    Feedback: {
        sendFeedback: async function(name, email, rating, message) {
            return await Backend.request("/feedback", "POST", { name, email, rating, message });
        }
    },

    // Admin Feedbacks Module
    AdminFeedbacks: {
        fetchFeedbacks: async function() {
            const res = await Backend.request("/admin/feedbacks");
            return res ? (res.feedbacks || []) : [];
        },
        deleteFeedback: async function(id) {
            return await Backend.request(`/admin/feedbacks/${id}`, "DELETE");
        }
    },

    // 1. Account & User Settings
    Settings: {
        getSettings: async function() {
            const res = await Backend.request("/settings");
            if (res) return res;
            // Fallback from localStorage
            const local = localStorage.getItem("rh_settings");
            return local ? JSON.parse(local) : {
                name: "Rank Holder",
                email: "gokulsharmila82@gmail.com",
                mobile: "+91 8610017559",
                theme: "dark",
                ai_mode: "builtin",
                comm_mode: "friendly"
            };
        },
        updateSettings: async function(settingsData) {
            const res = await Backend.request("/settings", "POST", settingsData);
            localStorage.setItem("rh_settings", JSON.stringify(settingsData));
            return res || settingsData;
        }
    },

    // 2. LinkedIn Outreach Prospects
    Prospects: {
        fetchProspects: async function() {
            const res = await Backend.request("/prospects");
            if (res && res.prospects) return res;
            // Fallback
            const local = localStorage.getItem("rh_prospects");
            return { prospects: local ? JSON.parse(local) : [] };
        },
        addProspect: async function(prospectData) {
            const res = await Backend.request("/prospects", "POST", prospectData);
            if (!res) {
                // Local fallback save
                const local = localStorage.getItem("rh_prospects");
                const prospects = local ? JSON.parse(local) : [];
                prospects.unshift(prospectData);
                localStorage.setItem("rh_prospects", JSON.stringify(prospects));
                return prospectData;
            }
            return res;
        },
        deleteProspect: async function(id) {
            return await Backend.request(`/prospects/${id}`, "DELETE");
        }
    },

    // 3. Career Jobs
    Jobs: {
        fetchJobs: async function() {
            const res = await Backend.request("/jobs");
            if (res && res.jobs) return res;
            // Fallback static job feed
            return {
                jobs: [
                    { id: 1, title: "Associate Software Engineer", company: "Google India", location: "Bengaluru", type: "Full-time", experience: "0-2 Yrs", salary: "₹18-24 LPA", skills: "Python, C++, DSA", link: "https://careers.google.com", badge: "MNC Tech Giant" },
                    { id: 2, title: "Frontend Developer Intern", company: "Zoho Corporation", location: "Chennai", type: "Internship", experience: "Fresher", salary: "₹4-6 LPA", skills: "HTML, CSS, JS", link: "https://www.zoho.com/careers/", badge: "Chennai Hub" },
                    { id: 3, title: "Data Analyst Trainee", company: "TCS Digital", location: "Chennai / Pan India", type: "Full-time", experience: "Fresher", salary: "₹7.5 LPA", skills: "SQL, Python, Analytics", link: "https://www.tcs.com/careers", badge: "Digital Hiring" },
                    { id: 4, title: "AI Research Engineer", company: "Nvidia", location: "Bengaluru", type: "Full-time", experience: "0-3 Yrs", salary: "₹22-30 LPA", skills: "PyTorch, CUDA", link: "https://www.nvidia.com/en-in/about-nvidia/careers/", badge: "AI Pioneer" }
                ]
            };
        },
        addJob: async function(jobData) {
            return await Backend.request("/jobs", "POST", jobData);
        },
        deleteJob: async function(id) {
            return await Backend.request(`/jobs/${id}`, "DELETE");
        }
    },

    // 4. Notifications
    Notifications: {
        fetchNotifications: async function() {
            const res = await Backend.request("/notifications");
            if (res && res.notifications) return res;
            return {
                notifications: [
                    { id: 1, title: "Hired Job Alert", message: "Congratulations! You have been hired as an Associate Software Engineer at Google India.", category: "job" },
                    { id: 2, title: "Interview Scheduled", message: "Your technical interview with Zoho Corporation is scheduled for 28th August at 10:00 AM.", category: "job" },
                    { id: 3, title: "Freelance Project Match", message: "A new freelance web development project matching your skills is available.", category: "job" },
                    { id: 4, title: "System Update", message: "New AI practice modules are now available for your English fluency score.", category: "system" }
                ]
            };
        },
        clearNotifications: async function() {
            return await Backend.request("/notifications/clear", "POST");
        }
    },

    // 5. AI Chat Endpoint
    AIChat: {
        sendMessage: async function(message, mode, topic) {
            const res = await Backend.request("/ai/chat", "POST", { message, mode, topic });
            if (res) return res;
            // Local fallback simulation
            return {
                reply: `Partner [Local Mode]: Excellent point on "${message}". Keep up your clarity and steady speaking rhythm!`,
                corrections: [],
                mode: mode,
                fluency_boost: 5
            };
        }
    },

    // 6. Biomedical Analyzer Endpoint
    Biomedical: {
        analyzeMedia: async function(filename, type) {
            const res = await Backend.request("/biomedical/analyze", "POST", { filename, type });
            if (res) return res;
            return {
                status: "Success",
                diagnostic_class: "Biomedical Tissue Analysis",
                metrics: "Structural Density: 95% | Matrix Clarity: High",
                summary: "Scanned media frame displays clear structural attributes without critical anomaly signatures.",
                wiki_topic: "Medical Imaging",
                pubmed_url: "https://pubmed.ncbi.nlm.nih.gov"
            };
        }
    },

    // 7. Project Blueprint Endpoint
    Projects: {
        getBlueprint: async function(topic, category) {
            const res = await Backend.request("/projects/blueprint", "POST", { topic, category });
            if (res) return res;
            return {
                topic: topic,
                category: category,
                idea: `A custom ${category.lower()} solution implementing ${topic}.`,
                tools: ["Python / C++", "Microcontroller", "SQLite", "REST API"],
                steps: ["1. Requirements", "2. Architecture", "3. Implementation", "4. Deployment"],
                roadmap: "4-Week Rapid Build Guide",
                details: ["Production ready design", "Open source workflow"]
            };
        }
    },

    // 8. Game Scores
    GameScores: {
        getScores: async function() {
            const res = await Backend.request("/games/scores");
            return res ? res.scores : {};
        },
        updateScore: async function(game_name, score) {
            return await Backend.request("/games/scores", "POST", { game_name, score });
        }
    },

    KnowledgeLab: {
        getProgress: async function() {
            const res = await Backend.request("/knowledge/progress");
            return res ? res.state : null;
        },
        saveProgress: async function(state) {
            return await Backend.request("/knowledge/progress", "PUT", state);
        }
    },

    StoryDark: {
        getSearches: async function() {
            const res = await Backend.request("/story/searches");
            return res ? res.searches : [];
        },
        saveSearch: async function(search) {
            return await Backend.request("/story/searches", "POST", search);
        }
    },

    // 9. Grow Up — AI Interactive Learning Roadmap
    GrowUp: {
        getScores: async function() {
            const res = await Backend.request("/growup/scores");
            return res && res.scores ? res.scores : [];
        },
        saveScore: async function(scoreData) {
            return await Backend.request("/growup/scores", "POST", scoreData);
        },
        getLesson: async function(topic, mode = "deep_lecture", question = "") {
            return await Backend.request("/growup/teach", "POST", { topic, mode, question });
        },
    },

    // 10. Corporate Readiness Endpoint
    Corporate: {
        gdChat: async function(topic, user_message) {
            return await Backend.request("/corporate/gd", "POST", { topic, user_message });
        },
        hrChat: async function(question_context, user_answer) {
            return await Backend.request("/corporate/hr", "POST", { question_context, user_answer });
        },
        publicSpeakingScore: async function(topic, user_speech) {
            return await Backend.request("/corporate/public_speaking", "POST", { topic, user_speech });
        }
    }
};

window.Backend = Backend;
