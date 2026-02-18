# Web Image Registration Tool

A high-performance, browser-based application for manual and automatic image registration. Built with **OpenSeadragon** for deep-zoom capabilities and **OpenCV.js (WebAssembly)** for computer vision algorithms.


## Overview

This tool allows users to align (register) two high-resolution images. It supports a **Manual Mode**, where users place corresponding key points on both images, and an **Automatic Mode**, which utilizes feature detection algorithms (ORB, AKAZE, BRISK) to find and match keypoints automatically.

The application is purely client-side, utilizing WebAssembly to run heavy computer vision tasks directly in the browser without a backend.

## Key Features

### 1. Image Handling
* **Deep Zoom:** Supports gigapixel images via OpenSeadragon.
* **Format Support:** Loads standard images (JPG, PNG) and **TIFF** files (via UTIF.js).
* **Pre-processing:** Built-in tools for cropping, rotating, and thresholding images before registration.

### 2. Registration Modes
* **Manual Registration:**
    * Interactive "Place," "Edit," and "Remove" tools.
    * Key point coordinates table with an automatic focus pan on matches.
* **Automatic Registration:**
    * **Detectors:** ORB, AKAZE, BRISK.
    * **Matching:** Brute-force matcher (L2/Hamming).
    * **Filtering:** RANSAC-based outlier rejection to ensure geometrically coherent matches (Currently assumes no rotation between the two images).

### 3. Inspection & Analysis
* **Live Preview:** Overlays the transformed "Left" image onto the "Right" image with adjustable opacity.
* **Error Field:** A vector field visualization showing local displacement errors, useful for identifying non-linear distortions.
* **Data Export:** Export match data to JSON for external analysis.

## 🚀 Getting Started

### Prerequisites
You need a modern web browser with **WebAssembly** support (Chrome, Firefox, Edge, Safari).

### Installation
1.  Clone the repository:
    ```bash
    git clone [https://github.com/your-username/image-registration-tool.git](https://github.com/your-username/image-registration-tool.git)
    ```
2.  Navigate to the project folder:
    ```bash
    cd image-registration-tool
    ```

### Running the App
Because this app uses ES6 modules and WebAssembly, you cannot simply open `index.html` file directly from the file explorer due to CORS policies. You must serve it via a local web server.

**Option A: Node.js (npx)**

If you have Node.js installed, you can use the `serve` package without installing it globally:

```bash
npx serve . -p 8000
```

Then open http://localhost:8000 in your browser.

**Option B: Python**
```bash
python -m http.server 8000
```

Then open http://localhost:8000 in your browser.

**Option C: VS Code**
1.  Install the **Live Server** extension.
2.  Right-click `index.html` and choose **Open with Live Server**.

## Project Structure

```
.
├── index.html            # Main entry point
├── styles.css            # Styling & UI layout
├── lib/                  # Third-party libraries (OpenCV, OSD, UTIF)
└── src/
    ├── app.js            # Main application controller
    ├── features.js       # Data model (KeyPoints, Matches) & OpenCV Logic
    ├── imageLoader.js    # Handles file inputs & TIFF decoding
    ├── matching.js       # UI Logic for the Matching Tab
    ├── preprocessing.js  # UI Logic for the Pre-processing Tab
    ├── inspect.js        # Logic for Preview and Error Field visualization
    ├── viewer.js         # Wrapper around OpenSeadragon & Canvas overlays
    └── components/       # UI Components (Table, Canvas Lines)
```