/* ==========================================================================
   TEACHER ATTENDANCE MANAGEMENT SYSTEM - FRONTEND APP ENGINE
   ========================================================================== */

// Global State Instance
const AppState = {
    teachers: [],
    attendance: [],
    users: [],
    currentUser: null,
    settings: {
        schoolName: "sihamoni high school",
        googleSheetUrl: "https://script.google.com/macros/s/AKfycbyW_28Ik_oDScL9v08OQWH2b8sgQqI0yCbuXhM9FNqNLXyaoD1KBkV0zTRxcx-d8HwLWQ/exec",
        workdays: {
            mon: true,
            tue: true,
            wed: true,
            thu: true,
            fri: true,
            sat: false,
            sun: false
        },
        morningStart: "06:30",
        morningLate: "07:30",
        afternoonStart: "12:30",
        afternoonLate: "13:30"
    },
    scanner: null,
    isCameraRunning: false,
    charts: {}
};

// Central Google Sheets Connection Web App URL (Hardcoded fallback)
const DEFAULT_GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbxWGXkAng04n7D7Sr1sfpJZ3DZpsII7-ozBS-bg-7Zh0afq7sMatXsaqdy2zavSd5xw/exec";

// Dynamic Getter for Google Sheet URL (from Settings or Fallback)
function getGoogleSheetUrl() {
    return (AppState.settings && AppState.settings.googleSheetUrl) ? AppState.settings.googleSheetUrl.trim() : DEFAULT_GOOGLE_SHEET_URL;
}

// HTML5 QR Code Configuration
const scannerConfig = {
    fps: 15,
    qrbox: function (width, height) {
        const size = Math.min(width, height) * 0.6;
        return { width: size, height: size };
    },
    aspectRatio: 1.333334
};

// Helper Constants
const KHMER_NUMBERS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
const KHMER_DAYS = ['អាទិត្យ', 'ចន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
const KHMER_MONTHS = [
    'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
    'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'
];

/* ==========================================================================
   INITIALIZATION & SEED DATA
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    initDatabase();
    initClock();
    initTheme();
    initReportYearSelector();

    checkSessionState();

    // Auto-fetch Google Sheets on startup in background
    const sheetUrl = getGoogleSheetUrl();
    if (sheetUrl && sheetUrl.includes("script.google.com")) {
        syncDownloadFromGoogleSheets();
    }

    // Attach Event Listeners
    setupEventListeners();

    // Start periodic background auto-sync from Google Sheets for multi-device sync
    startBackgroundSync();
});

// Load DB from LocalStorage
function initDatabase() {
    // 1. Settings
    const storedSettings = localStorage.getItem("att_settings");
    if (storedSettings) {
        try {
            const parsed = JSON.parse(storedSettings);
            if (parsed && typeof parsed === "object") {
                // Merge defensively, ignoring empty strings to prevent overwriting default configs
                for (const key in AppState.settings) {
                    if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== "") {
                        AppState.settings[key] = parsed[key];
                    }
                }
                if (parsed.workdays && typeof parsed.workdays === "object") {
                    AppState.settings.workdays = {
                        ...AppState.settings.workdays,
                        ...parsed.workdays
                    };
                }
            }
        } catch (e) {
            console.error("Failed to parse local settings, keeping defaults:", e);
        }
    } else {
        localStorage.setItem("att_settings", JSON.stringify(AppState.settings));
    }

    // 2. Users (Authentication Database)
    const storedUsers = localStorage.getItem("att_users");
    if (storedUsers) {
        AppState.users = JSON.parse(storedUsers);
    } else {
        // Seed default login profiles
        AppState.users = [
            { username: "admin", password: "admin", displayName: "អ្នកគ្រប់គ្រងប្រព័ន្ធ", role: "admin" },
            { username: "staff", password: "staff", displayName: "បុគ្គលិកចុះវត្តមាន", role: "staff" }
        ];
        localStorage.setItem("att_users", JSON.stringify(AppState.users));
    }

    // 3. Teachers
    const storedTeachers = localStorage.getItem("att_teachers");
    if (storedTeachers) {
        AppState.teachers = JSON.parse(storedTeachers);
    } else {
        // Seed initial teacher profiles
        AppState.teachers = [
            { id: "TEA001", name: "សុខ សាន", gender: "ប្រុស", phone: "012345678", subject: "គណិតវិទ្យា ថ្នាក់ទី១២", position: "គ្រូបង្រៀន", status: "active" },
            { id: "TEA002", name: "ចាន់ ធីតា", gender: "ស្រី", phone: "098765432", subject: "អក្សរសាស្ត្រខ្មែរ", position: "គ្រូបន្ទុកថ្នាក់", status: "active" },
            { id: "TEA003", name: "លី ម៉េងហួរ", gender: "ប្រុស", phone: "077889900", subject: "រូបវិទ្យា", position: "គ្រូបង្រៀន", status: "active" }
        ];
        localStorage.setItem("att_teachers", JSON.stringify(AppState.teachers));
    }

    // 4. Attendance logs
    const storedAttendance = localStorage.getItem("att_attendance");
    if (storedAttendance) {
        AppState.attendance = JSON.parse(storedAttendance).map(log => ({
            ...log,
            date: normalizeDateStr(log.date)
        }));
    } else {
        AppState.attendance = seedSampleAttendance();
        localStorage.setItem("att_attendance", JSON.stringify(AppState.attendance));
    }

    // Update School UI Label
    document.getElementById("school-name-display").textContent = AppState.settings.schoolName;
    document.getElementById("login-school-display").textContent = AppState.settings.schoolName;

}

// Generate sample attendance records for statistics
function seedSampleAttendance() {
    const logs = [];
    const teachers = ["TEA001", "TEA002", "TEA003"];
    const today = new Date();

    for (let i = 0; i < 8; i++) {
        const targetDate = new Date();
        targetDate.setDate(today.getDate() - i);

        const dayOfWeek = targetDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip Sat & Sun

        const dateStr = formatDateISO(targetDate);

        teachers.forEach(tId => {
            let status = "វត្តមាន";
            let time = "07:15:00";
            let remark = "";

            if (i === 1 && tId === "TEA002") {
                status = "យឺត";
                time = "07:42:00";
                remark = "យឺតដោយសារបែកកង់";
            }
            if (i === 2 && tId === "TEA003") {
                status = "ច្បាប់";
                time = "";
                remark = "សុំច្បាប់សម្រាកព្យាបាលជំងឺ";
            }
            if (i === 4 && tId === "TEA003") {
                return;
            }

            // Morning shift
            logs.push({
                id: `seed-m-${tId}-${i}`,
                teacherId: tId,
                date: dateStr,
                time: status === "ច្បាប់" ? "" : time,
                session: "morning",
                status: status,
                method: status === "ច្បាប់" ? "Manual" : "QR Scanner",
                remark: remark
            });

            // Afternoon shift
            if (tId !== "TEA003" || i !== 2) {
                logs.push({
                    id: `seed-a-${tId}-${i}`,
                    teacherId: tId,
                    date: dateStr,
                    time: "13:10:00",
                    session: "afternoon",
                    status: "វត្តមាន",
                    method: "QR Scanner",
                    remark: ""
                });
            }
        });
    }
    return logs;
}

/* ==========================================================================
   AUTHENTICATION & SESSION GATEWAY
   ========================================================================== */
function checkSessionState() {
    const sessionUser = localStorage.getItem("att_session");

    if (sessionUser) {
        // Authenticated Session
        AppState.currentUser = JSON.parse(sessionUser);

        // Remove logged-out look, append role class
        document.body.className = `logged-in role-${AppState.currentUser.role}`;

        // Fill User Profile Widget
        document.getElementById("user-display-name").textContent = AppState.currentUser.displayName;

        const badge = document.getElementById("user-role-badge");
        if (AppState.currentUser.role === "admin") {
            badge.textContent = "អ្នកគ្រប់គ្រង";
            badge.className = "badge badge-present";
        } else {
            badge.textContent = "បុគ្គលិក";
            badge.className = "badge badge-excused";
        }

        // Initialize Router
        initRouter();

        // Load default layout tabs
        document.querySelector(".menu-item[data-tab='dashboard']").click();

    } else {
        // Logged Out Session
        AppState.currentUser = null;
        document.body.className = "logged-out";

        // Stop camera if running
        if (AppState.isCameraRunning) {
            stopQRScanner();
        }
    }
}

function processLogin(username, password) {
    const user = AppState.users.find(u => u.username.toLowerCase() === username.toLowerCase().trim() && u.password === password);

    if (user) {
        localStorage.setItem("att_session", JSON.stringify(user));

        Swal.fire({
            title: "ចូលប្រព័ន្ធជោគជ័យ!",
            text: `សូមស្វាគមន៍មកកាន់ប្រព័ន្ធ, ${user.displayName}`,
            icon: "success",
            timer: 1500,
            showConfirmButton: false
        }).then(() => {
            checkSessionState();
        });
    } else {
        Swal.fire({
            title: "ព័ត៌មានគណនីមិនត្រឹមត្រូវ!",
            text: "ឈ្មោះគណនី ឬ លេខកូដសម្ងាត់មិនត្រឹមត្រូវឡើយ។",
            icon: "error",
            confirmButtonText: "ព្យាយាមម្តងទៀត"
        });
    }
}

function processLogout() {
    Swal.fire({
        title: "តើអ្នកចង់ចាកចេញ?",
        text: "អ្នកនឹងត្រូវចាកចេញពីគណនីប្រើប្រាស់បច្ចុប្បន្ន!",
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#334155",
        cancelButtonColor: "#64748b",
        confirmButtonText: "ចាកចេញ",
        cancelButtonText: "បោះបង់"
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem("att_session");
            checkSessionState();
        }
    });
}

/* ==========================================================================
   SPA ROUTER ENGINE & THEME CONTROL
   ========================================================================== */
function initRouter() {
    const menuItems = document.querySelectorAll(".menu-item");
    const sections = document.querySelectorAll(".tab-content");

    menuItems.forEach(item => {
        // Remove existing listener to prevent duplicate triggers on re-init
        item.replaceWith(item.cloneNode(true));
    });

    const newMenuItems = document.querySelectorAll(".menu-item");
    newMenuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabName = item.getAttribute("data-tab");

            // Route shielding for staff users trying to access admin tabs
            if ((!AppState.currentUser || AppState.currentUser.role !== "admin") && (tabName === "teachers" || tabName === "settings")) {
                document.querySelector(".menu-item[data-tab='dashboard']").click();
                return;
            }

            // Stop camera if running and navigating away from dashboard
            if (tabName !== "dashboard" && AppState.isCameraRunning) {
                stopQRScanner();
            }

            // Update Active Sidebar link
            newMenuItems.forEach(m => m.classList.remove("active"));
            item.classList.add("active");

            // Toggle Page Section View
            sections.forEach(sec => sec.classList.remove("active-tab"));

            const targetSection = document.getElementById(`${tabName}-section`);
            if (targetSection) {
                targetSection.classList.add("active-tab");
            }

            // Update page title
            const tabTitle = item.querySelector("span").textContent;
            document.getElementById("page-title").textContent = tabTitle;

            // Trigger specific tab focus initializations
            if (tabName === "dashboard") {
                updateDashboardStats();
                renderDailyActivity();
                initWeeklyChart();
            } else if (tabName === "teachers") {
                renderTeachersTable();
            } else if (tabName === "history") {
                populateTeacherDropdowns();
                renderHistoryTable();
            } else if (tabName === "reports") {
                buildMonthlyReport();

                // Pull latest history logs when entering Reports tab
                const sheetUrl = getGoogleSheetUrl();
                if (sheetUrl && sheetUrl.includes("script.google.com")) {
                    syncDownloadFromGoogleSheets();
                }
            } else if (tabName === "settings") {
                initSettingsForm();
                renderUsersTable();

                // Pull latest settings from Google Sheet to ensure they are synchronized when entering Settings tab
                const sheetUrl = getGoogleSheetUrl();
                if (sheetUrl && sheetUrl.includes("script.google.com")) {
                    syncDownloadFromGoogleSheets();
                }
            }
        });
    });
}

