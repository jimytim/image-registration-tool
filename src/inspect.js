import { calculateSimilarity } from "./compute.js";

export class InspectUIManager {
    constructor(state, previewViewer, errorViewer) {
        this.state = state;
        this.previewViewer = previewViewer; // OSDViewer instance
        this.errorViewer = errorViewer;     // OSDViewer instance

        this.previewRenderer = new PreviewRenderer(previewViewer);
        this.errorRenderer = new ErrorFieldRenderer(this.errorViewer.viewer);
    }

    initUI() {
        this.setupErrorControls();
    }

    resetUI() {
        this.previewRenderer.clear();
        this.errorRenderer.clear();

        this.previewRenderer.rightImageItem = null;
        this.previewRenderer.currentRightCanvas = null;
        this.previewRenderer.lastRenderData = null;

        this.errorRenderer.lastData = null;
    }

    /**
     * Main update loop for the inspection tab.
     * Calculates the transform based on current matches and updates visualizations.
     */
    update() {

        const pairs = this.getResolvedPairs();

        if (pairs.length < 3) {
            console.warn("Need at least 3 pairs to calculate transformation.");
            this.previewRenderer.clear();
            this.errorRenderer.clear();
            return;
        }

        const transform = calculateSimilarity(pairs);
        this.state.transform = transform;

        const leftCanvas = this.state.left.imageCanvas;
        const rightCanvas = this.state.right.imageCanvas;

        if (leftCanvas && rightCanvas) {
            // Ensure the background image is loaded
            if (this.errorViewer.viewer.world.getItemCount() === 0) {
               this.errorViewer.openImageFromCanvas(leftCanvas);
            }

            this.previewRenderer.update(rightCanvas, pairs, transform);
            this.errorRenderer.update(pairs, transform);
        }
    }

    getResolvedPairs() {
        const features = this.state.features;
        const pairs = [];

        features.matches.forEach(match => {
            // Only consider valid matches
            if (match.leftIdx !== -1 && match.rightIdx !== -1) {
                const kpL = features.keyPoints.left[match.leftIdx];
                const kpR = features.keyPoints.right[match.rightIdx];

                // If we are in auto mode, check if it's a "Good Match" (RANSAC inlier)
                // If manual, we assume all matches are good.
                let isValid = true;
                if (kpL.data && kpL.data.hasOwnProperty('isGoodMatch')) {
                    isValid = kpL.data.isGoodMatch;
                }

                if (isValid) {
                    pairs.push({
                        left: { x: kpL.x, y: kpL.y },
                        right: { x: kpR.x, y: kpR.y }
                    });
                }
            }
        });
        return pairs;
    }

    setupErrorControls() {
        const bind = (id, key, val, isMult = false) => {
            const btn = document.getElementById(id);
            if(btn) {
                btn.onclick = (e) => {
                    e.stopPropagation(); // Prevent OSD click/drag
                    const current = this.errorRenderer.settings[key];
                    this.errorRenderer.updateSettings(key, isMult ? current * val : current + val);
                };
            }
        };

        bind("err-spacing-inc", "spacing", -5);
        bind("err-spacing-dec", "spacing", 5);
        bind("err-scale-inc", "scaleFactor", 1.5, true);
        bind("err-scale-dec", "scaleFactor", 1/1.5, true);
        bind("err-width-inc", "lineWidth", 1);
        bind("err-width-dec", "lineWidth", -1);
    }
}

/**
 * Renders the Right image transformed onto the Left image.
 */
class PreviewRenderer {
    constructor(osdViewerWrapper) {
        this.osdWrapper = osdViewerWrapper;
        this.viewer = osdViewerWrapper.viewer;
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");

        // Object.assign(this.canvas.style, {
        //     position: "absolute", top: "0", left: "0",
        //     width: "100%", height: "100%",
        //     pointerEvents: "none"
        // });

        this.canvas.style.position = "absolute";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.pointerEvents = "none";

        this.viewer.canvas.appendChild(this.canvas);

        this.rightImageItem = null;
        this.currentRightCanvas = null; // To track if we need to replace the image
        this.lastRenderData = null; // Store data for redraws

        // Events
        this.viewer.addHandler("update-viewport", () => this.drawOverlays());
        this.viewer.addHandler("resize", () => this.drawOverlays());
        this.viewer.addHandler("open", () => this.drawOverlays());
    }

