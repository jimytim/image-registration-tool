export const FeaturesEvents = Object.freeze({
    KEYPOINT_ADDED:   'keypoint_added',
    KEYPOINT_UPDATED: 'keypoint_updated',
    KEYPOINT_REMOVED: 'keypoint_removed',
    MATCHES_UPDATED:  'matches_updated',
    RESET:            'reset'
});


export class KeyPoint {
    constructor(x, y, size = 10, data = null) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.data = data;
    }

    setProperty(key, value) {
        if (!this.data) {
            this.data = {};
        }
        this.data[key] = value;
    }
}

export class Match {
    constructor(leftIdx, rightIdx, distance=0.0) {
        this.leftIdx = leftIdx;
        this.rightIdx = rightIdx;
        this.distance = distance;
    }
    static fromDMatch(dmatch) {
        return new Match(dmatch.queryIdx, dmatch.trainIdx, dmatch.distance);
    }
}

export class Features {
    constructor() {
        this.keyPoints = { left: [], right: [] };
        this.descriptors = { left: null, right: null };
        this.matches = []; // In manual mode, the matching is assumed to be bijective.
        this.waitingForSide = null;
        this.listeners = [];
    }

    addKeyPoint(side, x, y) {
        // If we can place a keyPoint
        if (!this.waitingForSide || this.waitingForSide == side) {
            const keyPoint = new KeyPoint(x, y);
            const index = this.keyPoints[side].length;
            this.keyPoints[side].push(keyPoint);

            // Add/Update the Match object (queryIdx=i, trainIdx=i, distance=0)
            if (this.waitingForSide == null) {
                // If new match
                let match = null;
                if (side == "left") {
                    match = new Match(index, -1);
                    this.waitingForSide = "right";
                } else {
                    match = new Match(-1, index);
                    this.waitingForSide = "left";
                }
                this.matches.push(match);
            } else {
                // we complete the last match
                if (side == "left") {
                    this.matches.at(-1).leftIdx = index;
                } else {
                    this.matches.at(-1).rightIdx = index;
                }
                this.waitingForSide = null;
            }

            this._notify(FeaturesEvents.KEYPOINT_ADDED, { side: side, index: index });

            return index;
        } else {
            throw new Error(`Waiting for a ${this.waitingForSide} keypoint`);
        }
    }

    /**
     * Removes a keyPoint from one side and the potential matching keyPoint from the other side.
     * This assuming a bijective matching (one-to-one)
     * TODO: Take in account recursive removal in general matching case
     */
    removeKeyPoint(side, index) {

        this.keyPoints[side].splice(index, 1);
        console.log(`Features: Removed keypoint ${index} from the ${side}.`);
        this._notify(FeaturesEvents.KEYPOINT_REMOVED, { side: side, index: index });

        // Faster path if we are removing the last added keyPoint, we can pop the match
        // instead of doing a linear search all the way to the last one
        if (index === this.matches.length - 1) {
            const match = this.matches.pop();
            if (side == "left" && match.rightIdx != -1) {
                this.keyPoints["right"].splice(match.rightIdx, 1);
                console.log(`Features: Removed keypoint ${match.rightIdx} from the right.`);
                this._notify(FeaturesEvents.KEYPOINT_REMOVED, { side: "right", index: match.rightIdx });
            } else if (side == "right" && match.leftIdx != -1) {
                this.keyPoints["left"].splice(match.leftIdx, 1);
                console.log(`Features: Removed keypoint ${match.leftIdx} from the left.`);
                this._notify(FeaturesEvents.KEYPOINT_REMOVED, { side: "left", index: match.leftIdx });
            }
            console.log(`Features: Removed last match`);
        } else {
            let matchIndex = null;
            if (side === "left") {
                matchIndex = this.matches.findIndex((match) => match.leftIdx === index);
            } else {
                matchIndex = this.matches.findIndex((match) => match.rightIdx === index);
            }

            if (matchIndex !== -1) {
                const match = this.matches[matchIndex];
                const otherSide = side === "left" ? "right" : "left";
                let matchedKPIndex = null;
                let idxLeft = null;
                let idxRight = null;

                if (side === "left") {
                    matchedKPIndex = match.rightIdx;
                    idxLeft = index;
                    idxRight = matchedKPIndex;
                } else {
                    matchedKPIndex = match.leftIdx;
                    idxLeft = matchedKPIndex;
                    idxRight = index;
                }

                this.keyPoints[otherSide].splice(matchedKPIndex, 1);
                console.log(`Features: Removed keypoint ${matchedKPIndex} from the ${otherSide}.`);

                this.matches.splice(matchIndex, 1);
                console.log(`Features: Removed match #${matchIndex}.`);

                this.matches.forEach((m) => {
                    if (m.leftIdx > idxLeft) m.leftIdx--;
                    if (m.rightIdx > idxRight) m.rightIdx--;
                });

                console.log("Features: Decremented match indidces.");

                this._notify(FeaturesEvents.KEYPOINT_REMOVED, { side: otherSide, index: matchedKPIndex });
            }
        }
    }

