import { FeaturesEvents, detectFeatures, matchFeatures, filterMatchesRANSAC } from "./features.js"
import { KeypointsTable } from "./components/KeypointsTable.js";
import { MatchingLinesCanvas } from "./components/MatchingLinesCanvas.js";

const PARAM_DEFINITIONS = {
    'ORB': [
        { id: 'nFeatures', label: 'Feature Limit', type: 'range', min: 100, max: 5000, value: 500, step: 100 }
    ],
    'AKAZE': [
        { id: 'threshold', label: 'Threshold', type: 'range', min: 0.001, max: 0.02, value: 0.002, step: 0.0002 }
    ],
    'BRISK': [
        { id: 'thresh', label: 'Threshold', type: 'range', min: 10, max: 100, value: 30, step: 5 }
    ],
    'SIFT': [
        { id: 'nFeatures', label: 'Features (0=All)', type: 'range', min: 0, max: 2000, value: 0, step: 100 },
        { id: 'contrastThreshold', label: 'Contrast Thresh', type: 'range', min: 0.01, max: 0.1, value: 0.04, step: 0.01 },
        { id: 'edgeThreshold', label: 'Edge Thresh', type: 'range', min: 1, max: 20, value: 10, step: 1 }
    ],
    'SURF': [
        { id: 'hessianThreshold', label: 'Hessian Thresh', type: 'range', min: 100, max: 5000, value: 400, step: 100 },
        { id: 'nOctaves', label: 'Octaves', type: 'range', min: 3, max: 7, value: 4, step: 1 }
    ]
};

export const ManualTool = Object.freeze({
    PLACE:   'Place',
    EDIT:   'Edit',
    DELETE: 'Delete'
});

export class MatchingUIManager {
    constructor(state, leftViewer, rightViewer) {
        this.state = state;
        this.left = leftViewer;
        this.right = rightViewer;

        // Map: ID (string) -> Index (number)
        this.idMap = {
            left: new Map(),
            right: new Map()
        };

        // Manual UI
        this.placeRadio = document.getElementById("tool-place");
        this.editRadio = document.getElementById("tool-edit");
        this.removeRadio = document.getElementById("tool-remove");
        this.clearBtn = document.getElementById("tool-clear");
        this.showIdsCheckbox = document.getElementById("toggle-ids");

        // KeyPoint table Component
        this.showTableCheckbox = document.getElementById("toggle-table");
        this.tableContainer = document.getElementById("keypoints-table-container");
        this.keypointsTable = new KeypointsTable(
            this.tableContainer,
            this.state.features,
            (leftKP, rightKP) => this.handleRowSelection(leftKP, rightKP)
        );

        // Matching Line Canvas Component
        this.canvasEl = document.getElementById("match-lines-canvas");
        this.linesComponent = new MatchingLinesCanvas(
            this.canvasEl,
            this.state.features,
            this.left,
            this.right
        );

        this.currentManualTool = null;

        // Automatic UI
        this.algoSelect = document.getElementById("algo-select");
        this.lastSelectedAlgo = this.algoSelect.value;
        this.algoParamsContainer = document.getElementById("dynamic-params");
        this.detectBtn = document.getElementById("detect-btn");
        this.matchBtn = document.getElementById("match-btn");
        this.filterBtn = document.getElementById("filter-btn");
        this.autoClearBtn = document.getElementById("auto-clear-btn");


        // Bind logic
        this.state.features.subscribe((event) => {
            this.handleFeatureEvent(event);
        });
    }

    switchToMode(mode) {

        switch (mode) {
            case "manual":
                this.selectManualTool(ManualTool.PLACE);
                this.addClickHandler();
                this.left.removeCanvas();
                this.right.removeCanvas();
                this.left.drawData = null;
                this.right.drawData = null;
                this.state.features.reset()
                break;
            case "automatic":
                this.removeClickHandler();
                this.left.setupCanvas();
                this.right.setupCanvas();
                this.state.features.reset();
                this.left.viewer.clearOverlays();
                this.right.viewer.clearOverlays();
                break;
        }

        if (this.linesComponent.isEnabled) {
            this.linesComponent.requestRedraw();
        }
    }

