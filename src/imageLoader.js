/**
 * Loads an image (TIFF or standard) and pushes it to the provided ViewerManager.
 * Returns the HTML element (Canvas or Image) needed for OpenCV processing.
 */
export async function loadImageCanvas(file) {

    if (file.type === 'image/tiff' || file.name.endsWith('.tif') || file.name.endsWith('.tiff')) {
        return loadTiff(file);
    } else {
        return loadStandardImageasCanvas(file);
    }
}

async function loadTiff(file) {

    const buffer = await file.arrayBuffer();

    const ifds = UTIF.decode(buffer);

    if (ifds.length > 0) {
        const ifd = ifds[0];
        console.group(`TIFF Metadata: ${file.name}`);

        // Number of Channels (Tag 277: SamplesPerPixel)
        // Default to 1 if the tag is missing (usually bilevel images)
        const samplesPerPixel = ifd.t277 ? ifd.t277[0] : 1;
        console.log("Number of channel (SamplesPerPixel):", samplesPerPixel);

        // BitsPerSample (Tag 258)
        // Usually an array, e.g., [8, 8, 8] for 24-bit RGB
        console.log("BitsPerSample:", ifd.t258 || "Unknown");

        // Planar or Interleaved (Tag 284: PlanarConfiguration)
        // 1 = Chunky (Interleaved), 2 = Planar. Default is 1.
        const planarConfig = ifd.t284 ? ifd.t284[0] : 1;
        const layout = planarConfig === 1 ? "Interleaved (Chunky)" : "Planar";
        console.log("Planar or interleaved:", layout);

        console.groupEnd();
    }

    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);

    const canvas = document.createElement("canvas");
    canvas.width = ifds[0].width;
    canvas.height = ifds[0].height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const imgData = ctx.createImageData(canvas.width, canvas.height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);

    return canvas;
}

async function loadStandardImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;

    return new Promise((resolve, reject) => {
        img.onload = () => {
            viewerManager.openImage(url, img.naturalWidth, img.naturalHeight);

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);

            resolve({
                sourceElement: canvas,
                width: img.naturalWidth,
                height: img.naturalHeight
            });
        };
        img.onerror = reject;
    });
}

async function loadStandardImageasCanvas(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('File is not an image.');

    const bitmap = await createImageBitmap(file);

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);

    bitmap.close();

    return canvas;
}