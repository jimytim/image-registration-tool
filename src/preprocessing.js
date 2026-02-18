export class PreProcessingUIManager {

    constructor(state, viewer) {
        this.state = state;
        this.viewer = viewer;
        this.PREPROC_DEFAULTS = {
            crop: {
                top: 2,
                bottom: 120,
                left: 2,
                right: 2,
            },
            rotation: 0,
            threshold: 45,
        };

        this.imageTarget = document.getElementById("imageTarget");
        this.cropTop = document.getElementById("cropTop");
        this.cropBottom = document.getElementById("cropBottom");
        this.cropLeft = document.getElementById("cropLeft");
        this.cropRight = document.getElementById("cropRight");
        this.sliderRotate = document.getElementById("sliderRotate");
        this.numRotate = document.getElementById("numRotate");
        this.valThresh = document.getElementById("valThresh");
        this.sliderThresh = document.getElementById("sliderThresh");
        this.btnApplyProc = document.getElementById("btnApplyProc");
        this.btnResetProc = document.getElementById("btnResetProc");
        this.btnSaveProc = document.getElementById("btnSaveProc");
    }

    updateStatus(msg) {
        console.log(`App Status: ${msg}`);
        // status.innerText = msg;
    }

    initUI() {
        this.cropTop.value = this.PREPROC_DEFAULTS.crop.top;
        this.cropBottom.value = this.PREPROC_DEFAULTS.crop.bottom;
        this.cropLeft.value = this.PREPROC_DEFAULTS.crop.left;
        this.cropRight.value = this.PREPROC_DEFAULTS.crop.right;

        this.sliderRotate.value = this.PREPROC_DEFAULTS.rotation;
        this.numRotate.value = this.PREPROC_DEFAULTS.rotation;
        this.sliderThresh.value = this.PREPROC_DEFAULTS.threshold;

        this.sliderRotate.innerText = `${this.PREPROC_DEFAULTS.rotation}°`;
        this.numRotate.innerText = `${this.PREPROC_DEFAULTS.rotation}°`;
        this.valThresh.innerText = this.PREPROC_DEFAULTS.threshold;
    }

    resetUI() {
        this.initUI();
        this.imageTarget.selectedIndex = 0;
        this.toggleMessage(false);
    }

    getPreprocessingParameters() {
        return {
            crop: {
                top: parseInt(this.cropTop.value) || 0,
                bottom: parseInt(this.cropBottom.value) || 0,
                left: parseInt(this.cropLeft.value) || 0,
                right: parseInt(this.cropRight.value) || 0,
            },
            rotation: parseFloat(this.sliderRotate.value) || 0,
            threshold: parseInt(this.sliderThresh.value) || 0,
        };
    }

    setupUI() {

        this.imageTarget.addEventListener("change", () => {
            const side = this.imageTarget.value;
            const imageToLoad = this.state[side].imageCanvas || this.state[side].ogImageCanvas;

            if (imageToLoad) {
                this.viewer.openImageFromCanvas(imageToLoad);
                this.toggleMessage(false); // Hide message when image loads
                this.updateStatus(`Switched viewer to ${side} image.`);
            } else {
                if (this.viewer.viewer) {
                    this.viewer.viewer.close();
                }
                // Show the centered message
                this.toggleMessage(true, `No image loaded for ${side} side`);
                this.updateStatus(`No image loaded for ${side} side.`);
            }
        });

        this.sliderRotate.addEventListener("input", (e) => {
            numRotate.value = e.target.value;
        });
        this.numRotate.addEventListener("input", (e) => {
            sliderRotate.value = e.target.value;
        });
        this.sliderThresh.addEventListener("input", (e) => (this.valThresh.innerText = e.target.value));

        this.btnApplyProc.addEventListener("click", async () => {
            const side = this.imageTarget.value;
            const original = this.state[side].ogImageCanvas;

            if (!original) {
                this.updateStatus(`No image loaded for ${side}.`);
                return;
            }

            this.updateStatus("Processing...");
            const config = this.getPreprocessingParameters();

            try {
                const processedImageCanvas = await applyImageFilters(original, config);
                this.viewer.openImageFromCanvas(processedImageCanvas);
                this.state[side].imageCanvas = processedImageCanvas;
                this.state[side].viewer.openImageFromCanvas(processedImageCanvas);
                this.updateStatus("Image updated.");
            } catch (e) {
                console.error(e);
                this.updateStatus("Error: " + e.message);
            }
        });

        btnResetProc.addEventListener("click", () => {
            const side = this.imageTarget.value;
            const original = this.state[side].ogImageCanvas;
            this.state[side].imageCanvas = original;
            this.state[side].viewer.openImageFromCanvas(original);
            this.viewer.openImageFromCanvas(original);
            this.updateStatus("Reset to original.");
        });

        btnSaveProc.addEventListener("click", () => {
            const side = this.imageTarget.value;
            const imageCanvas = this.state[side].imageCanvas;

            // filename: "originalName_processed.png"
            const originalName = this.state[side].filename || "image";
            const dotIndex = originalName.lastIndexOf(".");
            const baseName = dotIndex > -1 ? originalName.substring(0, dotIndex) : originalName;
            const outName = `${baseName}_processed.png`;

            try {
                const dataUrl = source.toDataURL("image/png");

                // Create a temporary link to trigger download
                const a = document.createElement("a");
                a.href = dataUrl;
                a.download = outName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                this.updateStatus(`Saved ${outName}`);
            } catch (e) {
                console.error("Save failed:", e);
                this.updateStatus("Error saving image.");
            }
        });
    }

    toggleMessage(show, text = "") {
        // Access the container DOM element using the viewer's ID
        const container = document.getElementById(this.viewer.id);
        if (!container) return;

        // Check if our message element already exists
        let msgEl = container.querySelector(".viewer-msg-overlay");

        if (!msgEl) {
            msgEl = document.createElement("div");
            msgEl.className = "viewer-msg-overlay";

            // Apply inline styles to center the text
            Object.assign(msgEl.style, {
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "var(--text-main, #cccccc)",
                fontSize: "1.1rem",
                pointerEvents: "none", // Let clicks pass through to the viewer
                zIndex: "100",
                textAlign: "center"
            });

            container.appendChild(msgEl);
        }

        if (show) {
            msgEl.innerText = text;
            msgEl.style.display = "block";
        } else {
            msgEl.style.display = "none";
        }
    }
}