    updateKeyPoint(side, index, x, y) {
        this.keyPoints[side][index].x = x;
        this.keyPoints[side][index].y = y;

        this._notify(FeaturesEvents.KEYPOINT_UPDATED, { side: side, index: index });
    }

    setKeyPointsFromOpenCV(side, keyPointVector) {
        const size = keyPointVector.size();
        for (let i = 0; i < size; ++i) {
            const kp = keyPointVector.get(i);
            this.keyPoints[side].push(new KeyPoint(kp.pt.x, kp.pt.y, kp.size));
            // kp.delete();
        }
    }

    setMatches(matches) {
        this.matches = matches;
        this._notify(FeaturesEvents.MATCHES_UPDATED);
    }

    setMatchesFromOpenCV(dMatchVector) {
        this.matches = [];

        this.resetKeyPointsMatchedFlag();

        const size = dMatchVector.size();
        for (let i = 0; i < size; i++) {
            const m = dMatchVector.get(i);
            this.matches.push(Match.fromDMatch(m));
            this.keyPoints.left[m.queryIdx].setProperty("isMatched", true);
            this.keyPoints.right[m.trainIdx].setProperty("isMatched", true);
        }

        this._notify(FeaturesEvents.MATCHES_UPDATED);
    }

    resetKeyPointsMatchedFlag() {
        [this.keyPoints.left, this.keyPoints.right].forEach(keyPointsArray => {
            keyPointsArray.forEach(kp => {
                if (kp.data) kp.data.isMatched = false;
            });
        });
    }

    clearKeyPointsAndDescriptors(side) {
        if (this.keyPoints[side]) this.keyPoints[side] = [];
        if (this.descriptors[side] && !this.descriptors[side].isDeleted()) this.descriptors[side].delete();
    }

    reset() {
        this.keyPoints.left = [];
        this.keyPoints.right = [];
        this.matches = [];
        if (this.descriptors.left && this.descriptors.left.delete) this.descriptors.left.delete();
        if (this.descriptors.right && this.descriptors.right.delete) this.descriptors.right.delete();
        this.descriptors = { left: null, right: null };
        this.waitingForSide = null;
        this._notify(FeaturesEvents.RESET);
    }

    // --- Pub/Sub ---
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            // Unsubscribe function
            this.listeners = this.listeners.filter((cb) => cb !== callback);
        };
    }

    _notify(type, payload = {}) {
        this.listeners.forEach((cb) => cb({ type, ...payload }));
    }
}

/**
 * Detects features in an HTML Image Element using OpenCV.js
 * @param {HTMLCanvasElement} imgElement
 * @param {string} algorithmName
 * @param {Object} params - Dictionary of parameters
 */
