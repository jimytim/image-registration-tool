// 1. Define locations
const CDN_IMAGES = "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/5.0.1/images/";
const LOCAL_IMAGES = "lib/openseadragon-5.0.1/images";
const imagePrefix = navigator.onLine ? CDN_IMAGES : LOCAL_IMAGES;

function initViewer(id, overrides = {}) {
    const defaults = {
        id: id,
        prefixUrl: imagePrefix,
        showNavigationControl: true,
        gestureSettingsMouse: {
            clickToZoom: false,
            dragToPan: false
        },
        defaultZoomLevel: 0,
        minZoomLevel: 0,
        maxZoomLevel: 100,
        visibilityRatio: 0.5,
        constrainDuringPan: false,
        zoomPerScroll: 1.5,
        imageSmoothingEnabled: false
    }
    return OpenSeadragon(Object.assign(defaults, overrides));
}

export class OSDViewer {
    /**
     * @param {string} id - The DOM ID for the viewer
     * @param {Object} overrides - OpenSeadragon configuration overrides
     */
    constructor(elementId, overrides = {}) {

        this.elementId = elementId;
        this.viewer = initViewer(elementId, overrides);
        this.imageBlobURL = null;
        this.imageWidth = 0;
        this.imageHeight = 0;

        this.canvas = null;
        this.ctx = null;
        this.drawData = null;

        this.boundRedraw = null;
        this.boundResize = null;
        this.boundOpen = null;

        this.isRedrawPending = false;
    }

    openImage(url, width, height) {
        this.imageWidth = width;
        this.imageHeight = height;

        this.viewer.open({
            type: 'image',
            url: url,
            buildPyramid: false
        });

        this.viewer.clearOverlays();
    }

    openImageFromCanvas(imageCanvas) {
        // Only applicable to single images (not tiled)

        // Revoke previous image url
        if (this.imageBlobURL) URL.revokeObjectURL(this.imageBlobURL);

        try {
            imageCanvas.toBlob((blob) => {
                this.imageBlobURL = URL.createObjectURL(blob);
                this.viewer.open({
                    type: 'image',
                    url: this.imageBlobURL,
                    buildPyramid: false
                });

            },
            'image/png', // type
            1); // quality (Number between 0 and 1)

        } catch (error) {
            console.error("Error loading image:", error);
        }
    };

    addLayerFromCanvas(canvas, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);

                    // Merge default options with user options
                    const tileSource = {
                        type: 'image',
                        url: url,
                        buildPyramid: false
                    };

                    this.viewer.addTiledImage({
                        tileSource: tileSource,
                        opacity: options.opacity || 1,
                        compositeOperation: options.compositeOperation || null,
                        x: options.x || 0,
                        y: options.y || 0,
                        width: options.width,
                        success: (event) => {
                            resolve(event.item);
                        },
                        error: (err) => reject(err)
                    });
                });
            } catch (error) {
                console.error("Error adding layer from canvas:", error);
                reject(error);
            }
        });
    }

    setupCanvas() {
        if (this.canvas) return;

        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none'; // Clicks pass through to OSD
        this.canvas.style.zIndex = '100';

        const container = document.getElementById(this.elementId);
        if (container) {
            container.appendChild(this.canvas);
        }

        this.ctx = this.canvas.getContext('2d');

        this.boundRedraw = this.requestRedraw.bind(this);
        this.boundResize = this.resizeCanvas.bind(this);
        this.boundOpen = () => {
            this.resizeCanvas();
            this.requestRedraw();
        };

        this.viewer.addHandler('update-viewport', this.boundRedraw);
        this.viewer.addHandler('resize', this.boundResize);
        this.viewer.addHandler('open', this.boundOpen);

        this.resizeCanvas();

        console.log("Canvas setup done.")
    }

    removeCanvas() {
        if (!this.canvas) return;

        this.viewer.removeHandler('update-viewport', this.boundRedraw);
        this.viewer.removeHandler('resize', this.boundResize);
        this.viewer.removeHandler('open', this.boundOpen);


        this.canvas.remove();

        this.canvas = null;
        this.ctx = null;
        this.boundRedraw = null;
        this.boundResize = null;
        this.boundOpen = null;
    }

    resizeCanvas() {
        if (!this.canvas) return;

        const container = document.getElementById(this.elementId);
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = container.clientWidth * dpr;
        this.canvas.height = container.clientHeight * dpr;

        this.ctx.scale(dpr, dpr);

        this.requestRedraw();
    }

    requestRedraw(arg) {
        // If an argument is passed and it is NOT an OSD event, update our state
        if (arg && !arg.eventSource) {
            this.drawData = arg;
        }

        if (!this.isRedrawPending) {
            this.isRedrawPending = true;
            // Pass the persistent state to the draw function
            requestAnimationFrame(() => this.redraw(this.drawData));
        }
    }

    redraw(data) {
        this.isRedrawPending = false;

        // Safety check
        if (!this.ctx) return;

        // this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (data) {

        }
    }

    enableRightClickPan() {
        let nonPrimaryDown = false;
        let dragPosition = null;

        this.viewer.canvas.oncontextmenu = (e) => e.preventDefault();

        this.viewer.addHandler('canvas-nonprimary-press', function(event) {
            nonPrimaryDown = true;
            dragPosition = event.position.clone();
        });

        this.viewer.addHandler('canvas-nonprimary-release', function() {
            nonPrimaryDown = false;
        });

        new OpenSeadragon.MouseTracker({
            element: this.viewer.canvas,
            moveHandler: (event) => {
                if (nonPrimaryDown && dragPosition) {

                    const deltaPixels = dragPosition.minus(event.position);

                    const deltaPoints = this.viewer.viewport.deltaPointsFromPixels(deltaPixels);

                    this.viewer.viewport.panBy(deltaPoints);
                    dragPosition = event.position.clone();
                }
            }
        })
    }
}


