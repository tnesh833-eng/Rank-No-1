/**
 * Crypto & Session Utilities for Rank-Holder Platform
 */

const CryptoUtils = {
    // Session API Key Management (Memory only)
    _apiKey: "",

    setApiKey: function(key) {
        this._apiKey = (key || "").trim();
    },

    getApiKey: function() {
        return this._apiKey;
    },

    hasApiKey: function() {
        return this._apiKey.length > 0;
    },

    // Utility for simple hash generation
    simpleHash: function(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0;
        }
        return Math.abs(hash).toString(16);
    },

    // Format relative timestamp
    formatTimestamp: function(dateStr) {
        if (!dateStr) return "Just now";
        const date = new Date(dateStr);
        const now = new Date();
        const diffSec = Math.floor((now - date) / 1000);
        if (diffSec < 60) return "Just now";
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        return date.toLocaleDateString();
    }
};

window.CryptoUtils = CryptoUtils;