/**
 * Applies Crop -> Rotate -> Threshold to a source image/canvas.
 * Returns a PROMISE that resolves to the new processed Canvas.
 */
async function applyImageFilters(source, config) {
    const { crop, rotation, threshold } = config;

    // --- Crop ---
    // Create an intermediate canvas for the cropped region
    const originalWidth = source.width || source.naturalWidth;
    const originalHeight = source.height || source.naturalHeight;

    const cropW = originalWidth - crop.left - crop.right;
    const cropH = originalHeight - crop.top - crop.bottom;

    if (cropW <= 0 || cropH <= 0) throw new Error("Crop consumes entire image");

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });

    cropCtx.drawImage(
        source,
        crop.left, crop.top, cropW, cropH, // Source Rect
        0, 0, cropW, cropH                 // Dest Rect
    );

    // --- Rotate ---
    // Calculate new bounding box for rotated image
    const angleRad = (rotation * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(angleRad));
    const absSin = Math.abs(Math.sin(angleRad));

    const rotW = Math.floor(cropW * absCos + cropH * absSin);
    const rotH = Math.floor(cropW * absSin + cropH * absCos);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = rotW;
    finalCanvas.height = rotH;
    const ctx = finalCanvas.getContext('2d', { willReadFrequently: true });

    // Move to center, rotate, move back
    ctx.translate(rotW / 2, rotH / 2);
    ctx.rotate(angleRad);
    ctx.drawImage(cropCanvas, -cropW / 2, -cropH / 2);

    // Reset transform for pixel manipulation
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // --- Threshold ---
    if (threshold > 0) {
        const imgData = ctx.getImageData(0, 0, rotW, rotH);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Simple average intensity
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            if (avg < threshold) {
                data[i] = 0;     // R
                data[i+1] = 0;   // G
                data[i+2] = 0;   // B
                // Alpha (i+3) unchanged
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    return finalCanvas;
}