    clear() {
        this.lastData = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    update(rightCanvas, pairs, transform) {
        this.lastRenderData = { pairs, transform };

        if (rightCanvas !== this.currentRightCanvas) {
            this.replaceRightImage(rightCanvas, transform);
        } else if (this.rightImageItem) {
            this.applyTransformToItem(this.rightImageItem, transform);
        }

        this.drawOverlays();
    }

    async replaceRightImage(canvas, transform) {

        if (this.rightImageItem) {
            this.viewer.world.removeItem(this.rightImageItem);
            this.rightImageItem = null;
        }

        if (!canvas) return;

        this.currentRightCanvas = canvas;

        try {
            this.rightImageItem = await this.osdWrapper.addLayerFromCanvas(canvas, {
                opacity: 0.6,
                compositeOperation: 'lighten'
            });

            this.applyTransformToItem(this.rightImageItem, transform);

        } catch (err) {
            console.error("Failed to add preview layer", err);
        }
    }

    applyTransformToItem(item, transform) {
        const baseItem = this.viewer.world.getItemAt(0);
        if (!baseItem) return;

        const { scale, angleDeg, tx, ty } = transform;

        // 1. Calculate Width in Viewport Coordinates
        // Base image width in viewport is usually 1 (depending on OSD setup),
        // but we should calculate relative to the content size.
        const baseWidth = baseItem.getContentSize().x;
        const rightWidth = item.getContentSize().x;

        // The scale factor 'scale' is pixel-to-pixel.
        // If base is 1000px and right is 500px, and scale is 1.0:
        // Right should be 0.5 width in viewport space (assuming base is width 1).

        // Get conversion factor: 1 Viewport Unit = baseWidth pixels
        const vpScale = 1 / baseWidth;

        const targetWidthVP = rightWidth * scale * vpScale;

        item.setWidth(targetWidthVP);
        item.setRotation(angleDeg);

        // 2. Position Correction (Pivot adjustment)
        // Canvas rotates around Top-Left (tx, ty).
        // OSD rotates around Center. We must shift the OSD position.

        const angleRad = (angleDeg * Math.PI) / 180;
        const targetHeightVP = (item.getContentSize().y / item.getContentSize().x) * targetWidthVP;

        // Vector from Top-Left to Center (Unrotated)
        const cx = targetWidthVP / 2;
        const cy = targetHeightVP / 2;

        // Rotate this vector
        const rotCx = cx * Math.cos(angleRad) - cy * Math.sin(angleRad);
        const rotCy = cx * Math.sin(angleRad) + cy * Math.cos(angleRad);

        // Convert tx, ty (Pixels) to Viewport
        // Note: tx/ty are relative to the Base Image origin (0,0)
        const originVP = baseItem.imageToViewportCoordinates(tx, ty);

        // The visual center of the image should be at Origin + RotatedCenterOffset
        const visualCenterX = originVP.x + rotCx;
        const visualCenterY = originVP.y + rotCy;

        // OSD's setPosition sets the Top-Left of the UNROTATED box.
        // So we subtract the unrotated center vector.
        const finalX = visualCenterX - cx;
        const finalY = visualCenterY - cy;

        item.setPosition(new OpenSeadragon.Point(finalX, finalY));
    }

    drawOverlays() {

        const dpr = window.devicePixelRatio || 1;
        const rect = this.viewer.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.ctx.clearRect(0, 0, rect.width, rect.height);

        if (!this.lastRenderData) return;
        const { pairs, transform } = this.lastRenderData;
        const { scale, angleDeg, tx, ty } = transform;
        const angleRad = (angleDeg * Math.PI) / 180;

        const baseItem = this.viewer.world.getItemAt(0);
        if (!baseItem) return;

        const toScreen = (x, y) => {
            const vpPt = baseItem.imageToViewportCoordinates(x, y);
            return this.viewer.viewport.pixelFromPoint(vpPt);
        };

        if (this.rightImageItem) {
            const size = this.rightImageItem.getContentSize();
            const w = size.x;
            const h = size.y;

            const corners = [
                { x: 0, y: 0 },
                { x: w, y: 0 },
                { x: w, y: h },
                { x: 0, y: h }
            ];

            this.ctx.save();
            this.ctx.strokeStyle = "yellow";
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);

            this.ctx.beginPath();
            corners.forEach((pt, i) => {
                const lx = scale * (Math.cos(angleRad) * pt.x - Math.sin(angleRad) * pt.y) + tx;
                const ly = scale * (Math.sin(angleRad) * pt.x + Math.cos(angleRad) * pt.y) + ty;
                const screenPt = toScreen(lx, ly);
                if (i === 0) this.ctx.moveTo(screenPt.x, screenPt.y);
                else this.ctx.lineTo(screenPt.x, screenPt.y);
            });
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.restore();
        }

        // Draw Markers
        pairs.forEach(pair => {
            // Left (Red)
            const ptL = toScreen(pair.left.x, pair.left.y);
            this._drawMarker(ptL, "#ff4757");

            // Right Transformed (Blue)
            // Manually transform point to match visual
            const rx = pair.right.x;
            const ry = pair.right.y;
            const tX = scale * (Math.cos(angleRad) * rx - Math.sin(angleRad) * ry) + tx;
            const tY = scale * (Math.sin(angleRad) * rx + Math.cos(angleRad) * ry) + ty;

            const ptR = toScreen(tX, tY);
            this._drawMarker(ptR, "#2e86de");
        });

        this._drawStats(transform, rect.height);
    }

