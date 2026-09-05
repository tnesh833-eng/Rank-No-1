/**
 * Integrations & External Web Services for Rank-Holder Platform
 */

/* ============================================================
   GEMINI AI — Direct REST API (gemini-2.0-flash, fast output)
   ============================================================ */
const GeminiAI = {
    API_KEY: "AIzaSyAb8RN6LV6558aOq_ueaYV30op6scfx1IXnz6OHcgadg2OZWNHw",
    MODELS: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
    BASE_URL: "https://generativelanguage.googleapis.com/v1beta/models",

    /**
     * Generate content using Gemini REST API with automatic model fallback.
     * @param {string} prompt - The prompt text
     * @param {object} options - { temperature, maxTokens }
     * @returns {Promise<string>} - Generated text
     */
    generate: async function(prompt, options = {}) {
        const { temperature = 0.75, maxTokens = 2048 } = options;
        let lastError = null;

        for (const model of this.MODELS) {
            try {
                const url = `${this.BASE_URL}/${model}:generateContent?key=${this.API_KEY}`;
                const payload = {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature,
                        maxOutputTokens: maxTokens,
                        topP: 0.9
                    }
                };
                const resp = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!resp.ok) {
                    const errText = await resp.text();
                    lastError = `${model}: HTTP ${resp.status} — ${errText.slice(0, 200)}`;
                    continue;
                }
                const data = await resp.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (text.trim()) return text.trim();
                lastError = `${model}: empty response`;
            } catch (e) {
                lastError = `${model}: ${e.message}`;
            }
        }
        console.error("[GeminiAI] All models failed:", lastError);
        throw new Error(lastError || "Gemini generation failed");
    },

    /**
     * Generate and parse a JSON response.
     * @param {string} prompt
     * @param {object} options
     * @returns {Promise<object>}
     */
    generateJSON: async function(prompt, options = {}) {
        const jsonPrompt = prompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown code blocks. No extra text before or after.";
        const text = await this.generate(jsonPrompt, options);
        // Strip markdown wrappers if present
        const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/g, "").trim();
        return JSON.parse(cleaned);
    }
};

window.GeminiAI = GeminiAI;

/* ============================================================
   INTEGRATIONS — Wikipedia, PDF, Search Links
   ============================================================ */
const Integrations = {
    // Dynamic Two-Stage Wikipedia API Fetcher (Search -> Top Match REST Summary)
    fetchWikipediaSummary: async function(query) {
        if (!query || !query.trim()) return null;
        const cleanQuery = query.replace(/[_-]/g, ' ').replace(/\.(png|jpg|jpeg|webp|gif|mp4|dicom)$/i, '').trim();

        try {
            const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&format=json&origin=*`;
            const searchRes = await fetch(searchUrl);
            if (!searchRes.ok) throw new Error("Wikipedia search API error");
            const searchData = await searchRes.json();

            let targetTitle = cleanQuery;
            if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
                targetTitle = searchData.query.search[0].title;
            }

            const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(targetTitle)}`;
            const summaryRes = await fetch(summaryUrl);
            if (!summaryRes.ok) {
                const altUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery)}`;
                const altRes = await fetch(altUrl);
                if (!altRes.ok) return null;
                const altData = await altRes.json();
                return {
                    title: altData.title || cleanQuery,
                    extract: altData.extract || "Full historical background available on Wikipedia.",
                    thumbnail: altData.thumbnail ? altData.thumbnail.source : null,
                    pageUrl: altData.content_urls ? altData.content_urls.desktop.page : `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanQuery)}`
                };
            }

            const data = await summaryRes.json();
            return {
                title: data.title || targetTitle,
                extract: data.extract || "Full detailed technical summary retrieved from Wikipedia.",
                thumbnail: data.thumbnail ? data.thumbnail.source : null,
                description: data.description || "Wikipedia Knowledge Base Entry",
                pageUrl: data.content_urls ? data.content_urls.desktop.page : `https://en.wikipedia.org/wiki/${encodeURIComponent(targetTitle)}`
            };
        } catch (e) {
            console.warn("[Wikipedia Search Warning]:", e);
            return null;
        }
    },

    // Export PDF Report using jsPDF
    exportPdfReport: function(title, subtitle, contentLines, filename = "Rank_Holder_Report.pdf") {
        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, 210, 30, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.text("RANK-HOLDER PORTAL REPORT", 14, 18);
            doc.setFontSize(10);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(14);
            doc.text(title, 14, 42);
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(subtitle, 14, 48);
            doc.setDrawColor(226, 232, 240);
            doc.line(14, 52, 196, 52);
            doc.setTextColor(51, 65, 85);
            doc.setFontSize(10);
            let y = 62;

            contentLines.forEach(line => {
                if (y > 270) { doc.addPage(); y = 20; }
                const splitText = doc.splitTextToSize(line, 180);
                doc.text(splitText, 14, y);
                y += (splitText.length * 6) + 4;
            });

            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text("Rank-Holder English Communication & Career Growth Portal — Verified Export", 14, 285);
            doc.save(filename);
        } else {
            alert(`Report Generated:\n\n${title}\n${subtitle}\n\n${contentLines.join('\n')}`);
        }
    },

    // Comprehensive Platform Suite Search Links
    generateSearchLinks: function(query) {
        const q = encodeURIComponent(query);
        return {
            google: `https://www.google.com/search?q=${q}`,
            googleLens: `https://lens.google.com`,
            linkedIn: `https://www.linkedin.com/search/results/all/?keywords=${q}`,
            facebook: `https://www.facebook.com/search/top?q=${q}`,
            reddit: `https://www.reddit.com/search/?q=${q}`,
            x: `https://x.com/search?q=${q}`,
            wikipedia: `https://en.wikipedia.org/wiki/Special:Search?search=${q}`,
            pubMed: `https://pubmed.ncbi.nlm.nih.gov/?term=${q}`,
            scholar: `https://scholar.google.com/scholar?q=${q}`,
            youtube: `https://www.youtube.com/results?search_query=${q}+tutorial`,
            gitHub: `https://github.com/search?q=${q}`,
            stackOverflow: `https://stackoverflow.com/search?q=${q}`,
            chatGPT: `https://chat.openai.com`,
            gemini: `https://gemini.google.com`,
            claude: `https://claude.ai`,
            copilot: `https://copilot.microsoft.com`,
            perplexity: `https://www.perplexity.ai`,
            naukri: `https://www.naukri.com/${q}-jobs`,
            internshala: `https://internshala.com/internships/keywords-${q}`,
            leetcode: `https://leetcode.com/problemset/all/?search=${q}`
        };
    }
};

window.Integrations = Integrations;
