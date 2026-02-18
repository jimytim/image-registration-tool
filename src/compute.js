export function calculateSimilarity(pairs) {
    if (pairs.length < 2) return null;

    // Calculate Centroids (Means)
    let mL = { x: 0, y: 0 },
        mR = { x: 0, y: 0 };

    pairs.forEach((p) => {
        mL.x += p.left.x;
        mL.y += p.left.y;
        mR.x += p.right.x;
        mR.y += p.right.y;
    });

    mL.x /= pairs.length;
    mL.y /= pairs.length;
    mR.x /= pairs.length;
    mR.y /= pairs.length;

    // Compute Scale and Rotation
    let num = 0,
        den = 0,
        rNum = 0;

    pairs.forEach((p) => {
        const dL = { x: p.left.x - mL.x, y: p.left.y - mL.y };
        const dR = { x: p.right.x - mR.x, y: p.right.y - mR.y };

        // Dot product and cross product of centered vectors
        num += dR.x * dL.x + dR.y * dL.y;
        rNum += dR.x * dL.y - dR.y * dL.x;
        den += dR.x * dR.x + dR.y * dR.y;
    });

    const scale = Math.sqrt(num * num + rNum * rNum) / den;
    const angleRad = Math.atan2(rNum, num);
    const angleDeg = angleRad * (180 / Math.PI);

    // Translation: Maps Right Mean to Left Mean after scaling/rotation
    const tx = mL.x - scale * (Math.cos(angleRad) * mR.x - Math.sin(angleRad) * mR.y);
    const ty = mL.y - scale * (Math.sin(angleRad) * mR.x + Math.cos(angleRad) * mR.y);

    return { scale, angleDeg, tx, ty };
}