// Theme Engine (Dark & Light)
function initTheme() {
    const btn = document.getElementById("theme-toggle");
    const savedTheme = localStorage.getItem("att_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);

    btn.replaceWith(btn.cloneNode(true));
    const newBtn = document.getElementById("theme-toggle");

    newBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("att_theme", nextTheme);
        updateThemeIcon(nextTheme);

        if (AppState.charts.weekly) {
            initWeeklyChart();
        }
    });
}

function updateThemeIcon(theme) {
    const icon = document.querySelector("#theme-toggle i");
    if (theme === "light") {
        icon.className = "fa-solid fa-sun";
    } else {
        icon.className = "fa-solid fa-moon";
    }
}

/* ==========================================================================
   UTILITY & FORMATTING HELPER FUNCTIONS
   ========================================================================== */
function toKhmerNumber(number) {
    return String(number).split('').map(digit => {
        return isNaN(parseInt(digit)) ? digit : KHMER_NUMBERS[parseInt(digit)];
    }).join('');
}

function getKhmerDayName(dayIndex) {
    return KHMER_DAYS[dayIndex];
}

function getKhmerMonthName(monthIndex) {
    return KHMER_MONTHS[monthIndex];
}

function formatDateToKhmer(date) {
    const day = getKhmerDayName(date.getDay());
    const dateNum = toKhmerNumber(date.getDate());
    const month = getKhmerMonthName(date.getMonth());
    const year = toKhmerNumber(date.getFullYear());
    return `ថ្ងៃ${day} ទី${dateNum} ខែ${month} ឆ្នាំ${year}`;
}