export function detectFeatures(imgElement, algorithmName, params) {
    const cv = window.cv;
    if (!cv) throw new Error("OpenCV not loaded");

    let src = cv.imread(imgElement);
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    let detector;

    try {
        switch (algorithmName) {
            case "ORB": {
                const nFeatures = parseInt(params.nFeatures) || 500;
                detector = new cv.ORB(nFeatures);
                break;
            }
            case "AKAZE": {
                detector = new cv.AKAZE();
                const threshold = parseFloat(params.threshold) || 0.001;
                detector.setThreshold(threshold);
                break;
            }
            case "BRISK": {
                const thresh = parseInt(params.thresh) || 30;
                detector = new cv.BRISK(thresh, 3, 1.0);
                break;
            }
            case "SIFT": {
                const nFeatures = parseInt(params.nFeatures) || 0;
                const contrast = parseFloat(params.contrastThreshold) || 0.04;
                const edge = parseFloat(params.edgeThreshold) || 10;

                if (!cv.SIFT) throw new Error("SIFT is not available in this OpenCV build.");
                detector = new cv.SIFT(nFeatures, 3, contrast, edge, 1.6);
                break;
            }
            case "SURF": {
                const hessian = parseFloat(params.hessianThreshold) || 400;
                const octaves = parseInt(params.nOctaves) || 4;

                if (cv.xfeatures2d && cv.xfeatures2d.SURF) {
                    detector = new cv.xfeatures2d.SURF(hessian, octaves, 3, true, false);
                } else if (cv.SURF) {
                    detector = new cv.SURF(hessian, octaves, 3, true, false);
                } else {
                    throw new Error("SURF is missing. You need an opencv.js build with xfeatures2d enabled.");
                }
                break;
            }
            default:
                throw new Error(`Unknown algorithm: ${algorithmName}`);
        }
    } catch (e) {
        console.error(`Error initializing ${algorithmName}:`, e);
        src.delete();
        gray.delete();
        if (detector) detector.delete(); // Ensure cleanup if partial failure
        throw e;
    }

    let keypoints = new cv.KeyPointVector();
    let descriptors = new cv.Mat();

    if (detector) {
        detector.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors);
        detector.delete();
    }

    src.delete();
    gray.delete();

    return { keypoints, descriptors };
}

/**
 * Matches features based on descriptors only.
 * Returns the top N candidates sorted by distance.
 */
export function matchFeatures(desc1, desc2) {
    const cv = window.cv;

    // Check descriptor type
    let normType = cv.NORM_HAMMING;
    if (desc1.type() === cv.CV_32F) {
        normType = cv.NORM_L2;
    }

    const matcher = new cv.BFMatcher(normType, true);
    const matches = new cv.DMatchVector();

    try {
        matcher.match(desc1, desc2, matches);
        matcher.delete();

        return matches;

    } catch (e) {
        console.error("Matching failed:", e);
        if(matcher) matcher.delete();
        if(matches) matches.delete();
        return [];
    }
}
/**
 * RANSAC Filter for Similarity Model (Rotation = 0)
 * Model: P2 = s * P1 + T
 * Constraints: 's' must be positive.
 */
export function filterMatchesRANSAC(matches, kp1, kp2) {
    if (matches.length < 2) return matches;

    const iterations = 400; // Number of attempts
    const threshold = 5.0; // Pixel error tolerance
    let bestInliers = [];

    for (let i = 0; i < iterations; i++) {
        // 1) Pick 2 random points to form a model
        const idx1 = Math.floor(Math.random() * matches.length);
        const idx2 = Math.floor(Math.random() * matches.length);
        if (idx1 === idx2) continue;

        const m1 = matches[idx1];
        const m2 = matches[idx2];

        const p1a = kp1[m1.leftIdx];
        const p1b = kp1[m2.leftIdx];
        const p2a = kp2[m1.rightIdx];
        const p2b = kp2[m2.rightIdx];

        // 2) Calculate Scale
        // distance between points in Image 1
        const dist1 = Math.hypot(p1a.x - p1b.x, p1a.y - p1b.y);
        // distance between points in Image 2
        const dist2 = Math.hypot(p2a.x - p2b.x, p2a.y - p2b.y);

        // Avoid division by zero or extremely close points
        if (dist1 < 5.0) continue;

        const s = dist2 / dist1;

        // Scale shouldn't be negative or too small
        if (s < 0.1 || s > 10.0) continue;

        // 3) Calculate Translation (Tx, Ty) based on the first point
        // x2 = s*x1 + tx  =>  tx = x2 - s*x1
        const tx = p2a.x - s * p1a.x;
        const ty = p2a.y - s * p1a.y;

        // 4) Count Inliers
        const currentInliers = [];
        for (const m of matches) {
            const p1 = kp1[m.leftIdx];
            const p2 = kp2[m.rightIdx];

            // Predicted position of P1 in Image 2
            const predX = s * p1.x + tx;
            const predY = s * p1.y + ty;

            // Calculate error distance
            const error = Math.hypot(p2.x - predX, p2.y - predY);

            if (error < threshold) {
                currentInliers.push(m);
            }
        }

        // 5) Keep best model
        if (currentInliers.length > bestInliers.length) {
            bestInliers = currentInliers;
        }
    }

    return bestInliers;
}
