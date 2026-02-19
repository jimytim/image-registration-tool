import { PreProcessingUIManager } from "./preprocessing.js";
import { MatchingUIManager } from "./matching.js";
import { InspectUIManager } from "./inspect.js";
import { Features, FeaturesEvents, KeyPoint, Match} from "./features.js"

import { loadImageCanvas } from "./imageLoader.js";
import { OSDViewer, MatchingOSDViewer } from "./viewer.js";

// TODO: Add messages to load image and when no image loaded (in matching and preprocessing tabs)

class App {
    constructor() {
        this.state = {
            mode: "manual",
            left: { viewer: null, imageCanvas: null, ogImageCanvas: null, filename: null },
            right: { viewer: null, imageCanvas: null, ogImageCanvas: null, filename: null },
            features: new Features(),
            transform: null,
        };

        this.viewers = {
            preprocessing: null,
            left: null,
            right: null,
            preview: null,
            error: null,
        };

        this.currentTab = null;
        this.currentMode = "manual";

        this.initViewers();
        this.setupUI();
        this.initUI();
    }

    updateStatus(msg) {
        console.log(`App Status: ${msg}`);
        // status.innerText = msg;
    }

    setupUI() {
        // this.matchingUI = new MatchingUIManager();

        // File Dropdown Toggle
        document.getElementById("fileMenuBtn").addEventListener("click", (e) => {
            e.stopPropagation();
            document.getElementById("fileDropdown").classList.toggle("show");
        });

        /* --- Reset Button --- */
        document.getElementById("btn-reset").addEventListener("click", () => {
            if (confirm("Are you sure you want to reset everything? This will clear all images and data.")) {
                this.handleReset();
            }
        });

        /* --- Help Modal Logic --- */
        this.loadHelpContent(); // Fetch HTML and inject it

        const helpModal = document.getElementById("help-modal");
        const btnHelp = document.getElementById("btn-help");
        const btnCloseHelp = document.getElementById("btn-close-help");
        const btnCloseHelpX = document.getElementById("btn-close-help-x");

        // Open modal
        btnHelp.addEventListener("click", () => {
            helpModal.classList.remove("hidden");
        });

        // Close modal
        const closeHelp = () => helpModal.classList.add("hidden");
        btnCloseHelp.addEventListener("click", closeHelp);
        btnCloseHelpX.addEventListener("click", closeHelp);

        // Help Modal Tab Switching
        const helpTabLinks = document.querySelectorAll(".help-tab-link");
        helpTabLinks.forEach(link => {
            link.addEventListener("click", (e) => {
                // Remove active class from all help tabs
                helpTabLinks.forEach(l => l.classList.remove("active"));
                e.target.classList.add("active");

                // Hide all help sections inside the container
                document.querySelectorAll(".help-section").forEach(sec => sec.classList.add("hidden"));

                // Show the targeted section
                const targetId = e.target.getAttribute("data-target");
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    targetSection.classList.remove("hidden");
                }
            });
        });

        /* --- Settings Modal --- */
        const settingsModal = document.getElementById("settings-modal");
        const btnSettings = document.getElementById("btn-settings");
        const btnCloseSettings = document.getElementById("btn-close-settings");
        const closeSpan = document.querySelector(".close-modal");
        const chkShowLines = document.getElementById("setting-show-lines");

        btnSettings.addEventListener("click", () => {
            settingsModal.classList.remove("hidden");
        });

        const closeModal = () => settingsModal.classList.add("hidden");
        btnCloseSettings.addEventListener("click", closeModal);
        closeSpan.addEventListener("click", closeModal);

        chkShowLines.addEventListener("change", (e) => {
            this.matchingUI.toggleMatchingLines(e.target.checked);
        });

        /* --- File handling --- */

        // Dropdown button mapping to inputs
        document.getElementById("file-open-left-img").addEventListener("click", () => {
            document.getElementById("input-left-img").click();
        });
        document.getElementById("file-open-right-img").addEventListener("click", () => {
            document.getElementById("input-right-img").click();
        });
        document.getElementById("file-open-left-meta").addEventListener("click", () => {
            document.getElementById("input-left-meta").click();
        });
        document.getElementById("file-open-right-meta").addEventListener("click", () => {
            document.getElementById("input-right-meta").click();
        });
        document.getElementById("file-open-matching").addEventListener("click", () => {
            document.getElementById("input-import-matching").click();
        });
        document.getElementById("file-export-matching").addEventListener("click", () => {
             this.handleExportMatching();
        });

        // File input handling
        document.getElementById("input-left-img").addEventListener("change", (e) => this.handleImageSelect(e, "left"));
        document.getElementById("input-right-img").addEventListener("change", (e) => this.handleImageSelect(e, "right"));