export class MatchingOSDViewer extends OSDViewer {
    constructor(id, side, overrides = {}) {
        super(id, overrides);
        this.side = side;
        this.enableRightClickPan();
        this._activeClickHandler = null;
    }

    bindClick(callback) {
        // Safety: Prevent adding multiple listeners if called twice
        this.unbindClick();

        this._activeClickHandler = (event) => {
            if (event.quick) {
                callback({
                    position: event.position,
                    side: this.side,
                    originalEvent: event,
                    viewerWrapper: this
                });
            }
        };

        this.viewer.addHandler('canvas-click', this._activeClickHandler);
    }

    unbindClick() {
        if (this._activeClickHandler) {
            this.viewer.removeHandler('canvas-click', this._activeClickHandler);
            this._activeClickHandler = null;
        }
    }

    redraw(keypoints) {

        this.isRedrawPending = false;

        // Safety check
        if (!this.ctx) return;
        if (!this.viewer.world.getItemAt(0)) {
            console.log("Redraw aborted: No image in the viewer.");
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);


         if (keypoints) {
            // Optimization: Batch operations by style to minimize state changes
            const unmatched = [];
            const matched = [];
            const goodMatched = [];

            // 1. Calculate screen positions
            for (const kp of keypoints) {
                // Convert Image coordinates -> Viewport -> Screen Element coordinates
                const point = this.viewer.viewport.imageToViewerElementCoordinates(
                    new OpenSeadragon.Point(kp.x, kp.y)
                );

                if (kp.data) {
                    if (kp.data.isGoodMatch) {
                        goodMatched.push(point);
                    } else if (kp.data.isMatched) {
                        matched.push(point);
                    } else {
                        unmatched.push(point);
                    }
                } else {
                    unmatched.push(point);
                }
            }

            // 2. Draw Unmatched (Lime)
            if (unmatched.length > 0) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = 'lime';
                this.ctx.lineWidth = 1;
                const s = 5; // Crosshair size (radius)

                for (const p of unmatched) {
                    // Horizontal line
                    this.ctx.moveTo(p.x - s, p.y);
                    this.ctx.lineTo(p.x + s, p.y);
                    // Vertical line
                    this.ctx.moveTo(p.x, p.y - s);
                    this.ctx.lineTo(p.x, p.y + s);
                }
                this.ctx.stroke();
            }

            // 3. Draw Matched (Cyan with Glow)
            if (matched.length > 0) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = '#00e5ff';
                this.ctx.lineWidth = 2;
                this.ctx.shadowBlur = 4; // Glow effect
                this.ctx.shadowColor = '#00e5ff';
                const s = 6;

                for (const p of matched) {
                    this.ctx.moveTo(p.x - s, p.y);
                    this.ctx.lineTo(p.x + s, p.y);
                    this.ctx.moveTo(p.x, p.y - s);
                    this.ctx.lineTo(p.x, p.y + s);
                }
                this.ctx.stroke();
            }

            // 4. Draw Good/RANSAC Matched (Red with Glow)
            if (goodMatched.length > 0) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = '#ff0000'; // Red
                this.ctx.lineWidth = 2;
                this.ctx.shadowBlur = 6; // Slightly stronger glow
                this.ctx.shadowColor = '#ff0000';
                const s = 6;

                for (const p of goodMatched) {
                    this.ctx.moveTo(p.x - s, p.y);
                    this.ctx.lineTo(p.x + s, p.y);
                    this.ctx.moveTo(p.x, p.y - s);
                    this.ctx.lineTo(p.x, p.y + s);
                }
                this.ctx.stroke();
            }

            // Reset shadow for next frame
            this.ctx.shadowBlur = 0;
            this.ctx.shadowColor = 'transparent';

        } else {
            console.log("Redraw terminated: no draw data.");
        }
    }
}