    selectManualTool(tool) {
        switch (tool) {
            case ManualTool.PLACE:
                this.setManualTool(ManualTool.PLACE);
                this.placeRadio.checked = true;
                // this.placeRadio.dispatchEvent(new Event('change'));
                break;
            case ManualTool.EDIT:
                this.setManualTool(ManualTool.EDIT);
                this.editRadio.checked = true;
                // this.editRadio.dispatchEvent(new Event('change'));
                break;
            case ManualTool.DELETE:
                this.setManualTool(ManualTool.DELETE);
                this.removeRadio.checked = true;
                break;
            default:
                break;
        }
    }

    setManualTool(tool) {
        const waitSide = this.state.features.waitingForSide;
        if (tool === ManualTool.DELETE && waitSide !== null) {
            alert(`Please complete the matching by placing the missing ${waitSide} keypoint before using the Remove tool.`);
            this.placeRadio.checked = true;
            return;
        }

        console.log(`Manual tool set to ${tool}`);
        this.currentManualTool = tool;
    }

    setupUI() {

        // Manual UI
        this.placeRadio.addEventListener("change", () => this.setManualTool(ManualTool.PLACE));
        this.editRadio.addEventListener("change", () => this.setManualTool(ManualTool.EDIT));
        this.removeRadio.addEventListener("change", () => this.setManualTool(ManualTool.DELETE));
        this.clearBtn.addEventListener("click", () => {
            this.state.features.reset();
            this.left.viewer.clearOverlays();
            this.right.viewer.clearOverlays();
            console.log("Features have been reset.")
        })

        this.showIdsCheckbox.addEventListener("change", (e) => {
            const matchingTab = document.getElementById("matching");
            if (e.target.checked) {
                matchingTab.classList.add("show-labels-active");
            } else {
                matchingTab.classList.remove("show-labels-active");
            }
        });

        this.showTableCheckbox.addEventListener("change", (e) => {
            if (e.target.checked) {
                this.tableContainer.classList.remove("hidden");
            } else {
                this.tableContainer.classList.add("hidden");
            }
            // setTimeout(() => {
            //     if (this.left && this.left.viewer) this.left.viewer.viewport.resize();
            //     if (this.right && this.right.viewer) this.right.viewer.viewport.resize();
            //     if (this.left && this.left.resizeCanvas) this.left.resizeCanvas();
            //     if (this.right && this.right.resizeCanvas) this.right.resizeCanvas();
            //     if (this.left && this.left.viewer) this.left.viewer.viewport.goHome(false);
            //     if (this.right && this.right.viewer) this.right.viewer.viewport.goHome(false);
            // }, 50);
        });

        // Automatic UI
        this.algoSelect.addEventListener('change', (e) => {
            const hasFeatures = this.state.features.keyPoints.left.length > 0 ||
                                this.state.features.keyPoints.right.length > 0;

            if (hasFeatures) {
                const confirmClear = confirm(
                    "You cannot change the algorithm while features exist.\n\n" +
                    "Click 'OK' to CLEAR existing features and switch algorithms, or 'Cancel' to abort."
                );

                if (confirmClear) {
                    this.state.features.reset();

                    this.left.requestRedraw(this.state.features.keyPoints.left);
                    this.right.requestRedraw(this.state.features.keyPoints.right);
                    if (this.areLinesEnabled) this.requestLineRedraw();

                    this.matchBtn.disabled = true;
                    this.filterBtn.disabled = true;
                    if (this.state.left.imageCanvas && this.state.right.imageCanvas) {
                        this.detectBtn.disabled = false;
                    }

                    console.log("Features cleared due to algorithm change.");
                } else {
                    this.algoSelect.value = this.lastSelectedAlgo;
                    return;
                }
            }

            this.lastSelectedAlgo = e.target.value;
            this.renderAlgoParams(e.target.value);
        });

        this.detectBtn.addEventListener('click', () => {
            const algo = this.algoSelect.value;
            const params = this.getParams();

            setTimeout(() => {
                try {
                    const res1 = detectFeatures(this.state.left.imageCanvas, algo, params);
                    this.state.features.clearKeyPointsAndDescriptors('left');
                    this.state.features.setKeyPointsFromOpenCV("left", res1.keypoints);
                    this.state.features.descriptors.left = res1.descriptors;

                    const res2 = detectFeatures(this.state.right.imageCanvas, algo, params);
                    this.state.features.clearKeyPointsAndDescriptors('right');
                    this.state.features.setKeyPointsFromOpenCV("right", res2.keypoints);
                    this.state.features.descriptors.right = res2.descriptors;

                    this.left.requestRedraw(this.state.features.keyPoints["left"]);
                    this.right.requestRedraw(this.state.features.keyPoints["right"]);

                    this.matchBtn.disabled = false;
                    this.detectBtn.disabled = true;
                    console.log(`Left: ${res1.keypoints.size()}, Right: ${res2.keypoints.size()}`);

                } catch (e) {
                    console.log("Error: " + e);
                }
            }, 50);

        });

        this.matchBtn.addEventListener('click', () => {
            console.log("Matching by descriptors...");

            // this.state.left.viewer.clearOverlays();
            // this.state.right.viewer.clearOverlays();
            // lineDrawer.clear();

            // const matchLimit = parseInt(sliderMatchLimit.value) || 200;
            const matchLimit = 200;

            setTimeout(() => {
                try {
                    const leftDescriptors = this.state.features.descriptors.left;
                    const rightDescriptors = this.state.features.descriptors.right;
                    const matches = matchFeatures(leftDescriptors, rightDescriptors, matchLimit);

                    if (matches.size() === 0) {
                        console.log("No matches found.");
                        return;
                    }

                    // Convert to Array
                    this.state.features.setMatchesFromOpenCV(matches);
                    matches.delete()

                    this.left.requestRedraw(this.state.features.keyPoints.left);
                    this.right.requestRedraw(this.state.features.keyPoints.right);

                    console.log(`Found ${this.state.features.matches.length} raw candidates.`);

                    if(this.areLinesEnabled) this.requestLineRedraw();

                    this.filterBtn.disabled = false;
                    this.matchBtn.disabled = true;

                } catch (e) {
                    console.log("Error: " + e);
                    console.log(e);
                }
            }, 50);
        });

        this.filterBtn.addEventListener('click', () => {
            if (!this.state.features.matches.length) return;
            console.log("Filtering with RANSAC...");

            const candidateLimit = 100;

            setTimeout(() => {
                try {

                    // Initial Sort by Descriptor Distance (Appearance)
                    this.state.features.matches.sort((a, b) => a.distance - b.distance);

                    // Take top candidates
                    const candidates = this.state.features.matches.slice(0, candidateLimit);

                    const goodMatches = filterMatchesRANSAC(
                        candidates,
                        this.state.features.keyPoints.left,
                        this.state.features.keyPoints.right
                    );

                    this.state.features.matches = goodMatches;

                    this.state.features.keyPoints.left.forEach(kp => kp.setProperty("isGoodMatch", false));
                    this.state.features.keyPoints.right.forEach(kp => kp.setProperty("isGoodMatch", false));

                    // Tag the new good matches
                    goodMatches.forEach(match => {
                        this.state.features.keyPoints.left[match.leftIdx].setProperty("isGoodMatch", true);
                        this.state.features.keyPoints.right[match.rightIdx].setProperty("isGoodMatch", true);
                    });

                    if(this.areLinesEnabled) this.requestLineRedraw();

                    this.left.requestRedraw(this.state.features.keyPoints.left);
                    this.right.requestRedraw(this.state.features.keyPoints.right);

                    this.filterBtn.disabled = true;

                    console.log(`Filtered ${goodMatches.length} / ${candidates.length} matches.`);

                } catch (e) {
                    console.log("Filtering Error.");
                    console.log(e);
                }
            }, 50);
        });

        this.autoClearBtn.addEventListener('click', () => {
            this.state.features.reset();

            this.left.requestRedraw(this.state.features.keyPoints.left);
            this.right.requestRedraw(this.state.features.keyPoints.right);

            if (this.areLinesEnabled) this.requestLineRedraw();

            this.matchBtn.disabled = true;
            this.filterBtn.disabled = true;

            if (this.state.left.imageCanvas && this.state.right.imageCanvas) {
                this.detectBtn.disabled = false;
            }

            console.log("Automatic features cleared.");
        });
    }