        document.getElementById("input-left-meta").addEventListener("change", (e) => this.handleMetadataSelect(e, "left"));
        document.getElementById("input-right-meta").addEventListener("change", (e) => this.handleMetadataSelect(e, "right"));

        document.getElementById("input-import-matching").addEventListener("change", (e) => this.handleImportMatching(e));


        // Mode selection
        document.getElementById("btn-manual").addEventListener("click", () => {
            if (this.currentMode != "manual") this.setMode("manual");
        });
        document.getElementById("btn-auto").addEventListener("click", () => {
            if (this.currentMode != "automatic") this.setMode("automatic");
        });

        // Nav Tabs buttons
        document.getElementById("tab-preprocessing").addEventListener("click", () => {
            if (this.currentTab != "preprocessing'") this.openTab("preprocessing");
        });
        document.getElementById("tab-matching").addEventListener("click", () => {
            if (this.currentTab != "matching") this.openTab("matching");
        });
        document.getElementById("tab-inspection").addEventListener("click", () => {
            if (this.currentTab != "inspection") this.openTab("inspection");
        });

        // Close dropdown when clicking outside
        window.onclick = function (event) {
            if (!event.target.matches(".dropbtn") && !event.target.matches(".dropbtn *")) {
                const dropdowns = document.getElementsByClassName("dropdown-content");
                for (let i = 0; i < dropdowns.length; i++) {
                    if (dropdowns[i].classList.contains("show")) {
                        dropdowns[i].classList.remove("show");
                    }
                }
            }

            const settingsModal = document.getElementById("settings-modal");
            if (event.target === settingsModal) {
                 settingsModal.classList.add("hidden");
            }

            // Add this block for the help modal:
            if (event.target === helpModal) {
                 helpModal.classList.add("hidden");
            }
        };