function formatDateISO(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatTimeInput(timeStr) {
    if (!timeStr) return "";
    
    const timeStrStr = timeStr.toString().trim();
    
    // If it is a full ISO date-time string containing 'T'
    if (timeStrStr.includes("T")) {
        try {
            const dateObj = new Date(timeStrStr);
            if (!isNaN(dateObj.getTime())) {
                const hh = String(dateObj.getHours()).padStart(2, "0");
                const mm = String(dateObj.getMinutes()).padStart(2, "0");
                return `${hh}:${mm}`;
            }
        } catch (e) {
            console.error("Failed to parse ISO datetime string:", e);
        }
    }
    
    const parts = timeStrStr.split(":");
    if (parts.length >= 2) {
        return `${parts[0].trim().padStart(2, "0")}:${parts[1].trim().padStart(2, "0")}`;
    }
    
    return timeStrStr;
}

// Normalize ISO date strings to local yyyy-mm-dd
function normalizeDateStr(dateStr) {
    if (!dateStr) return "";
    const cleanStr = dateStr.toString().trim();
    if (cleanStr.includes("T")) {
        try {
            const dateObj = new Date(cleanStr);
            if (!isNaN(dateObj.getTime())) {
                const yyyy = dateObj.getFullYear();
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dateObj.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
        } catch (e) {
            console.error("Failed to parse date string:", e);
        }
    }
    return cleanStr;
}

function timeStringToMinutes(timeStr) {
    if (!timeStr) return 0;
    const formatted = formatTimeInput(timeStr);
    const parts = formatted.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function playSuccessBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
        console.warn("Web Audio API not supported or interaction blocked.", e);
    }
}

function initClock() {
    const timeEl = document.getElementById("clock-time");
    const dateEl = document.getElementById("clock-date");

    setInterval(() => {
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const timeStr = `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;

        timeEl.textContent = timeStr;
        dateEl.textContent = formatDateToKhmer(now);
    }, 1000);
}

function saveTeachers() {
    localStorage.setItem("att_teachers", JSON.stringify(AppState.teachers));
    populateTeacherDropdowns();
    updateDashboardStats();
    syncUploadToGoogleSheets();
}

function saveAttendance() {
    localStorage.setItem("att_attendance", JSON.stringify(AppState.attendance));
    updateDashboardStats();
    renderDailyActivity();
    syncUploadToGoogleSheets();
}

function saveSettings() {
    localStorage.setItem("att_settings", JSON.stringify(AppState.settings));
    document.getElementById("school-name-display").textContent = AppState.settings.schoolName;
    document.getElementById("login-school-display").textContent = AppState.settings.schoolName;
    updateDashboardStats();
    syncUploadToGoogleSheets();
}

function saveUsers() {
    localStorage.setItem("att_users", JSON.stringify(AppState.users));
    renderUsersTable();
    syncUploadToGoogleSheets();
}

/* ==========================================================================
   GOOGLE SHEETS SYNCHRONIZATION ENGINE (MULTI-DEVICE DATA SYNC)
   ========================================================================== */
function updateSyncStatus(status) {
    const badge = document.getElementById("sync-status");
    const label = document.getElementById("sync-status-text");
    if (!badge || !label) return;

    badge.className = "sync-badge";
    if (status === "local") {
        badge.classList.add("sync-local");
        label.textContent = "ម៉ាស៊ីនផ្ទាល់ខ្លួន";
        badge.title = "កំពុងប្រើប្រាស់ទិន្នន័យក្នុងម៉ាស៊ីននេះ (Local Mode) - ចុចដើម្បីកំណត់ Google Sheet";
    } else if (status === "syncing") {
        badge.classList.add("sync-progress");
        label.textContent = "កំពុងធ្វើសមកាលកម្ម...";
        badge.title = "កំពុងផ្ទេរ និងធ្វើសមកាលកម្មទិន្នន័យជាមួយ Google Sheets";
    } else if (status === "synced") {
        badge.classList.add("sync-active");
        label.textContent = "សមកាលកម្មរួចរាល់";
        badge.title = "ទិន្នន័យត្រូវបានធ្វើសមកាលកម្មជាមួយ Google Sheets រួចរាល់";
    } else if (status === "error") {
        badge.classList.add("sync-error");
        label.textContent = "កំហុសសមកាលកម្ម";
        badge.title = "មិនអាចភ្ជាប់ទៅកាន់ Google Sheets បានឡើយ។ សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត និង Web App URL។";
    }
}

async function syncUploadToGoogleSheets() {
    const sheetUrl = getGoogleSheetUrl();
    if (!sheetUrl) {
        updateSyncStatus("local");
        return;
    }

    updateSyncStatus("syncing");
    const payload = {
        action: "sync",
        settings: AppState.settings,
        users: AppState.users,
        teachers: AppState.teachers,
        attendance: AppState.attendance
    };

    try {
        const response = await fetch(sheetUrl, {
            method: "POST",
            mode: "cors",
            redirect: "follow",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result && result.success) {
            updateSyncStatus("synced");
        } else {
            throw new Error(result ? result.message : "Sync failed");
        }
    } catch (error) {
        console.error("Google Sheet Sync Upload failed:", error);
        updateSyncStatus("error");
    }
}

async function syncDownloadFromGoogleSheets() {
    const sheetUrl = getGoogleSheetUrl();
    if (!sheetUrl) {
        updateSyncStatus("local");
        return false;
    }

    updateSyncStatus("syncing");
    try {
        const response = await fetch(sheetUrl, {
            method: "GET",
            mode: "cors",
            redirect: "follow"
        });
        if (!response.ok) {
            throw new Error("HTTP error " + response.status);
        }

        const db = await response.json();
        if (db && db.teachers && db.attendance && db.settings && db.users) {
            AppState.teachers = db.teachers;
            
            // Normalize attendance date strings defensively
            AppState.attendance = db.attendance.map(log => ({
                ...log,
                date: normalizeDateStr(log.date)
            }));
            
            // Merge settings defensively to prevent crashes from incomplete Google Sheet data
            const defaultSettings = {
                schoolName: "សាលារៀនគំរូ",
                googleSheetUrl: DEFAULT_GOOGLE_SHEET_URL,
                workdays: {
                    mon: true,
                    tue: true,
                    wed: true,
                    thu: true,
                    fri: true,
                    sat: false,
                    sun: false
                },
                morningStart: "06:30",
                morningLate: "07:30",
                afternoonStart: "12:30",
                afternoonLate: "13:30"
            };

            AppState.settings = {};
            for (const key in defaultSettings) {
                const val = db.settings[key];
                if (val !== undefined && val !== null && val !== "") {
                    AppState.settings[key] = val;
                } else {
                    AppState.settings[key] = defaultSettings[key];
                }
            }

            // Handle nested workdays specifically
            let remoteWorkdays = db.settings.workdays;
            if (remoteWorkdays) {
                if (typeof remoteWorkdays === "string") {
                    try {
                        const jsonStr = remoteWorkdays.replace(/'/g, '"');
                        remoteWorkdays = JSON.parse(jsonStr);
                    } catch (e) {
                        remoteWorkdays = {};
                    }
                }
                if (remoteWorkdays && typeof remoteWorkdays === "object") {
                    AppState.settings.workdays = {
                        ...defaultSettings.workdays,
                        ...remoteWorkdays
                    };
                }
            } else {
                AppState.settings.workdays = defaultSettings.workdays;
            }

            // Ensure there is at least default seed users if remote database is empty to prevent lockout
            AppState.users = db.users && db.users.length > 0 ? db.users : [
                { username: "admin", password: "admin", displayName: "អ្នកគ្រប់គ្រងប្រព័ន្ធ", role: "admin" },
                { username: "staff", password: "staff", displayName: "បុគ្គលិកចុះវត្តមាន", role: "staff" }
            ];

            localStorage.setItem("att_teachers", JSON.stringify(AppState.teachers));
            localStorage.setItem("att_attendance", JSON.stringify(AppState.attendance));
            localStorage.setItem("att_settings", JSON.stringify(AppState.settings));
            localStorage.setItem("att_users", JSON.stringify(AppState.users));

            updateSyncStatus("synced");
            refreshAllViews();
            return true;
        } else {
            throw new Error("Invalid remote database format");
        }
    } catch (error) {
        console.error("Google Sheet Sync Download failed:", error);
        updateSyncStatus("error");
        return false;
    }
}

// Periodic background auto-sync from Google Sheets (every 20 seconds for multi-device sync)
function startBackgroundSync() {
    setInterval(async () => {
        // Only sync if user is logged in, tab is visible, and no modals are open to avoid interrupting work
        const isModalActive = document.querySelector(".modal-overlay.active-modal") !== null;
        const sheetUrl = getGoogleSheetUrl();
        if (AppState.currentUser && !document.hidden && !isModalActive && sheetUrl && sheetUrl.includes("script.google.com")) {
            console.log("Auto-synchronizing from Google Sheets...");
            await syncDownloadFromGoogleSheets();
        }
    }, 20000);
}

// Show Google Apps Script Code Viewer & One-Click Copy Modal
function showAppsScriptModal() {
    const appsScriptCode = `/**
 * ==========================================================================
 * GOOGLE APPS SCRIPT DATABASE API FOR TEACHER ATTENDANCE SYSTEM
 * ==========================================================================
 */

function doGet(e) {
  initSheets();
  
  var db = {
    settings: getSettingsData(),
    users: getSheetDataAsArray("Users"),
    teachers: getSheetDataAsArray("Teachers"),
    attendance: getSheetDataAsArray("Attendance")
  };
  
  return ContentService.createTextOutput(JSON.stringify(db))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    initSheets();
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "No post data received!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    
    if (action === "sync") {
      if (data.settings) saveSettingsData(data.settings);
      if (data.users) saveArrayToSheet("Users", data.users, ["username", "password", "displayName", "role"]);
      if (data.teachers) saveArrayToSheet("Teachers", data.teachers, ["id", "name", "gender", "phone", "subject", "position", "status"]);
      if (data.attendance) saveArrayToSheet("Attendance", data.attendance, ["id", "teacherId", "date", "time", "session", "status", "method", "remark"]);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "ទិន្នន័យត្រូវបានធ្វើសមកាលកម្មជោគជ័យ!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Invalid action!" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ==========================================================================
   DATABASE HELPER CORE FUNCTIONS
   ========================================================================== */
function getSheetSafe(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var headers = [];
    if (name === "Settings") headers = ["Key", "Value"];
    else if (name === "Users") headers = ["username", "password", "displayName", "role"];
    else if (name === "Teachers") headers = ["id", "name", "gender", "phone", "subject", "position", "status"];
    else if (name === "Attendance") headers = ["id", "teacherId", "date", "time", "session", "status", "method", "remark"];
    
    if (headers.length > 0) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getSheetSafe("Settings");
  getSheetSafe("Users");
  getSheetSafe("Teachers");
  getSheetSafe("Attendance");
  
  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }
}

function getSettingsData() {
  var sheet = getSheetSafe("Settings");
  var rows = sheet.getDataRange().getValues();
  var settings = {};
  
  for (var i = 1; i < rows.length; i++) {
    var key = rows[i][0];
    var val = rows[i][1];
    
    if (val && (val.toString().indexOf("{") === 0 || val.toString().indexOf("[") === 0)) {
      try {
        settings[key] = JSON.parse(val);
      } catch (e) {
        settings[key] = val;
      }
    } else {
      if (val === "true") settings[key] = true;
      else if (val === "false") settings[key] = false;
      else settings[key] = val;
    }
  }
  return settings;
}

function saveSettingsData(settings) {
  var sheet = getSheetSafe("Settings");
  sheet.clear();
  sheet.appendRow(["Key", "Value"]);
  
  for (var key in settings) {
    var val = settings[key];
    if (val !== undefined && val !== null) {
      if (typeof val === "object") {
        val = JSON.stringify(val);
      }
      sheet.appendRow([key, val.toString()]);
    } else {
      sheet.appendRow([key, ""]);
    }
  }
}

function getSheetDataAsArray(sheetName) {
  var sheet = getSheetSafe(sheetName);
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  
  var headers = rows[0];
  var data = [];
  
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var record = {};
    for (var j = 0; j < headers.length; j++) {
      record[headers[j]] = row[j];
    }
    data.push(record);
  }
  return data;
}

function saveArrayToSheet(sheetName, array, headers) {
  var sheet = getSheetSafe(sheetName);
  sheet.clear();
  sheet.appendRow(headers);
  
  if (array.length === 0) return;
  
  var rows = [];
  for (var i = 0; i < array.length; i++) {
    var record = array[i];
    var row = [];
    for (var j = 0; j < headers.length; j++) {
      var val = record[headers[j]];
      row.push(val !== undefined && val !== null ? val.toString() : "");
    }
    rows.push(row);
  }
  
  var maxRows = sheet.getMaxRows();
  var neededRows = rows.length + 1;
  if (maxRows < neededRows) {
    sheet.insertRowsAfter(maxRows, neededRows - maxRows);
  }
  
  var maxCols = sheet.getMaxColumns();
  var neededCols = headers.length;
  if (maxCols < neededCols) {
    sheet.insertColumnsAfter(maxCols, neededCols - maxCols);
  }
  
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}`;

    Swal.fire({
        title: "<i class='fa-solid fa-code' style='color:#0ea5e9;'></i> កូដ Google Apps Script API",
        html: `
        <div style="text-align: left; margin-bottom: 0.8rem;">
            <p style="font-size:0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                សូមចុចប៊ូតុង <strong>"ចម្លងកូដ"</strong> រួចយកទៅបិទភ្ជាប់ (Paste) ក្នុង <strong>Google Sheet -> Extensions -> Apps Script</strong>៖
            </p>
            <textarea id="swal-appscript-textarea" readonly style="width: 100%; height: 260px; font-family: monospace; font-size: 0.78rem; background: var(--bg-tertiary, #1e293b); color: var(--text-main, #f8fafc); border: 1px solid var(--border-color, #334155); border-radius: 8px; padding: 0.75rem; resize: vertical; outline: none; white-space: pre;">${appsScriptCode}</textarea>
        </div>
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button id="swal-copy-script-btn" class="btn btn-primary" style="width: 100%;">
                <i class="fa-solid fa-copy"></i> ចម្លងកូដ (Copy Code)
            </button>
        </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        width: '650px',
        didOpen: () => {
            document.getElementById("swal-copy-script-btn").addEventListener("click", () => {
                const textarea = document.getElementById("swal-appscript-textarea");
                textarea.select();
                navigator.clipboard.writeText(appsScriptCode).then(() => {
                    Swal.fire({
                        title: "បានចម្លងរួចរាល់!",
                        text: "កូដ Google Apps Script ត្រូវបានចម្លងទៅកាន់ Clipboard រួចរាល់។",
                        icon: "success",
                        timer: 1500,
                        showConfirmButton: false
                    });
                }).catch(err => {
                    document.execCommand('copy');
                    Swal.fire({
                        title: "បានចម្លងរួចរាល់!",
                        icon: "success",
                        timer: 1500,
                        showConfirmButton: false
                    });
                });
            });
        }
    });
}

// Refresh all UI components safely with latest AppState
function refreshAllViews() {
    // Update school name display text labels (safe)
    const schoolDisplay = document.getElementById("school-name-display");
    if (schoolDisplay) schoolDisplay.textContent = AppState.settings.schoolName;
    const loginSchoolDisplay = document.getElementById("login-school-display");
    if (loginSchoolDisplay) loginSchoolDisplay.textContent = AppState.settings.schoolName;

    if (!AppState.currentUser) return;

    // Refresh dashboard statistics and lists (always safe)
    updateDashboardStats();
    renderDailyActivity();

    // Refresh tables (safe, doesn't interfere with modal editing)
    renderTeachersTable();
    populateTeacherDropdowns();
    renderHistoryTable();
    renderUsersTable();

    // Update weekly chart if initialized
    if (AppState.charts.weekly) {
        initWeeklyChart();
    }

    // Update settings form ONLY if no modal is active and the user is not actively focusing/typing in any input
    const isModalActive = document.querySelector(".modal-overlay.active-modal") !== null;
    const isUserFocusingInput = document.activeElement && 
                                 document.activeElement.id && 
                                 (document.activeElement.id.startsWith("setting-") || document.activeElement.id.startsWith("workday-"));

    if (!isModalActive && !isUserFocusingInput) {
        initSettingsForm();
    }
}



/* ==========================================================================
   DASHBOARD CARD STATISTICS
   ========================================================================== */
function updateDashboardStats() {
    const todayStr = formatDateISO(new Date());
    const dayOfWeek = new Date().getDay();
    const isTodayWorkday = isConfiguredWorkday(dayOfWeek);

    const totalTeachers = AppState.teachers.length;
    document.getElementById("stat-total-teachers").textContent = toKhmerNumber(totalTeachers);

    const todaysLogs = AppState.attendance.filter(log => log.date === todayStr);

    const uniqueCheckedIn = new Set(
        todaysLogs
            .filter(log => log.status === "វត្តមាន" || log.status === "យឺត")
            .map(log => log.teacherId)
    );
    const presentCount = uniqueCheckedIn.size;
    document.getElementById("stat-present-today").textContent = toKhmerNumber(presentCount);

    const lateCount = todaysLogs.filter(log => log.status === "យឺត").length;
    document.getElementById("stat-late-today").textContent = toKhmerNumber(lateCount);

    let absentCount = 0;
    if (isTodayWorkday && totalTeachers > 0) {
        AppState.teachers.forEach(teacher => {
            const hasLogToday = todaysLogs.some(log => log.teacherId === teacher.id);
            if (!hasLogToday) {
                absentCount++;
            }
        });
    }
    document.getElementById("stat-absent-today").textContent = toKhmerNumber(absentCount);
}

function renderDailyActivity() {
    const activityList = document.getElementById("daily-activity-list");
    const todayStr = formatDateISO(new Date());

    const todaysLogs = AppState.attendance
        .filter(log => log.date === todayStr)
        .sort((a, b) => b.time.localeCompare(a.time));

    if (todaysLogs.length === 0) {
        activityList.innerHTML = `<li class="empty-list">មិនទាន់មានសកម្មភាពនៅឡើយទេ</li>`;
        return;
    }

    activityList.innerHTML = "";
    todaysLogs.forEach(log => {
        const teacher = AppState.teachers.find(t => t.id === log.teacherId);
        if (!teacher) return;

        const li = document.createElement("li");
        li.className = "activity-item";

        let statusBadgeClass = "badge-present";
        let statusText = "វត្តមាន";
        if (log.status === "យឺត") {
            statusBadgeClass = "badge-late";
            statusText = "យឺត";
        } else if (log.status === "ច្បាប់") {
            statusBadgeClass = "badge-excused";
            statusText = "ច្បាប់";
        }

        const sessionText = log.session === "morning" ? "ព្រឹក" : "រសៀល";

        li.innerHTML = `
            <div class="activity-avatar">
                <i class="fa-solid fa-user-check"></i>
            </div>
            <div class="activity-details">
                <h4>${teacher.name}</h4>
                <p>អត្តលេខ: ${log.teacherId} | វេន: ${sessionText}</p>
            </div>
            <div class="activity-meta">
                <span class="badge ${statusBadgeClass}">${statusText}</span>
                <span class="activity-time">${log.time ? formatTime12(log.time) : '---'}</span>
            </div>
        `;
        activityList.appendChild(li);
    });
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

function isConfiguredWorkday(dayIndex) {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const key = dayKeys[dayIndex];
    return AppState.settings && AppState.settings.workdays && AppState.settings.workdays[key] === true;
}

/* ==========================================================================
   QR SCANNING CONTROLLER
   ========================================================================== */
function setupQRScanner() {
    const btn = document.getElementById("btn-toggle-camera");

    // Clear old listeners
    btn.replaceWith(btn.cloneNode(true));
    const newBtn = document.getElementById("btn-toggle-camera");

    newBtn.addEventListener("click", () => {
        if (AppState.isCameraRunning) {
            stopQRScanner();
        } else {
            startQRScanner();
        }
    });
}

function startQRScanner() {
    const placeholder = document.getElementById("scanner-placeholder");
    placeholder.style.display = "none";

    AppState.scanner = new Html5Qrcode("reader");

    AppState.scanner.start(
        { facingMode: "environment" },
        scannerConfig,
        onScanSuccessCallback,
        onScanErrorCallback
    )
        .then(() => {
            AppState.isCameraRunning = true;
            document.getElementById("btn-toggle-camera").innerHTML = `<i class="fa-solid fa-video-slash"></i> បិទកាមេរ៉ា`;
            document.getElementById("btn-toggle-camera").className = "btn btn-danger btn-sm";
        })
        .catch(err => {
            console.error("Camera access failed:", err);
            placeholder.style.display = "flex";
            Swal.fire({
                title: "បរាជ័យ!",
                text: "មិនអាចបើកកាមេរ៉ាបានឡើយ។ សូមប្រាកដថាអ្នកបានអនុញ្ញាតឱ្យប្រើប្រាស់កាមេរ៉ាក្នុងកម្មវិធីរុករក។",
                icon: "error",
                confirmButtonText: "យល់ព្រម"
            });
        });
}

function stopQRScanner() {
    if (AppState.scanner) {
        AppState.scanner.stop().then(() => {
            AppState.scanner = null;
            AppState.isCameraRunning = false;
            document.getElementById("scanner-placeholder").style.display = "flex";
            document.getElementById("btn-toggle-camera").innerHTML = `<i class="fa-solid fa-video"></i> ចាប់ផ្តើមកាមេរ៉ា`;
            document.getElementById("btn-toggle-camera").className = "btn btn-primary btn-sm";
        }).catch(err => {
            console.error("Failed to stop scanner:", err);
        });
    }
}

function onScanSuccessCallback(decodedText, decodedResult) {
    const teacherId = decodedText.trim();
    const teacher = AppState.teachers.find(t => t.id === teacherId);

    if (!teacher) {
        Swal.fire({
            title: "កូដមិនត្រឹមត្រូវ!",
            text: `មិនមានគ្រូបង្រៀនដែលមានអត្តលេខ [${teacherId}] ក្នុងប្រព័ន្ធឡើយ។`,
            icon: "warning",
            timer: 2000,
            showConfirmButton: false
        });
        return;
    }

    const result = executeCheckIn(teacherId);

    if (result.success) {
        playSuccessBeep();

        Swal.fire({
            title: "ចុះវត្តមានជោគជ័យ!",
            html: `<div style="text-align: center;">
                    <h3 style="color:var(--success); margin-bottom:0.5rem;">${teacher.name}</h3>
                    <p>ស្ថានភាព៖ <strong>${result.status}</strong></p>
                    <p>ម៉ោង៖ <strong>${result.time}</strong></p>
                   </div>`,
            icon: "success",
            timer: 1800,
            showConfirmButton: false
        });

        updateDashboardStats();
        renderDailyActivity();
        initWeeklyChart();
    } else {
        Swal.fire({
            title: "រួចរាល់ហើយ!",
            text: result.message,
            icon: "info",
            timer: 2000,
            showConfirmButton: false
        });
    }
}

function onScanErrorCallback(errorMessage) {
    // Suppress console spam
}

function executeCheckIn(teacherId, manualDate = null, manualTime = null, forceStatus = null, remark = "") {
    const now = new Date();
    const dateStr = manualDate || formatDateISO(now);

    let timeStr = "";
    if (manualTime) {
        timeStr = manualTime;
    } else {
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        timeStr = `${hh}:${mm}:${ss}`;
    }

    const minutes = timeStringToMinutes(timeStr);

    let session = "morning";
    if (minutes >= 720) {
        session = "afternoon";
    }

    const isDuplicate = AppState.attendance.some(log => {
        return log.teacherId === teacherId && log.date === dateStr && log.session === session;
    });

    if (isDuplicate && !manualDate) {
        return {
            success: false,
            message: `លោកគ្រូ/អ្នកគ្រូ បានស្កែនចុះវត្តមានវេន ${session === 'morning' ? 'ព្រឹក' : 'រសៀល'} ថ្ងៃនេះរួចហើយ។`
        };
    }

    let status = "វត្តមាន";
    if (forceStatus) {
        status = forceStatus;
    } else {
        const configThreshold = session === "morning"
            ? AppState.settings.morningLate
            : AppState.settings.afternoonLate;

        const thresholdMinutes = timeStringToMinutes(configThreshold);
        if (minutes > thresholdMinutes) {
            status = "យឺត";
        }
    }

    const logEntry = {
        id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        teacherId: teacherId,
        date: dateStr,
        time: status === "ច្បាប់" ? "" : timeStr,
        session: session,
        status: status,
        method: manualDate ? "Manual" : "QR Scanner",
        remark: remark
    };

    AppState.attendance.push(logEntry);
    saveAttendance();

    return {
        success: true,
        status: status,
        time: formatTime12(timeStr)
    };
}

/* ==========================================================================
   TEACHER MANAGEMENT COMPONENT
   ========================================================================== */
function renderTeachersTable() {
    const tbody = document.getElementById("teachers-list-body");
    const searchQuery = document.getElementById("teacher-search").value.toLowerCase();

    const filteredTeachers = AppState.teachers.filter(t => {
        return (t.name && t.name.toLowerCase().includes(searchQuery)) ||
            (t.id && t.id.toLowerCase().includes(searchQuery)) ||
            (t.phone && t.phone.toLowerCase().includes(searchQuery)) ||
            (t.subject && t.subject.toLowerCase().includes(searchQuery));
    });

    if (filteredTeachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-list" style="text-align:center;">មិនមានព័ត៌មានគ្រូបង្រៀនទេ</td></tr>`;
        return;
    }

    const isAdmin = AppState.currentUser && AppState.currentUser.role === "admin";

    tbody.innerHTML = "";
    filteredTeachers.forEach(t => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="code-font">${t.id}</td>
            <td style="font-weight:600;">${t.name}</td>
            <td>${t.gender}</td>
            <td class="code-font">${t.phone || '---'}</td>
            <td>${t.subject || '---'}</td>
            <td>${t.position || '---'}</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="showQRCard('${t.id}')">
                    <i class="fa-solid fa-qrcode"></i> កាត QR
                </button>
            </td>
            <td class="admin-only">
                <button class="btn-icon" onclick="editTeacher('${t.id}')" title="កែប្រែ">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteTeacher('${t.id}')" title="លុប">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showQRCard(teacherId) {
    const teacher = AppState.teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    document.getElementById("qr-card-name").textContent = teacher.name;
    document.getElementById("qr-card-id").textContent = teacher.id;
    document.getElementById("qr-card-position").textContent = teacher.position || "គ្រូបង្រៀន";

    document.querySelectorAll(".qr-school-title").forEach(el => {
        el.textContent = AppState.settings.schoolName;
    });

    const qrContainer = document.getElementById("qrcode-display");
    qrContainer.innerHTML = "";

    new QRCode(qrContainer, {
        text: teacher.id,
        width: 150,
        height: 150,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    openModal("modal-qr");
}

function editTeacher(teacherId) {
    const teacher = AppState.teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    document.getElementById("modal-teacher-title").textContent = "កែប្រែព័ត៌មានគ្រូបង្រៀន";
    document.getElementById("teacher-form-action").value = "edit";

    const idField = document.getElementById("teacher-id");
    idField.value = teacher.id;
    idField.disabled = true;

    document.getElementById("teacher-name").value = teacher.name;
    document.getElementById("teacher-gender").value = teacher.gender;
    document.getElementById("teacher-phone").value = teacher.phone || "";
    document.getElementById("teacher-subject").value = teacher.subject || "";
    document.getElementById("teacher-position").value = teacher.position || "";

    openModal("modal-teacher");
}

function deleteTeacher(teacherId) {
    const teacher = AppState.teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    Swal.fire({
        title: "តើអ្នកប្រាកដជាចង់លុប?",
        text: `គណនីរបស់ ${teacher.name} និងប្រវត្តិចុះវត្តមានទាំងអស់នឹងត្រូវលុបចោលជាអចិន្ត្រៃយ៍!`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ef4444",
        cancelButtonColor: "#64748b",
        confirmButtonText: "លុបចោល",
        cancelButtonText: "បោះបង់"
    }).then((result) => {
        if (result.isConfirmed) {
            AppState.teachers = AppState.teachers.filter(t => t.id !== teacherId);
            AppState.attendance = AppState.attendance.filter(log => log.teacherId !== teacherId);

            saveTeachers();
            saveAttendance();
            renderTeachersTable();

            Swal.fire({
                title: "បានលុបរួចរាល់!",
                icon: "success",
                timer: 1500,
                showConfirmButton: false
            });
        }
    });
}

function populateTeacherDropdowns() {
    const filterSelect = document.getElementById("filter-teacher");
    const formSelect = document.getElementById("manual-log-teacher");

    const defaultFilterOption = `<option value="">ទាំងអស់</option>`;
    const defaultFormOption = `<option value="" disabled selected>ជ្រើសរើសគ្រូបង្រៀន...</option>`;

    let teacherOptions = "";
    AppState.teachers.forEach(t => {
        teacherOptions += `<option value="${t.id}">${t.name} (${t.id})</option>`;
    });

    filterSelect.innerHTML = defaultFilterOption + teacherOptions;
    formSelect.innerHTML = defaultFormOption + teacherOptions;
}

/* ==========================================================================
   HISTORY LOGS COMPONENT
   ========================================================================== */
function renderHistoryTable() {
    const tbody = document.getElementById("history-list-body");

    const filterDate = document.getElementById("filter-date").value;
    const filterTeacherId = document.getElementById("filter-teacher").value;
    const filterStatus = document.getElementById("filter-status").value;

    let logs = [...AppState.attendance];

    if (filterDate) {
        logs = logs.filter(log => log.date === filterDate);
    }
    if (filterTeacherId) {
        logs = logs.filter(log => log.teacherId === filterTeacherId);
    }
    if (filterStatus) {
        logs = logs.filter(log => log.status === filterStatus);
    }

    logs.sort((a, b) => {
        if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
        }
        return b.time.localeCompare(a.time);
    });

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-list" style="text-align:center;">មិនមានប្រវត្តិចុះវត្តមានតាមការចម្រោះទេ</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    logs.forEach(log => {
        const teacher = AppState.teachers.find(t => t.id === log.teacherId);
        const name = teacher ? teacher.name : "គណនីត្រូវបានលុប";

        let statusBadge = "";
        if (log.status === "វត្តមាន") {
            statusBadge = `<span class="badge badge-present">វត្តមាន</span>`;
        } else if (log.status === "យឺត") {
            statusBadge = `<span class="badge badge-late">យឺត</span>`;
        } else if (log.status === "ច្បាប់") {
            statusBadge = `<span class="badge badge-excused">ច្បាប់</span>`;
        }

        const sessionText = log.session === "morning" ? "វេនព្រឹក" : "វេនរសៀល";
        const methodText = log.method === "Manual" ? "បញ្ចូលដោយដៃ" : "ស្កែន QR";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="code-font">${toKhmerNumber(log.date.split('-').reverse().join('/'))}</td>
            <td class="code-font">${log.time ? formatTime12(log.time) : '---'}</td>
            <td class="code-font">${log.teacherId}</td>
            <td style="font-weight:600;">${name}</td>
            <td>${sessionText}</td>
            <td>${statusBadge}</td>
            <td>${methodText}</td>
            <td><small>${log.remark || '---'}</small></td>
            <td class="admin-only">
                <button class="btn-icon" onclick="editHistoryLog('${log.id}')" title="កែប្រែ">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteHistoryLog('${log.id}')" title="លុប">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editHistoryLog(logId) {
    const log = AppState.attendance.find(l => l.id === logId);
    if (!log) return;

    const teacher = AppState.teachers.find(t => t.id === log.teacherId);
    const teacherName = teacher ? teacher.name : log.teacherId;

    document.getElementById("modal-log-title").textContent = "កែប្រែប្រវត្តិចុះវត្តមាន";
    document.getElementById("manual-log-action").value = "edit";
    document.getElementById("manual-log-id").value = log.id;

    document.getElementById("manual-log-teacher-select-group").style.display = "none";
    document.getElementById("manual-log-teacher-display-group").style.display = "block";
    document.getElementById("manual-log-teacher-name-display").textContent = `${teacherName} (${log.teacherId})`;

    document.getElementById("manual-log-teacher").required = false;

    document.getElementById("manual-log-date").value = log.date;
    document.getElementById("manual-log-session").value = log.session;
    document.getElementById("manual-log-status").value = log.status;
    document.getElementById("manual-log-time").value = log.time || "";
    document.getElementById("manual-log-remark").value = log.remark || "";

    openModal("modal-manual-log");
}

function deleteHistoryLog(logId) {
    Swal.fire({
        title: "តើអ្នកប្រាកដជាចង់លុប?",
        text: "ប្រវត្តិចុះវត្តមានមួយបន្ទាត់នេះនឹងត្រូវលុបចោល!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ef4444",
        cancelButtonColor: "#64748b",
        confirmButtonText: "លុបចោល",
        cancelButtonText: "បោះបង់"
    }).then((result) => {
        if (result.isConfirmed) {
            AppState.attendance = AppState.attendance.filter(l => l.id !== logId);
            saveAttendance();
            renderHistoryTable();
            Swal.fire({
                title: "បានលុបរួចរាល់!",
                icon: "success",
                timer: 1500,
                showConfirmButton: false
            });
        }
    });
}

/* ==========================================================================
   MONTHLY MATRIX REPORTS GENERATOR
   ========================================================================== */
function initReportYearSelector() {
    const selector = document.getElementById("report-year");
    const currentYear = new Date().getFullYear();
    selector.innerHTML = "";

    for (let y = currentYear; y >= currentYear - 5; y--) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = toKhmerNumber(y);
        selector.appendChild(option);
    }

    document.getElementById("report-month").value = new Date().getMonth();
}

function buildMonthlyReport() {
    const selectedMonth = parseInt(document.getElementById("report-month").value);
    const selectedYear = parseInt(document.getElementById("report-year").value);
    const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    const headerRow1 = document.getElementById("report-header-row-1");
    const headerRow2 = document.getElementById("report-header-row-2");

    headerRow1.innerHTML = `
        <th rowspan="2" style="width: 40px;">ល.រ</th>
        <th rowspan="2" style="width: 80px;">អត្តលេខ</th>
        <th rowspan="2" class="name-col">គោត្តនាម-នាម</th>
        <th rowspan="2" style="width: 40px;">ភេទ</th>
        <th colspan="${totalDays}">កាលបរិច្ឆេទប្រចាំខែ</th>
        <th colspan="4">សរុបវត្តមាន</th>
    `;

    let daysHeaderCols = "";
    for (let d = 1; d <= totalDays; d++) {
        daysHeaderCols += `<th class="day-cell">${d}</th>`;
    }

    headerRow2.innerHTML = daysHeaderCols + `
        <th class="summary-col" style="color:var(--success);">វ</th>
        <th class="summary-col" style="color:var(--warning);">យ</th>
        <th class="summary-col" style="color:var(--info);">ច</th>
        <th class="summary-col" style="color:var(--danger);">អ</th>
    `;

    const tbody = document.getElementById("report-matrix-body");
    if (AppState.teachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${totalDays + 8}" class="empty-list" style="text-align:center;">មិនមានទិន្នន័យគ្រូបង្រៀនទេ</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    AppState.teachers.forEach((teacher, idx) => {
        const tr = document.createElement("tr");

        let presentTotal = 0;
        let lateTotal = 0;
        let excuseTotal = 0;
        let absentTotal = 0;

        let dailyCells = "";

        for (let d = 1; d <= totalDays; d++) {
            const currentDate = new Date(selectedYear, selectedMonth, d);
            const dateStr = formatDateISO(currentDate);
            const dayOfWeek = currentDate.getDay();
            const isWorkday = isConfiguredWorkday(dayOfWeek);
            const dayLogs = AppState.attendance.filter(log => log.teacherId === teacher.id && log.date === dateStr);

            let cellContent = "";
            let cellClass = "";

            const todayISO = formatDateISO(new Date());
            const isFuture = dateStr > todayISO;

            if (isFuture) {
                cellContent = "";
                cellClass = "";
            } else if (dayLogs.length > 0) {
                const hasExcused = dayLogs.some(log => log.status === "ច្បាប់");
                const hasLate = dayLogs.some(log => log.status === "យឺត");

                if (hasExcused) {
                    cellContent = "ច";
                    cellClass = "cell-val-excused";
                    excuseTotal++;
                } else if (hasLate) {
                    cellContent = "យ";
                    cellClass = "cell-val-late";
                    lateTotal++;
                } else {
                    cellContent = "វ";
                    cellClass = "cell-val-present";
                    presentTotal++;
                }
            } else {
                if (isWorkday) {
                    cellContent = "អ";
                    cellClass = "cell-val-absent";
                    absentTotal++;
                } else {
                    cellContent = "ស";
                    cellClass = "cell-val-weekend weekend-cell";
                }
            }

            dailyCells += `<td class="day-cell ${cellClass}">${cellContent}</td>`;
        }

        tr.innerHTML = `
            <td>${toKhmerNumber(idx + 1)}</td>
            <td class="code-font">${teacher.id}</td>
            <td class="name-col">${teacher.name}</td>
            <td>${teacher.gender}</td>
            ${dailyCells}
            <td class="summary-col cell-val-present">${toKhmerNumber(presentTotal)}</td>
            <td class="summary-col cell-val-late">${toKhmerNumber(lateTotal)}</td>
            <td class="summary-col cell-val-excused">${toKhmerNumber(excuseTotal)}</td>
            <td class="summary-col cell-val-absent">${toKhmerNumber(absentTotal)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById("print-school-name").textContent = AppState.settings.schoolName;
    document.getElementById("report-month-title").textContent = `ប្រចាំខែ ${getKhmerMonthName(selectedMonth)} ឆ្នាំ ${toKhmerNumber(selectedYear)}`;

    const today = new Date();
    document.getElementById("print-signature-date").textContent = `ថ្ងៃទី ${toKhmerNumber(today.getDate())} ខែ ${getKhmerMonthName(today.getMonth())} ឆ្នាំ ${toKhmerNumber(today.getFullYear())}`;
}

function exportReportToCSV() {
    const selectedMonth = parseInt(document.getElementById("report-month").value);
    const selectedYear = parseInt(document.getElementById("report-year").value);
    const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    let csvContent = "\uFEFF";

    csvContent += `"${AppState.settings.schoolName}"\n`;
    csvContent += `"របាយការណ៍វត្តមានគ្រូបង្រៀនប្រចាំខែ ${getKhmerMonthName(selectedMonth)} ឆ្នាំ ${selectedYear}"\n\n`;

    let row1 = "ល.រ,អត្តលេខ,គោត្តនាម-នាម,ភេទ,";
    for (let d = 1; d <= totalDays; d++) {
        row1 += `${d},`;
    }
    row1 += "វត្តមាន(វ),យឺត(យ),ច្បាប់(ច),អវត្តមាន(អ)\n";
    csvContent += row1;

    AppState.teachers.forEach((teacher, idx) => {
        let presentTotal = 0;
        let lateTotal = 0;
        let excuseTotal = 0;
        let absentTotal = 0;

        let rowData = `${idx + 1},${teacher.id},"${teacher.name}",${teacher.gender},`;

        for (let d = 1; d <= totalDays; d++) {
            const currentDate = new Date(selectedYear, selectedMonth, d);
            const dateStr = formatDateISO(currentDate);
            const dayOfWeek = currentDate.getDay();
            const isWorkday = isConfiguredWorkday(dayOfWeek);
            const dayLogs = AppState.attendance.filter(log => log.teacherId === teacher.id && log.date === dateStr);

            const todayISO = formatDateISO(new Date());
            const isFuture = dateStr > todayISO;

            if (isFuture) {
                rowData += ",";
            } else if (dayLogs.length > 0) {
                const hasExcused = dayLogs.some(log => log.status === "ច្បាប់");
                const hasLate = dayLogs.some(log => log.status === "យឺត");

                if (hasExcused) {
                    rowData += "ច,";
                    excuseTotal++;
                } else if (hasLate) {
                    rowData += "យ,";
                    lateTotal++;
                } else {
                    rowData += "វ,";
                    presentTotal++;
                }
            } else {
                if (isWorkday) {
                    rowData += "អ,";
                    absentTotal++;
                } else {
                    rowData += "ស,";
                }
            }
        }

        rowData += `${presentTotal},${lateTotal},${excuseTotal},${absentTotal}\n`;
        csvContent += rowData;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const filename = `Report_${selectedYear}_${selectedMonth + 1}.csv`;

    if (navigator.msSaveBlob) {
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function exportReportToWord() {
    const reportTitle = document.getElementById("report-month-title").textContent;
    const content = document.getElementById("report-print-area").innerHTML;

    // Word Document Template with A4 Landscape and Kantumruy Pro font styles
    const htmlString = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
        <meta charset="utf-8">
        <title>${reportTitle}</title>
        <!--[if gte mso 9]>
        <xml>
            <w:WordDocument>
                <w:View>Print</w:View>
                <w:Zoom>100</w:Zoom>
                <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
            @page {
                size: A4 landscape;
                margin: 1.2cm;
            }
            body {
                font-family: 'Kantumruy Pro', 'Hanuman', 'Battambang', 'Khmer OS', sans-serif;
                font-size: 8.5pt;
                color: #000000;
                background-color: #ffffff;
            }
            table {
                border-collapse: collapse;
                width: 100%;
                margin-top: 10px;
            }
            th, td {
                border: 1px solid #000000 !important;
                padding: 4px 2px;
                text-align: center;
                font-size: 7.5pt;
                color: #000000;
            }
            th {
                background-color: #f1f5f9;
                font-weight: bold;
            }
            .name-col {
                text-align: left;
                white-space: nowrap;
                padding-left: 5px;
                font-weight: bold;
            }
            .day-cell {
                width: 22px;
            }
            .weekend-cell {
                background-color: #f3f4f6;
            }
            .summary-col {
                font-weight: bold;
                background-color: #f3f4f6;
            }
            .cell-val-present { color: #10b981; font-weight: bold; }
            .cell-val-late { color: #f59e0b; font-weight: bold; }
            .cell-val-excused { color: #06b6d4; font-weight: bold; }
            .cell-val-absent { color: #ef4444; font-weight: bold; }
            .cell-val-weekend { color: #6b7280; font-size: 6pt; }
            
            .report-print-header {
                width: 100%;
                margin-bottom: 20px;
                display: block;
                height: 60px;
            }
            .kingdom-header {
                float: right;
                width: 280px;
                text-align: center;
            }
            .kingdom-header h4 { font-size: 9.5pt; font-weight: bold; margin: 0; }
            .kingdom-header h5 { font-size: 8.5pt; margin: 2px 0; }
            .symbol-dots { font-size: 8pt; }
            
            .school-header {
                float: left;
                width: 280px;
                text-align: left;
            }
            .school-header h4 { font-size: 9.5pt; font-weight: bold; margin: 0; }
            .school-header p { font-size: 8.5pt; margin: 4px 0; }
            
            .report-title-block {
                text-align: center;
                margin-top: 15px;
                margin-bottom: 25px;
                clear: both;
            }
            .report-title-block h2 {
                font-size: 15pt;
                font-weight: bold;
                margin: 0;
            }
            .report-title-block h3 {
                font-size: 10.5pt;
                color: #334155;
                margin: 5px 0 0 0;
            }
            
            .report-print-signatures {
                margin-top: 40px;
                width: 100%;
                display: block;
                height: 120px;
                page-break-inside: avoid;
            }
            .signature-column {
                width: 300px;
                text-align: center;
            }
            .col-left {
                float: left;
            }
            .col-right {
                float: right;
            }
            .signature-column p { font-size: 8.5pt; font-style: italic; margin: 0; }
            .signature-column h4 { font-size: 9.5pt; font-weight: bold; margin: 5px 0 0 0; }
            .signature-space {
                height: 70px;
            }
        </style>
    </head>
    <body>
        ${content}
    </body>
    </html>
    `;

    const blob = new Blob(['\ufeff' + htmlString], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = `Report_Attendance_${reportTitle.replace(/\s+/g, '_')}.doc`;
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/* ==========================================================================
   USER MANAGER PANEL
   ========================================================================== */
function renderUsersTable() {
    const tbody = document.getElementById("users-list-body");
    tbody.innerHTML = "";

    AppState.users.forEach(u => {
        const tr = document.createElement("tr");
        const roleText = u.role === "admin" ? "អ្នកគ្រប់គ្រង" : "បុគ្គលិក";
        const roleBadgeClass = u.role === "admin" ? "badge-present" : "badge-excused";

        tr.innerHTML = `
            <td class="code-font">${u.username}</td>
            <td style="font-weight:600;">${u.displayName}</td>
            <td><span class="badge ${roleBadgeClass}">${roleText}</span></td>
            <td>
                <button class="btn-icon" onclick="editUserAccount('${u.username}')" title="កែលេខកូដ">
                    <i class="fa-solid fa-key"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteUserAccount('${u.username}')" title="លុប">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editUserAccount(username) {
    const user = AppState.users.find(u => u.username === username);
    if (!user) return;

    document.getElementById("modal-user-title").textContent = "ប្ដូរលេខកូដសម្ងាត់គណនី";
    document.getElementById("user-form-action").value = "edit";

    const userField = document.getElementById("user-username");
    userField.value = user.username;
    userField.disabled = true;

    document.getElementById("user-displayname").value = user.displayName;
    document.getElementById("user-displayname").disabled = true;

    document.getElementById("user-role").value = user.role;
    document.getElementById("user-role").disabled = true;

    document.getElementById("user-password").value = user.password;

    openModal("modal-user");
}

function deleteUserAccount(username) {
    if (AppState.currentUser.username.toLowerCase() === username.toLowerCase()) {
        Swal.fire({
            title: "បរាជ័យ!",
            text: "អ្នកមិនអាចលុបគណនីដែលកំពុងប្រើប្រាស់បានឡើយ!",
            icon: "error"
        });
        return;
    }

    const user = AppState.users.find(u => u.username === username);
    if (!user) return;

    Swal.fire({
        title: "តើអ្នកចង់លុបគណនីនេះ?",
        text: `គណនីរបស់ ${user.displayName} (${user.username}) នឹងត្រូវលុបចោល!`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ef4444",
        cancelButtonColor: "#64748b",
        confirmButtonText: "លុបចោល",
        cancelButtonText: "បោះបង់"
    }).then((result) => {
        if (result.isConfirmed) {
            AppState.users = AppState.users.filter(u => u.username !== username);
            saveUsers();
            Swal.fire({
                title: "បានលុបរួចរាល់!",
                icon: "success",
                timer: 1200,
                showConfirmButton: false
            });
        }
    });
}

/* ==========================================================================
   WEEKLY GRAPH STATISTICS (ChartJS)
   ========================================================================== */
function initWeeklyChart() {
    const canvas = document.getElementById('weeklyAttendanceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (AppState.charts.weekly) {
        AppState.charts.weekly.destroy();
    }

    const labels = [];
    const datasetPresent = [];
    const datasetLate = [];
    const datasetAbsent = [];

    const today = new Date();
    let workdayCounter = 0;
    let daysToCalculate = [];

    for (let i = 0; workdayCounter < 5 && i < 15; i++) {
        const targetDate = new Date();
        targetDate.setDate(today.getDate() - i);

        const dayOfWeek = targetDate.getDay();
        if (isConfiguredWorkday(dayOfWeek)) {
            daysToCalculate.unshift(targetDate);
            workdayCounter++;
        }
    }

    daysToCalculate.forEach(date => {
        const dateStr = formatDateISO(date);
        const dayName = getKhmerDayName(date.getDay());
        const labelStr = `ថ្ងៃ${dayName} (${date.getDate()}/${date.getMonth() + 1})`;
        labels.push(labelStr);

        const logs = AppState.attendance.filter(log => log.date === dateStr);
        const presentCount = new Set(logs.filter(log => log.status === "វត្តមាន").map(log => log.teacherId)).size;
        const lateCount = logs.filter(log => log.status === "យឺត").length;

        let absentCount = 0;
        AppState.teachers.forEach(t => {
            const hasLog = logs.some(log => log.teacherId === t.id);
            if (!hasLog) absentCount++;
        });

        datasetPresent.push(presentCount);
        datasetLate.push(lateCount);
        datasetAbsent.push(absentCount);
    });

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textGridColor = isDark ? "#334155" : "#e2e8f0";
    const textColor = isDark ? "#94a3b8" : "#475569";

    AppState.charts.weekly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'វត្តមាន',
                    data: datasetPresent,
                    backgroundColor: '#10b981',
                    borderRadius: 6
                },
                {
                    label: 'យឺត',
                    data: datasetLate,
                    backgroundColor: '#f59e0b',
                    borderRadius: 6
                },
                {
                    label: 'អវត្តមាន',
                    data: datasetAbsent,
                    backgroundColor: '#ef4444',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    grid: { color: textGridColor },
                    ticks: {
                        color: textColor,
                        font: { family: 'Kantumruy Pro', size: 11 }
                    }
                },
                y: {
                    stacked: true,
                    grid: { color: textGridColor },
                    ticks: {
                        color: textColor,
                        stepSize: 1,
                        beginAtZero: true
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        font: { family: 'Kantumruy Pro', size: 11 }
                    }
                }
            }
        }
    });
}

/* ==========================================================================
   SETTINGS PANEL CONTROLLER
   ========================================================================== */
function initSettingsForm() {
    const config = AppState.settings;

    document.getElementById("setting-school-name").value = config.schoolName;
    document.getElementById("setting-google-sheet-url").value = config.googleSheetUrl || "";

    document.getElementById("setting-morning-start").value = formatTimeInput(config.morningStart);
    document.getElementById("setting-morning-late").value = formatTimeInput(config.morningLate);
    document.getElementById("setting-afternoon-start").value = formatTimeInput(config.afternoonStart);
    document.getElementById("setting-afternoon-late").value = formatTimeInput(config.afternoonLate);

    document.getElementById("workday-mon").checked = config.workdays.mon;
    document.getElementById("workday-tue").checked = config.workdays.tue;
    document.getElementById("workday-wed").checked = config.workdays.wed;
    document.getElementById("workday-thu").checked = config.workdays.thu;
    document.getElementById("workday-fri").checked = config.workdays.fri;
    document.getElementById("workday-sat").checked = config.workdays.sat;
    document.getElementById("workday-sun").checked = config.workdays.sun;
}

function handleSaveGeneralSettings() {
    const newSettings = {
        schoolName: document.getElementById("setting-school-name").value.trim() || "សាលារៀនគំរូ",
        googleSheetUrl: document.getElementById("setting-google-sheet-url").value.trim(),
        workdays: {
            mon: document.getElementById("workday-mon").checked,
            tue: document.getElementById("workday-tue").checked,
            wed: document.getElementById("workday-wed").checked,
            thu: document.getElementById("workday-thu").checked,
            fri: document.getElementById("workday-fri").checked,
            sat: document.getElementById("workday-sat").checked,
            sun: document.getElementById("workday-sun").checked
        },
        morningStart: document.getElementById("setting-morning-start").value,
        morningLate: document.getElementById("setting-morning-late").value,
        afternoonStart: document.getElementById("setting-afternoon-start").value,
        afternoonLate: document.getElementById("setting-afternoon-late").value
    };

    AppState.settings = newSettings;
    saveSettings();

    Swal.fire({
        title: "រក្សាទុកជោគជ័យ!",
        text: "ការកំណត់ប្រព័ន្ធទូទៅត្រូវបានរក្សាទុកទៅក្នុងកម្មវិធី។",
        icon: "success",
        timer: 1500,
        showConfirmButton: false
    });
}




function handleBackupDatabase() {
    const backupObj = {
        teachers: AppState.teachers,
        attendance: AppState.attendance,
        settings: AppState.settings,
        users: AppState.users
    };

    const dataStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    const dateStamp = formatDateISO(new Date());
    link.href = url;
    link.download = `attendance_backup_${dateStamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function handleRestoreDatabase(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const importedData = JSON.parse(evt.target.result);

            if (importedData.teachers && importedData.attendance && importedData.settings && importedData.users) {
                AppState.teachers = importedData.teachers;
                AppState.attendance = importedData.attendance;
                AppState.settings = importedData.settings;
                AppState.users = importedData.users;

                localStorage.setItem("att_teachers", JSON.stringify(AppState.teachers));
                localStorage.setItem("att_attendance", JSON.stringify(AppState.attendance));
                localStorage.setItem("att_settings", JSON.stringify(AppState.settings));
                localStorage.setItem("att_users", JSON.stringify(AppState.users));

                document.getElementById("school-name-display").textContent = AppState.settings.schoolName;
                document.getElementById("login-school-display").textContent = AppState.settings.schoolName;

                initSettingsForm();
                updateDashboardStats();
                renderDailyActivity();
                renderTeachersTable();
                populateTeacherDropdowns();
                renderHistoryTable();
                initWeeklyChart();
                renderUsersTable();

                // Trigger background upload sync immediately
                syncUploadToGoogleSheets();

                Swal.fire({
                    title: "ជោគជ័យ!",
                    text: "ទិន្នន័យត្រូវបានបញ្ចូលឡើងវិញ និងសង្គ្រោះរួចរាល់។",
                    icon: "success",
                    confirmButtonText: "យល់ព្រម"
                });
            } else {
                throw new Error("Invalid schema structure");
            }
        } catch (err) {
            Swal.fire({
                title: "បរាជ័យ!",
                text: "ឯកសារ JSON មិនត្រឹមត្រូវតាមទម្រង់ប្រព័ន្ធឡើយ។",
                icon: "error",
                confirmButtonText: "យល់ព្រម"
            });
        }
    };
    reader.readAsText(file);
}

function handleResetDatabase() {
    Swal.fire({
        title: "តើអ្នកប្រាកដទេ?",
        text: "ទិន្នន័យគ្រូបង្រៀន ប្រវត្តិចុះវត្តមាន និងគណនីទាំងអស់នឹងត្រូវលុបចោលទាំងស្រុង!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ef4444",
        cancelButtonColor: "#64748b",
        confirmButtonText: "លុបសម្អាតទាំងអស់",
        cancelButtonText: "បោះបង់"
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.clear();

            initDatabase();
            initSettingsForm();
            updateDashboardStats();
            renderDailyActivity();
            renderTeachersTable();
            populateTeacherDropdowns();
            renderHistoryTable();
            initWeeklyChart();
            renderUsersTable();

            // Sync clean database reset state to Google Sheets
            syncUploadToGoogleSheets();

            // Logout active user session since DB cleared
            localStorage.removeItem("att_session");
            checkSessionState();

            Swal.fire({
                title: "បានសម្អាតរួចរាល់!",
                icon: "success",
                timer: 1500,
                showConfirmButton: false
            });
        }
    });
}

/* ==========================================================================
   BULK TEACHERS IMPORT & TEMPLATE EXPORTER (EXCEL/CSV)
   ========================================================================== */
function handleDownloadTeacherTemplate() {
    const headers = "អត្តលេខ,គោត្តនាម-នាម,ភេទ,លេខទូរស័ព្ទ,មុខវិជ្ជា,តួនាទី\n";
    const sampleRow = "T101,សុខ សាន,ប្រុស,012345678,គណិតវិទ្យា,គ្រូបង្រៀន\n";
    const csvContent = "\uFEFF" + headers + sampleRow; // UTF-8 BOM

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "teacher_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function parseCSVRow(rowText) {
    let fields = [];
    let insideQuotes = false;
    let currentField = '';

    for (let i = 0; i < rowText.length; i++) {
        let char = rowText[i];
        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            fields.push(currentField.trim());
            currentField = '';
        } else {
            currentField += char;
        }
    }
    fields.push(currentField.trim());
    return fields;
}

function handleImportTeachersCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const text = evt.target.result;
            const lines = text.split(/\r?\n/);

            if (lines.length < 2) {
                throw new Error("No data lines found in file.");
            }

            let addedCount = 0;
            let updatedCount = 0;
            let skipCount = 0;

            // Check if headers match
            const firstRowFields = parseCSVRow(lines[0]);
            // Allow minor check on column count or name to ensure it's the teacher sheet
            if (!firstRowFields[0].includes("អត្តលេខ") && !firstRowFields[1].includes("នាម")) {
                Swal.fire({
                    title: "ទម្រង់មិនត្រឹមត្រូវ!",
                    text: "សូមប្រាកដថាអ្នកបានប្រើប្រាស់ឯកសារគំរូដែលបានទាញយកពីប្រព័ន្ធ។",
                    icon: "error"
                });
                return;
            }

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue; // Skip empty rows

                const fields = parseCSVRow(line);
                if (fields.length < 2) continue; // Skip corrupted columns

                const id = fields[0].toUpperCase().trim();
                const name = fields[1].trim();
                const gender = fields[2] ? fields[2].trim() : "ប្រុស";
                const phone = fields[3] ? fields[3].trim() : "";
                const subject = fields[4] ? fields[4].trim() : "";
                const position = fields[5] ? fields[5].trim() : "";

                // Skip if ID or Name is empty
                if (!id || !name) {
                    skipCount++;
                    continue;
                }

                // Check duplicate/existing ID in app database
                const existingIdx = AppState.teachers.findIndex(t => t.id === id);
                if (existingIdx !== -1) {
                    // Update existing profile (Smart overwrite)
                    AppState.teachers[existingIdx] = {
                        ...AppState.teachers[existingIdx],
                        name,
                        gender,
                        phone,
                        subject,
                        position
                    };
                    updatedCount++;
                } else {
                    // Insert new profile record
                    AppState.teachers.push({
                        id,
                        name,
                        gender,
                        phone,
                        subject,
                        position,
                        status: "active"
                    });
                    addedCount++;
                }
            }

            // Save to localStorage
            saveTeachers();
            renderTeachersTable();
            populateTeacherDropdowns();

            Swal.fire({
                title: "នាំចូលទិន្នន័យជោគជ័យ!",
                html: `<div style="text-align: left; padding: 0 1rem;">
                        <p style="color:var(--success); font-weight:600;">✓ នាំចូលគណនីគ្រូថ្មី៖ ${addedCount} នាក់</p>
                        <p style="color:var(--info); font-weight:600;">✓ ធ្វើបច្ចុប្បន្នភាពគណនី៖ ${updatedCount} នាក់</p>
                        ${skipCount > 0 ? `<p style="color:var(--danger); font-weight:600;">✗ រំលង (ទិន្នន័យខ្វះចន្លោះ)៖ ${skipCount} ជួរ</p>` : ''}
                       </div>`,
                icon: "success",
                confirmButtonText: "យល់ព្រម"
            });

        } catch (err) {
            console.error(err);
            Swal.fire({
                title: "បរាជ័យ!",
                text: "មានបញ្ហាក្នុងការអានឯកសារ CSV របស់អ្នក។ សូមប្រាកដថាឯកសារមានទម្រង់ត្រឹមត្រូវ។",
                icon: "error"
            });
        }

        // Reset file input value to allow re-uploading
        e.target.value = "";
    };

    reader.readAsText(file, "UTF-8");
}

/* ==========================================================================
   EVENT LISTENERS ATTACHMENT
   ========================================================================== */
function setupEventListeners() {
    // 1. Login form submit
    document.getElementById("login-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const user = document.getElementById("login-username").value;
        const pass = document.getElementById("login-password").value;
        processLogin(user, pass);
    });

    // 2. Logout button click
    document.getElementById("btn-logout").addEventListener("click", processLogout);

    // 2a. Sync badge click for manual sync trigger
    const syncBadge = document.getElementById("sync-status");
    if (syncBadge) {
        syncBadge.addEventListener("click", async () => {
            const sheetUrl = getGoogleSheetUrl();
            if (!sheetUrl || !sheetUrl.includes("script.google.com")) {
                Swal.fire({
                    title: "សមកាលកម្មម៉ាស៊ីនផ្ទាល់ខ្លួន",
                    text: "ប្រព័ន្ធកំពុងដំណើរការជាលក្ខណៈ Local (ផ្ទុកលើម៉ាស៊ីននេះ)។ ប្រសិនបើចង់តភ្ជាប់ Google Sheet សូមបញ្ចូល Web App URL ក្នុងការកំណត់។",
                    icon: "info",
                    confirmButtonText: "យល់ព្រម"
                });
                return;
            }

            Swal.fire({
                title: "កំពុងធ្វើសមកាលកម្ម...",
                text: "សូមរង់ចាំ ពេលកំពុងភ្ជាប់ទៅកាន់ Google Sheets",
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // Perform bidirectional sync: pull latest remote changes first
            const success = await syncDownloadFromGoogleSheets();
            Swal.close();

            if (success) {
                Swal.fire({
                    title: "ជោគជ័យ!",
                    text: "ការធ្វើសមកាលកម្មទិន្នន័យពី Google Sheets ត្រូវបានបញ្ចប់។",
                    icon: "success",
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                Swal.fire({
                    title: "កំហុសសមកាលកម្ម!",
                    text: "មិនអាចតភ្ជាប់ទៅកាន់ Google Sheet បានទេ។ សូមពិនិត្យមើល URL ឬការតភ្ជាប់អ៊ីនធឺណិត។",
                    icon: "error",
                    confirmButtonText: "យល់ព្រម"
                });
            }
        });
    }

    // 2b. Show Google Sheet Setup Guide Modal
    const btnGuide = document.getElementById("btn-show-google-guide");
    if (btnGuide) {
        btnGuide.addEventListener("click", () => {
            Swal.fire({
                title: "<i class='fa-solid fa-circle-question' style='color:#3b82f6;'></i> របៀបភ្ជាប់ Google Sheet (Multi-Device Sync)",
                html: `
                <div style="text-align: left; font-size: 0.88rem; line-height: 1.6; color: var(--text-main);">
                    <p style="margin-bottom: 0.5rem;"><strong>សូមអនុវត្តតាម ៧ ជំហានខាងក្រោមដើម្បីភ្ជាប់ប្រព័ន្ធទៅ Google Sheet៖</strong></p>
                    <ol style="padding-left: 1.2rem; margin-bottom: 1rem;">
                        <li style="margin-bottom:0.3rem;">បង្កើត <strong>Google Sheet ថ្មី</strong> មួយក្នុង Google Drive របស់អ្នក (ឬចូលទៅ <a href="https://sheets.new" target="_blank">sheets.new</a>)</li>
                        <li style="margin-bottom:0.3rem;">ចូលទៅកាន់ <strong>Extensions</strong> -> <strong>Apps Script</strong></li>
                        <li style="margin-bottom:0.3rem;">លុបកូដចាស់ចោល រួចចម្លងកូដ <code>Apps Script</code> ទៅបិទភ្ជាប់ (Paste) 
                            <button id="swal-btn-open-code" class="btn btn-info btn-sm" style="margin-left: 0.3rem; padding: 0.2rem 0.5rem; font-size: 0.75rem;">
                                <i class="fa-solid fa-code"></i> មើលកូដ
                            </button>
                        </li>
                        <li style="margin-bottom:0.3rem;">ចុច <strong>Save</strong> (រូបថាស)</li>
                        <li style="margin-bottom:0.3rem;">ចុច <strong>Deploy</strong> -> <strong>New deployment</strong>
                            <br>- Select type: <strong>Web app</strong>
                            <br>- Execute as: <strong>Me (អ៊ីមែលរបស់អ្នក)</strong>
                            <br>- Who has access: <strong>Anyone</strong> (អ្នករាល់គ្នា)
                        </li>
                        <li style="margin-bottom:0.3rem;">ចុច <strong>Deploy</strong> -> អនុញ្ញាតសិទ្ធិ (Authorize Access)</li>
                        <li style="margin-bottom:0.3rem;">ចម្លង (Copy) <strong>Web App URL</strong> ដែលទទួលបាន យកមកបិទភ្ជាប់ក្នុងប្រអប់ខាងលើនេះ!</li>
                    </ol>
                </div>
                `,
                confirmButtonText: "យល់ព្រម",
                didOpen: () => {
                    const btnOpenCode = document.getElementById("swal-btn-open-code");
                    if (btnOpenCode) {
                        btnOpenCode.addEventListener("click", () => {
                            Swal.close();
                            showAppsScriptModal();
                        });
                    }
                }
            });
        });
    }

    // 2c. Show Google Apps Script Code Modal
    const btnShowCode = document.getElementById("btn-show-appscript-code");
    if (btnShowCode) {
        btnShowCode.addEventListener("click", showAppsScriptModal);
    }

    // 3. Dashboard Manual Input scan code trigger
    document.getElementById("btn-submit-manual-code").addEventListener("click", () => {
        const input = document.getElementById("manual-code-input");
        const code = input.value.trim();
        if (code) {
            onScanSuccessCallback(code, null);
            input.value = "";
        }
    });

    document.getElementById("manual-code-input").addEventListener("keypress", (e) => {
        if (e.key === 'Enter') {
            document.getElementById("btn-submit-manual-code").click();
        }
    });

    // 4. Camera Setup
    setupQRScanner();

    // 5. Teachers Search
    document.getElementById("teacher-search").addEventListener("input", renderTeachersTable);

    // 5a. Teachers Bulk Template Download & Import
    document.getElementById("btn-download-template").addEventListener("click", handleDownloadTeacherTemplate);
    document.getElementById("import-teachers-file").addEventListener("change", handleImportTeachersCSV);

    // 6. Add Teacher click modal open
    document.getElementById("btn-add-teacher").addEventListener("click", () => {
        document.getElementById("modal-teacher-title").textContent = "បន្ថែមគ្រូបង្រៀនថ្មី";
        document.getElementById("teacher-form-action").value = "add";
        document.getElementById("teacher-form").reset();

        const idField = document.getElementById("teacher-id");
        idField.disabled = false;

        openModal("modal-teacher");
    });

    // 7. Submit Add/Edit Teacher Form
    document.getElementById("teacher-form").addEventListener("submit", (e) => {
        e.preventDefault();

        const action = document.getElementById("teacher-form-action").value;
        const id = document.getElementById("teacher-id").value.trim().toUpperCase();
        const name = document.getElementById("teacher-name").value.trim();
        const gender = document.getElementById("teacher-gender").value;
        const phone = document.getElementById("teacher-phone").value.trim();
        const subject = document.getElementById("teacher-subject").value.trim();
        const position = document.getElementById("teacher-position").value.trim();

        if (action === "add") {
            const exists = AppState.teachers.some(t => t.id === id);
            if (exists) {
                Swal.fire({
                    title: "អត្តលេខស្ទួន!",
                    text: `អត្តលេខគ្រូ [${id}] មានរួចរាល់ហើយក្នុងប្រព័ន្ធ។`,
                    icon: "error"
                });
                return;
            }

            AppState.teachers.push({ id, name, gender, phone, subject, position, status: "active" });
        } else {
            const idx = AppState.teachers.findIndex(t => t.id === id);
            if (idx !== -1) {
                AppState.teachers[idx] = { ...AppState.teachers[idx], name, gender, phone, subject, position };
            }
        }

        saveTeachers();
        closeModal("modal-teacher");
        renderTeachersTable();

        Swal.fire({
            title: "ជោគជ័យ!",
            text: "ទិន្នន័យគ្រូបង្រៀនត្រូវបានរក្សាទុក។",
            icon: "success",
            timer: 1500,
            showConfirmButton: false
        });
    });

    // 8. Print Single QR card
    document.getElementById("btn-print-qr-card").addEventListener("click", () => {
        window.print();
    });

    // 9. Manual logs filters
    document.getElementById("filter-date").addEventListener("change", renderHistoryTable);
    document.getElementById("filter-teacher").addEventListener("change", renderHistoryTable);
    document.getElementById("filter-status").addEventListener("change", renderHistoryTable);

    document.getElementById("btn-reset-filters").addEventListener("click", () => {
        document.getElementById("filter-date").value = "";
        document.getElementById("filter-teacher").value = "";
        document.getElementById("filter-status").value = "";
        renderHistoryTable();
    });

    // 10. Open manual log modal
    document.getElementById("btn-add-manual-log").addEventListener("click", () => {
        document.getElementById("modal-log-title").textContent = "បញ្ចូលវត្តមានដោយដៃ / សុំច្បាប់";
        document.getElementById("manual-log-action").value = "add";
        document.getElementById("manual-log-form").reset();

        document.getElementById("manual-log-teacher-select-group").style.display = "block";
        document.getElementById("manual-log-teacher-display-group").style.display = "none";
        document.getElementById("manual-log-teacher").required = true;

        document.getElementById("manual-log-date").value = formatDateISO(new Date());

        openModal("modal-manual-log");
    });

    // 11. Manual log submit form
    document.getElementById("manual-log-form").addEventListener("submit", (e) => {
        e.preventDefault();

        const action = document.getElementById("manual-log-action").value;
        const logId = document.getElementById("manual-log-id").value;

        const date = document.getElementById("manual-log-date").value;
        const session = document.getElementById("manual-log-session").value;
        const status = document.getElementById("manual-log-status").value;
        const time = document.getElementById("manual-log-time").value;
        const remark = document.getElementById("manual-log-remark").value.trim();

        if (action === "add") {
            const teacherId = document.getElementById("manual-log-teacher").value;

            const isDuplicate = AppState.attendance.some(log => {
                return log.teacherId === teacherId && log.date === date && log.session === session;
            });

            if (isDuplicate) {
                Swal.fire({
                    title: "ទិន្នន័យស្ទួន!",
                    text: `គ្រូបង្រៀននេះមានប្រវត្តិចុះវត្តមានសម្រាប់វេននេះរួចរាល់ហើយក្នុងកាលបរិច្ឆេទនេះ។`,
                    icon: "error"
                });
                return;
            }

            executeCheckIn(teacherId, date, time, status, remark);
        } else {
            const idx = AppState.attendance.findIndex(l => l.id === logId);
            if (idx !== -1) {
                AppState.attendance[idx] = {
                    ...AppState.attendance[idx],
                    date,
                    session,
                    status,
                    time: status === "ច្បាប់" ? "" : time,
                    remark
                };
                saveAttendance();
            }
        }

        closeModal("modal-manual-log");
        renderHistoryTable();

        Swal.fire({
            title: "ជោគជ័យ!",
            text: "ប្រវត្តិចុះវត្តមានត្រូវបានរក្សាទុក។",
            icon: "success",
            timer: 1500,
            showConfirmButton: false
        });
    });

    // 12. Generate monthly report
    document.getElementById("btn-generate-report").addEventListener("click", async () => {
        const sheetUrl = getGoogleSheetUrl();
        if (sheetUrl && sheetUrl.includes("script.google.com")) {
            Swal.fire({
                title: "កំពុងទាញយកទិន្នន័យ...",
                text: "សូមរង់ចាំ ពេលកំពុងធ្វើសមកាលកម្មប្រវត្តិចុះវត្តមានចុងក្រោយ",
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            await syncDownloadFromGoogleSheets();
            Swal.close();
        }

        buildMonthlyReport();
        Swal.fire({
            title: "ជោគជ័យ!",
            text: "របាយការណ៍ត្រូវបានបង្កើត និងរៀបចំរួចរាល់។",
            icon: "success",
            timer: 1000,
            showConfirmButton: false
        });
    });

    // 13. Excel Export button click
    document.getElementById("btn-export-excel").addEventListener("click", exportReportToCSV);

    // 13a. Word Export button click
    document.getElementById("btn-export-word").addEventListener("click", exportReportToWord);

    // 14. Print Report button click
    document.getElementById("btn-print-report").addEventListener("click", () => {
        window.print();
    });

    // 15. Settings form save changes
    document.getElementById("btn-save-general-settings").addEventListener("click", handleSaveGeneralSettings);

    // 16. Data backup click
    document.getElementById("btn-backup-data").addEventListener("click", handleBackupDatabase);

    // 17. Data restore click
    document.getElementById("restore-file-input").addEventListener("change", handleRestoreDatabase);

    // 18. Reset DB click
    document.getElementById("btn-reset-db").addEventListener("click", handleResetDatabase);

    // 19. User Accounts Add Modal Trigger
    document.getElementById("btn-add-user").addEventListener("click", () => {
        document.getElementById("modal-user-title").textContent = "បង្កើតគណនីប្រើប្រាស់ថ្មី";
        document.getElementById("user-form-action").value = "add";
        document.getElementById("user-form").reset();

        document.getElementById("user-username").disabled = false;
        document.getElementById("user-displayname").disabled = false;
        document.getElementById("user-role").disabled = false;

        openModal("modal-user");
    });

    // 20. Submit Add/Edit User Account
    document.getElementById("user-form").addEventListener("submit", (e) => {
        e.preventDefault();

        const action = document.getElementById("user-form-action").value;
        const username = document.getElementById("user-username").value.trim().toLowerCase();
        const displayName = document.getElementById("user-displayname").value.trim();
        const role = document.getElementById("user-role").value;
        const password = document.getElementById("user-password").value;

        if (action === "add") {
            const exists = AppState.users.some(u => u.username.toLowerCase() === username);
            if (exists) {
                Swal.fire({
                    title: "គណនីស្ទួន!",
                    text: `ឈ្មោះគណនី [${username}] មានរួចរាល់ហើយក្នុងប្រព័ន្ធ។`,
                    icon: "error"
                });
                return;
            }

            AppState.users.push({ username, displayName, role, password });
        } else {
            // Edit Password
            const idx = AppState.users.findIndex(u => u.username.toLowerCase() === username);
            if (idx !== -1) {
                AppState.users[idx].password = password;
            }
        }

        saveUsers();
        closeModal("modal-user");

        Swal.fire({
            title: "ជោគជ័យ!",
            text: "គណនីប្រើប្រាស់ត្រូវបានរក្សាទុក។",
            icon: "success",
            timer: 1500,
            showConfirmButton: false
        });
    });
}

/* ==========================================================================
   MODAL CONTROLLER (GLOBAL WRAPPERS)
   ========================================================================== */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("active-modal");
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active-modal");
    }
}