    initUI() {
        this.renderAlgoParams(this.algoSelect.value);
        this.selectManualTool(ManualTool.PLACE);
        this.matchBtn.disabled = true;
        this.filterBtn.disabled = true;
        this.showIdsCheckbox.checked = true;
        this.showIdsCheckbox.dispatchEvent(new Event('change'));
    }

    resetUI() {
        this.detectBtn.disabled = true;
        this.matchBtn.disabled = true;
        this.filterBtn.disabled = true;

        this.algoSelect.selectedIndex = 0;
        this.lastSelectedAlgo = this.algoSelect.value;
        this.renderAlgoParams(this.algoSelect.value);

        this.selectManualTool(ManualTool.PLACE);

        this.idMap.left.clear();
        this.idMap.right.clear();
    }

    // layoutChanged() {
    //     // Only resize OSD viewport if an image is actually loaded
    //     if (this.left && this.left.viewer && this.left.viewer.world.getItemCount() > 0) {
    //         this.left.viewer.viewport.resize();
    //     }
    //     if (this.right && this.right.viewer && this.right.viewer.world.getItemCount() > 0) {
    //         this.right.viewer.viewport.resize();
    //     }
    //     this.resizeCanvas();
    // }

    handleFeatureEvent(event) {
        switch (event.type) {
            case FeaturesEvents.KEYPOINT_REMOVED:
                this.deleteKeyPointFromIdMap(event.side, event.index);
                break;
            case FeaturesEvents.RESET:
                this.idMap.left.clear();
                this.idMap.right.clear();
                break;
            case FeaturesEvents.KEYPOINT_ADDED:
                break;
            case FeaturesEvents.KEYPOINT_UPDATED:
                break;
        }
    }