        // Instantiate tabs UI Managers
        this.preprocessingUI = new PreProcessingUIManager(this.state, this.viewers.preprocessing);
        this.matchingUI = new MatchingUIManager(this.state, this.viewers.left, this.viewers.right);
        this.inspectUI = new InspectUIManager(this.state, this.viewers.preview, this.viewers.error);
    }

    initUI() {
        this.preprocessingUI.setupUI();
        this.preprocessingUI.initUI();
        this.matchingUI.setupUI();
        this.matchingUI.initUI();
        this.inspectUI.initUI();
        this.openTab("matching");
        this.setMode(this.currentMode);

        const chkShowLines = document.getElementById("setting-show-lines");
        this.matchingUI.toggleMatchingLines(chkShowLines.checked);
    }

    initViewers() {
        const matchingViewersConfig = { gestureSettingsMouse: { clickToZoom: false, dragToPan: false } };
        const inspectConfig = { gestureSettingsMouse: { clickToZoom: false, dragToPan: true } };
        this.viewers.left = new MatchingOSDViewer("osd-match-left", "left", matchingViewersConfig);
        this.viewers.right = new MatchingOSDViewer("osd-match-right", "right", matchingViewersConfig);
        this.viewers.preprocessing = new OSDViewer("osd-preprocessing");
        this.viewers.preview = new OSDViewer("osd-insp-preview", {...inspectConfig, animationTime: 0, springStiffness: 100 });
        this.viewers.error = new OSDViewer("osd-insp-error", inspectConfig);

        this.state.left.viewer = this.viewers.left;
        this.state.right.viewer = this.viewers.right;
    }

    setMode(mode) {

        this.currentMode = mode;
        this.state.mode = mode

        const btnManual = document.getElementById("btn-manual");
        const btnAuto = document.getElementById("btn-auto");
        const toolbar = document.getElementById("match-manual-toolbar");
        const sidebar = document.getElementById("match-auto-sidebar");

        switch (mode) {
            case "manual":
                btnManual.classList.add("active");
                btnAuto.classList.remove("active");
                toolbar.classList.remove("hidden");
                sidebar.classList.add("hidden");
                break;
            case "automatic":
                btnAuto.classList.add("active");
                btnManual.classList.remove("active");
                toolbar.classList.add("hidden");
                sidebar.classList.remove("hidden");
                break;
        }

        this.matchingUI.switchToMode(mode);

        // TODO: Update the viewers (goHome, ..) of the current tab when mode is changed
        // setTimeout(() => {
        //     this.matchingUI.layoutChanged();
        // }, 50);

        console.log(`Mode changed to: ${mode}`);
    }

    openTab(tabName) {
        // console.log(`Switching to tab ${tabName}`);

        // Hide previous tab
        if (this.currentTab) {
            document.getElementById(this.currentTab).classList.add("hidden");
            document.getElementById(`tab-${this.currentTab}`).classList.remove("active");
        }
        // Show tab
        document.getElementById(tabName).classList.remove("hidden");
        document.getElementById(`tab-${tabName}`).classList.add("active");

        this.currentTab = tabName;

        let viewersToReset = null;
        switch (tabName) {
            case "preprocessing":
                viewersToReset = [this.viewers.preprocessing.viewer];
                break;
            case "matching":
                viewersToReset = [this.viewers.left.viewer, this.viewers.right.viewer];
                break;
            case "inspection":
                viewersToReset = [this.viewers.preview.viewer, this.viewers.error.viewer];
                if (this.inspectUI) {
                    if (this.state.left.imageCanvas) {
                         this.viewers.preview.openImageFromCanvas(this.state.left.imageCanvas);
                    }
                    this.inspectUI.update();
                }
                break;
        }

        viewersToReset.forEach(viewer => {
            setTimeout(() => {
                // v.forceRedraw();
                viewer.viewport.goHome(false);
            }, 100);
        });
    }

    async handleImageSelect(e, side) {
        const firstFile = e.target.files[0];
        if (!firstFile) return;
        this.state[side].filename = firstFile.name;

        console.log(`Loading ${side} image...`);
        try {
            const imageCanvas = await loadImageCanvas(firstFile);

            this.state[side].imageCanvas = imageCanvas;
            this.state[side].ogImageCanvas = imageCanvas;
            this.viewers[side].openImageFromCanvas(imageCanvas);

            if (this.preprocessingUI.imageTarget.value == side) {
                this.viewers.preprocessing.openImageFromCanvas(imageCanvas);
                this.preprocessingUI.toggleMessage(false);
            }
            if (this.state.left.imageCanvas && this.state.right.imageCanvas) {
                this.matchingUI.detectBtn.disabled = false;
            }
        } catch (err) {
            console.error(err);
            this.updateStatus("Error loading image.");
        }
    }

    async handleMetadataSelect(e, side) {
        const firstFile = e.target.files[0];
        if (!firstFile) return;

        try {
            const text = await firstFile.text();
            const data = JSON.parse(text);

            // state[side].metadata = data;

            this.logNexusMetadata(data, side);
        } catch (err) {
            console.error(`Error parsing JSON for ${side}:`, err);
            this.updateStatus(`Error loading ${side} JSON.`);
        }
    }

    logNexusMetadata(data, side) {
        if (!data.nx_meta) {
            console.warn(`[${side}] 'nx_meta' key not found in JSON.`);
            return;
        }

        const meta = data.nx_meta;
        // Note: The degree symbol is \u00b0
        const rotation = meta["Scan Rotation (\u00b0)"];
        const pxHeight = meta["Pixel Height (nm)"];
        const pxWidth = meta["Pixel Width (nm)"];

        console.group(`Metadata Loaded: ${side.toUpperCase()}`);
        console.log(`Scan Rotation: ${rotation}°`);
        console.log(`Pixel Height:  ${pxHeight} nm`);
        console.log(`Pixel Width:   ${pxWidth} nm`);
        console.groupEnd();

        this.updateStatus(`${side} metadata loaded to console.`);
    }

    async handleImportMatching(e) {
        const firstFile = e.target.files[0];
        if (!firstFile) return;

        e.target.value = ''; // Reset input

        let data = null;
        try {
            const text = await firstFile.text();
            data = JSON.parse(text);
        } catch (err) {
            console.error(`Error parsing JSON:`, err);
            this.updateStatus(`Error loading JSON.`);
            return;
        }

        if (data && data.matches) {
            try {
                this.state.features.reset();
                this.viewers.left.viewer.clearOverlays();
                this.viewers.right.viewer.clearOverlays();

                if (data.metadata && data.metadata.matching === "manual") {
                    console.log("Importing Manual Matches...");
                    this.setMode("manual");

                    for (const m of data.matches) {
                        if (m.left) this.matchingUI.addManualKeyPoint("left", m.left.x, m.left.y);
                        if (m.right) this.matchingUI.addManualKeyPoint("right", m.right.x, m.right.y);
                    }
                    this.updateStatus(`Imported ${data.matches.length} manual matches.`);

                } else {
                    console.log("Importing Automatic Matches...");
                    this.setMode("automatic");

                    const leftKPs = [];
                    const rightKPs = [];
                    const matches = [];

                    data.matches.forEach((m, i) => {
                        const kpL = new KeyPoint(m.left.x, m.left.y, 10);
                        kpL.setProperty("isMatched", true);
                        const kpR = new KeyPoint(m.right.x, m.right.y, 10);
                        kpR.setProperty("isMatched", true);

                        const lIndex = leftKPs.push(kpL) - 1;
                        const rIndex = rightKPs.push(kpR) - 1;

                        matches.push(new Match(lIndex, rIndex, 0));
                    });

                    this.state.features.keyPoints.left = leftKPs;
                    this.state.features.keyPoints.right = rightKPs;
                    this.state.features.matches = matches;

                    this.viewers.left.requestRedraw(this.state.features.keyPoints.left);
                    this.viewers.right.requestRedraw(this.state.features.keyPoints.right);

                    this.matchingUI.filterBtn.disabled = false;

                    this.updateStatus(`Imported ${matches.length} automatic matches.`);
                }

            } catch (err) {
                console.error("Import failed:", err);
                alert("Import Failed");
            }
        }
    }

    handleExportMatching() {
        const features = this.state.features;
        const matches = features.matches;

        if (!matches || matches.length === 0) {
            alert("No matches to export.");
            return;
        }

        // Metadata
        // We use the filenames stored in state
        const leftName = this.state.left.filename || "left_image";
        const rightName = this.state.right.filename || "right_image";

        // Determine matching type based on current mode or algorithm used
        let matchingType = "manual";
        if (this.state.mode === "automatic") {
            // If automatic, try to grab the algo name from the UI, otherwise default to "automatic"
            const algoSelect = document.getElementById("algo-select");
            matchingType = algoSelect ? algoSelect.value : "automatic";
        }

        const exportData = {
            metadata: {
                leftImage: leftName,
                rightImage: rightName,
                matching: matchingType,
                exportDate: new Date().toISOString()
            },
            matches: []
        };

        // Construct Matches Array
        // We iterate through the matches array to preserve the pairing order
        matches.forEach((match, index) => {
            const matchObj = {
                id: index,
                left: null,
                right: null
            };

            if (match.leftIdx !== -1) {
                const kp = features.keyPoints.left[match.leftIdx];
                if (kp) {
                    matchObj.left = { x: kp.x, y: kp.y };
                }
            }

            if (match.rightIdx !== -1) {
                const kp = features.keyPoints.right[match.rightIdx];
                if (kp) {
                    matchObj.right = { x: kp.x, y: kp.y };
                }
            }

            exportData.matches.push(matchObj);
        });

        // Trigger Download
        try {
            const jsonStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            // Generate a filename: "left_vs_right-method.json"
            const lBase = leftName.substring(0, leftName.lastIndexOf('.')) || leftName;
            const rBase = rightName.substring(0, rightName.lastIndexOf('.')) || rightName;
            const filename = `${lBase}_vs_${rBase}-${matchingType}.json`;

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.updateStatus(`Exported ${matches.length} matches to ${filename}`);

        } catch (e) {
            console.error("Export failed:", e);
            this.updateStatus("Error exporting matching.");
        }
    }

    async loadHelpContent() {
        try {
            const response = await fetch('help.html');
            if (!response.ok) throw new Error("Network response was not ok");
            const htmlText = await response.text();
            document.getElementById("help-content-container").innerHTML = htmlText;
        } catch (error) {
            console.error("Failed to load help file:", error);
            document.getElementById("help-content-container").innerHTML =
                "<p style='color: #ff5252;'>Error loading help content. Please check the console.</p>";
        }
    }

    handleReset() {
        console.log("Resetting Application...");

        this.state.left.imageCanvas = null;
        this.state.left.ogImageCanvas = null;
        this.state.left.filename = null;

        this.state.right.imageCanvas = null;
        this.state.right.ogImageCanvas = null;
        this.state.right.filename = null;

        this.state.transform = null;

        this.state.features.reset();

        document.getElementById("input-left-img").value = "";
        document.getElementById("input-right-img").value = "";
        document.getElementById("input-left-meta").value = "";
        document.getElementById("input-right-meta").value = "";
        document.getElementById("input-import-matching").value = "";

        Object.values(this.viewers).forEach(wrapper => {
            if (wrapper && wrapper.viewer) {
                wrapper.viewer.close();         // Removes the image
                wrapper.viewer.clearOverlays(); // Removes markers

                if (wrapper.ctx) {
                    wrapper.ctx.clearRect(0, 0, wrapper.canvas.width, wrapper.canvas.height);
                }
            }
        });

        this.preprocessingUI.resetUI();
        this.matchingUI.resetUI();
        this.inspectUI.resetUI();

        this.setMode("manual");
        this.openTab("matching");

        this.updateStatus("Application reset.");
    }
}

async function initApp() {
    // Check if OpenCV is already ready (in case it loaded faster than DOM)

    console.log("Dom loaded.")

    if (!window.cvReady) {
        console.log("Waiting for OpenCV...");
        await new Promise(resolve => document.addEventListener('opencv-ready', resolve));
    }

    console.log("OpenCV is ready. Initializing App...");
    const app = new App();
}

document.addEventListener("DOMContentLoaded", initApp);