    _drawStats(transform, viewerHeight) {
        const boxHeight = 75;
        const boxWidth = 220;
        const margin = 10;
        const startY = viewerHeight - boxHeight - margin;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(0,0,0,0.6)";
        this.ctx.fillRect(margin, startY, boxWidth, boxHeight);

        this.ctx.fillStyle = "white";
        this.ctx.font = "12px monospace";

        const textStartX = margin + 10;
        const textStartY = startY + 25;
        const lh = 20;

        this.ctx.fillText(`Scale: ${transform.scale.toFixed(5)}`, textStartX, textStartY);
        this.ctx.fillText(`Rotation: ${transform.angleDeg.toFixed(3)}°`, textStartX, textStartY + lh);
        this.ctx.fillText(`Trans: [${transform.tx.toFixed(1)}, ${transform.ty.toFixed(1)}]`, textStartX, textStartY + lh * 2);
        this.ctx.restore();
    }

    _drawMarker(pt, color) {
        const size = 10
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.shadowBlur = 2;
        this.ctx.shadowColor = "black";

        this.ctx.beginPath();
        this.ctx.moveTo(pt.x - size, pt.y); this.ctx.lineTo(pt.x + size, pt.y);
        this.ctx.moveTo(pt.x, pt.y - size); this.ctx.lineTo(pt.x, pt.y + size);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI);
        this.ctx.fillStyle = "white";
        this.ctx.fill();
        this.ctx.restore();
    }
}

/**
 * Renders a Vector Field showing the displacement error.
 * Adapted from 'Matching' project.
 */
class ErrorFieldRenderer {
    constructor(viewer) {
        this.viewer = viewer;
        this.settings = { spacing: 40, scaleFactor: 5, lineWidth: 1 };

        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");

        this.canvas.style.position = "absolute";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.pointerEvents = "none";

        this.viewer.canvas.appendChild(this.canvas);

        this.lastData = null;
        this.viewer.addHandler("update-viewport", () => this.render());
        this.viewer.addHandler("resize", () => this.render());
    }

    updateSettings(key, value) {
        this.settings[key] = value;
        this.render();
    }

    update(pairs, transform) {
        this.lastData = { pairs, transform };
        this.render();
    }

    clear() {
        this.lastData = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render() {
        if (!this.lastData) return;
        if (!this.viewer.world.getItemAt(0)) return;

        // const baseItem = this.viewer.world.getItemAt(0);
        // if (!baseItem) return;

        const { pairs, transform } = this.lastData;
        const { spacing, scaleFactor, lineWidth } = this.settings;
        const { scale, angleDeg, tx, ty } = transform;
        const angleRad = (angleDeg * Math.PI) / 180;

        // Resize Canvas
        const dpr = window.devicePixelRatio || 1;
        const rect = this.viewer.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);

        this.ctx.clearRect(0, 0, rect.width, rect.height);
        this.ctx.lineWidth = lineWidth;

        // Iterate over a grid in Screen Pixels
        for (let x = 0; x < rect.width; x += spacing) {
            for (let y = 0; y < rect.height; y += spacing) {

                // Convert Screen Grid Point -> Image Coordinate
                const vpPt = this.viewer.viewport.pointFromPixel(new OpenSeadragon.Point(x, y));
                const imgPt = this.viewer.viewport.viewportToImageCoordinates(vpPt);
                // const imgPt = baseItem.viewportToImageCoordinates(vpPt);

                // Inverse Distance Weighting (IDW) to interpolate error at this grid point
                let driftX = 0, driftY = 0, totalWeight = 0;

                for(const p of pairs) {
                    // Distance from grid point to known feature point
                    const dist = Math.hypot(imgPt.x - p.left.x, imgPt.y - p.left.y) + 1; // +1 avoids div/0
                    const weight = 1 / (dist * dist); // Inverse Square
                    const predX = scale * (Math.cos(angleRad) * p.right.x - Math.sin(angleRad) * p.right.y) + tx;
                    const predY = scale * (Math.sin(angleRad) * p.right.x + Math.cos(angleRad) * p.right.y) + ty;
                    driftX += (predX - p.left.x) * weight;
                    driftY += (predY - p.left.y) * weight;
                    totalWeight += weight;
                }

                if(totalWeight === 0) continue;

                const dx = (driftX / totalWeight) * scaleFactor;
                const dy = (driftY / totalWeight) * scaleFactor;
                const mag = Math.hypot(dx, dy);
                const targetX = x + dx;
                const targetY = y + dy;

                // Direction line
                this.ctx.strokeStyle = `hsl(${Math.max(0, 120 - mag * 2)}, 100%, 50%)`;
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(targetX, targetY);
                this.ctx.stroke();

                // Draw Arrowhead
                const headLength = 4 + lineWidth;
                const angle = Math.atan2(dy, dx);

                this.ctx.beginPath();
                this.ctx.moveTo(targetX, targetY);
                this.ctx.lineTo(
                    targetX - headLength * Math.cos(angle - Math.PI / 6),
                    targetY - headLength * Math.sin(angle - Math.PI / 6)
                );
                this.ctx.moveTo(targetX, targetY);
                this.ctx.lineTo(
                    targetX - headLength * Math.cos(angle + Math.PI / 6),
                    targetY - headLength * Math.sin(angle + Math.PI / 6)
                );
                this.ctx.stroke();
            }
        }
    }
}