    /**
     * Handles the manual/interactive keypoint creation
     * Adds State update, DOM creation, OSD Overlay placement, and Drag events.
     * @param {string} side - "left" or "right"
     * @param {number} x - Image coordinate X
     * @param {number} y - Image coordinate Y
     */
    addManualKeyPoint(side, x, y) {

        let index = null;
        try {
            index = this.state.features.addKeyPoint(side, x, y);
        } catch (e) {
            console.warn(e.message);
            alert(e.message);
            return;
        }

        if (index === null) return;

        // TODO: Use directly the viewer and refactor onViewerClick accordingly
        const viewerWrapper = side === 'left' ? this.left : this.right;
        const viewer = viewerWrapper.viewer;

        const elementID = `marker-${side}-${index}`;
        this.idMap[side].set(elementID, index);
        const elt = this.createMarkerElement(side, elementID, index);

        // Convert Image Coordinates -> Viewport Coordinates for OSD placement
        const point = new OpenSeadragon.Point(x, y)
        const viewportPoint = viewer.viewport.imageToViewportCoordinates(point);

        viewer.addOverlay({
            element: elt,
            location: viewportPoint
        });

        new OpenSeadragon.MouseTracker({
            element: elt,
            dragHandler: (e) => this.handleDrag(e, viewerWrapper, elementID, elt)
        });

        console.log(`Added ${side} marker (index: ${index}, id: ${elementID})`);
    }

    onViewerClick({ position, side, viewerWrapper }) {
        if (this.currentManualTool !== ManualTool.PLACE) return;

        const viewer = viewerWrapper.viewer;

        // Convert Screen Pixels -> Viewport -> Image Coordinates
        const viewportPoint = viewer.viewport.pointFromPixel(position);
        const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);

