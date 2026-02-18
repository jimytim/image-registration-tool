import { FeaturesEvents } from "../features.js";

export class MatchingLinesCanvas {
    /**
     * @param {HTMLCanvasElement} canvasElement - The canvas DOM element
     * @param {Features} featuresState - The shared features state object
     * @param {MatchingOSDViewer} leftViewerWrapper - Wrapper for the left OSD viewer
     * @param {MatchingOSDViewer} rightViewerWrapper - Wrapper for the right OSD viewer
     */
    constructor(canvasElement, featuresState, leftViewerWrapper, rightViewerWrapper) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext("2d");
        this.features = featuresState;
        this.leftWrapper = leftViewerWrapper;
        this.rightWrapper = rightViewerWrapper;

        this.isEnabled = false;
        this.isRedrawPending = false;

        // Bind methods to 'this' for event listeners
        this.boundDraw = this.draw.bind(this);
        this.boundResize = this.resize.bind(this);

        this.init();
    }

    init() {
        // 1. Subscribe to Feature changes (Data Model)
        this.unsubscribeFeatures = this.features.subscribe((event) => {
            if (this.isEnabled) this.requestRedraw();
        });

        // 2. Subscribe to Viewer changes (Pan/Zoom/Animation)
        const viewers = [this.leftWrapper.viewer, this.rightWrapper.viewer];
        viewers.forEach(v => {
            v.addHandler('update-viewport', () => {
                if (this.isEnabled) this.requestRedraw();
            });
            v.addHandler('animation', () => {
                if (this.isEnabled) this.requestRedraw();
            });
            v.addHandler('resize', this.boundResize);
        });

        // 3. Subscribe to Container Resizing (Layout)
        this.resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    this.resize();
                }
            }
        });

        if (this.canvas.parentElement) {
            this.resizeObserver.observe(this.canvas.parentElement);
        }
    }

    toggle(isEnabled) {
        this.isEnabled = isEnabled;
        if (isEnabled) {
            this.canvas.classList.remove("hidden");
            this.resize(); // Ensure size is correct before drawing
            this.requestRedraw();
        } else {
            this.canvas.classList.add("hidden");
            this.clear();
        }
    }

    resize() {
        if (!this.canvas || !this.canvas.parentElement) return;

        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        // Scale context to match device pixel ratio
        this.ctx.scale(dpr, dpr);

        if (this.isEnabled) this.requestRedraw();
    }

    clear() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to clear absolute pixels
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    }

    requestRedraw() {
        if (!this.isRedrawPending) {
            this.isRedrawPending = true;
            requestAnimationFrame(this.boundDraw);
        }
    }

    draw() {
        this.isRedrawPending = false;
        if (!this.isEnabled || !this.ctx) return;

        // Clear previous frame
        const logicalWidth = this.canvas.width / (window.devicePixelRatio || 1);
        const logicalHeight = this.canvas.height / (window.devicePixelRatio || 1);
        this.ctx.clearRect(0, 0, logicalWidth, logicalHeight);

        const matches = this.features.matches;
        if (!matches || matches.length === 0) return;

        // Access raw OSD viewers for coordinate conversion
        const leftOSD = this.leftWrapper.viewer;
        const rightOSD = this.rightWrapper.viewer;

        // Calculate offsets relative to the canvas
        const canvasRect = this.canvas.getBoundingClientRect();
        const leftRect = leftOSD.element.getBoundingClientRect();
        const rightRect = rightOSD.element.getBoundingClientRect();

        const leftOffsetX = leftRect.left - canvasRect.left;
        const leftOffsetY = leftRect.top - canvasRect.top;
        const rightOffsetX = rightRect.left - canvasRect.left;
        const rightOffsetY = rightRect.top - canvasRect.top;

        this.ctx.beginPath();
        this.ctx.strokeStyle = "rgb(0, 85, 255)"; // Blue
        this.ctx.lineWidth = 1.5;

        matches.forEach(match => {
            if (match.leftIdx === -1 || match.rightIdx === -1) return;

            const kpLeft = this.features.keyPoints.left[match.leftIdx];
            const kpRight = this.features.keyPoints.right[match.rightIdx];

            if (!kpLeft || !kpRight) return;

            // 1. Image Coordinates -> Viewport Coordinates
            const vpLeft = leftOSD.viewport.imageToViewportCoordinates(kpLeft.x, kpLeft.y);
            const vpRight = rightOSD.viewport.imageToViewportCoordinates(kpRight.x, kpRight.y);

            // 2. Viewport Coordinates -> OSD Element Pixels
            const elLeft = leftOSD.viewport.viewportToViewerElementCoordinates(vpLeft);
            const elRight = rightOSD.viewport.viewportToViewerElementCoordinates(vpRight);

            // 3. Add offsets to get Canvas Coordinates
            const x1 = elLeft.x + leftOffsetX;
            const y1 = elLeft.y + leftOffsetY;
            const x2 = elRight.x + rightOffsetX;
            const y2 = elRight.y + rightOffsetY;

            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
        });

        this.ctx.stroke();
    }
}