        // Delegate to the shared method
        this.addManualKeyPoint(side, imagePoint.x, imagePoint.y);
    }

    createMarkerElement(side, id, index) {

        const elt = document.createElement("div");
        elt.id = id;
        elt.className = `marker marker-${side}`;

        const centerDot = document.createElement("div");
        centerDot.className = "marker-center";
        elt.appendChild(centerDot);

        const label = document.createElement("div");
        label.className = "marker-label";
        label.innerText = `ID: ${index}`;
        elt.appendChild(label);

        elt.onclick = (e) => {
            if (this.currentManualTool === ManualTool.DELETE) {
                e.stopPropagation();
                const currentIndex = this.idMap[side].get(id);
                if (currentIndex !== undefined) {
                    this.state.features.removeKeyPoint(side, currentIndex);
                }
            }
        }
        return elt;
    }

    handleDrag(event, viewerWrapper, id, element) {
        if (this.currentManualTool !== ManualTool.EDIT) return;

        const viewer = viewerWrapper.viewer;
        const side = viewerWrapper.side;

        const deltaPoints = viewer.viewport.deltaPointsFromPixels(event.delta);
        const overlay = viewer.getOverlayById(element);
        const newViewportPos = overlay.location.plus(deltaPoints);

        viewer.updateOverlay(element, newViewportPos);

        if (!this.updatePending) {
            this.updatePending = true;
            requestAnimationFrame(() => {
                const newImgPos = viewer.viewport.viewportToImageCoordinates(newViewportPos);
                const index = this.idMap[side].get(id);
                if (index !== undefined) {
                    this.state.features.updateKeyPoint(side, index, newImgPos.x, newImgPos.y);
                }
                this.updatePending = false;
            });
        }
    }

    /**
     * Removes the mapping for the deleted index and decrements
     * all indices greater than the deleted one.
     */
    deleteKeyPointFromIdMap(side, removedIndex) {
        const map = this.idMap[side];
        let idToRemove = null;
        const idsToUpdate = [];

        // 1. First Pass: Identify the ID to remove and IDs to update
        for (const [id, index] of map.entries()) {
            if (index === removedIndex) {
                idToRemove = id;
            } else if (index > removedIndex) {
                idsToUpdate.push(id);
            }
        }

        // 2. Apply Updates
        idsToUpdate.forEach(id => {
            const currentIndex = map.get(id);
            const newIndex = currentIndex - 1;
            map.set(id, newIndex);

            // Update marker label
            const el = document.getElementById(id);
            if (el) {
                const label = el.querySelector('.marker-label');
                if (label) label.innerText = `ID: ${newIndex}`;
            }
        });

        // 3. Remove the specific entry and DOM element
        if (idToRemove) {
            map.delete(idToRemove);

            const viewer = side === 'left' ? this.left.viewer : this.right.viewer;
            const el = document.getElementById(idToRemove);

            if (el) {
                viewer.removeOverlay(el);
                el.remove();
            }
        }
    }

    addClickHandler() {
        this.left.bindClick((data) => this.onViewerClick(data));
        this.right.bindClick((data) => this.onViewerClick(data));
    }

    removeClickHandler() {
        this.left.unbindClick();
        this.right.unbindClick();
    }

    handleRowSelection(leftKP, rightKP) {
        if (leftKP) {
            const imgPoint = new OpenSeadragon.Point(leftKP.x, leftKP.y);
            const vpPoint = this.left.viewer.viewport.imageToViewportCoordinates(imgPoint);
            this.left.viewer.viewport.panTo(vpPoint);
        }

        if (rightKP) {
            const imgPoint = new OpenSeadragon.Point(rightKP.x, rightKP.y);
            const vpPoint = this.right.viewer.viewport.imageToViewportCoordinates(imgPoint);
            this.right.viewer.viewport.panTo(vpPoint);
        }
    }

    renderAlgoParams(algo) {
        this.algoParamsContainer.innerHTML = '';
        const defs = PARAM_DEFINITIONS[algo] || [];

        defs.forEach(def => {
            const row = document.createElement('div');
            row.className = 'param-row';

            const input = document.createElement('input');
            input.type = def.type;
            input.id = `param-${def.id}`;
            input.min = def.min;
            input.max = def.max;
            input.value = def.value;
            input.step = def.step;

            const label = document.createElement('label');
            label.innerText = `${def.label}: ${def.value}`;
            label.htmlFor = input.id;

            input.addEventListener('input', () => {
                label.innerText = `${def.label}: ${input.value}`;
            });

            row.appendChild(label);
            row.appendChild(input);
            this.algoParamsContainer.appendChild(row);
        });
    }

    getParams() {
        const algo = this.algoSelect.value;
        const defs = PARAM_DEFINITIONS[algo];
        const values = {};
        defs.forEach(def => {
            const val = document.getElementById(`param-${def.id}`).value;
            values[def.id] = val;
        });
        return values;
    }

    toggleMatchingLines(isEnabled) {
        this.linesComponent.toggle(isEnabled);
    }

}