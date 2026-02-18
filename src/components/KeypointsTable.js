import { FeaturesEvents } from "../features.js";

export class KeypointsTable {
    /**
     * @param {HTMLElement} container - The wrapper element (#keypoints-table-container)
     * @param {Features} featuresState - The shared features state object
     * @param {Function} onRowSelected - Callback function(leftKP, rightKP) when a row is clicked
     */
    constructor(container, featuresState, onRowSelected) {
        this.container = container;
        this.tbody = container.querySelector('tbody');
        this.features = featuresState;
        this.onRowSelected = onRowSelected;

        // Subscribe to state changes
        this.features.subscribe(this.handleFeatureEvent.bind(this));

        // Initial render
        this.render();
    }

    handleFeatureEvent(event) {
        switch (event.type) {
            case FeaturesEvents.KEYPOINT_ADDED:
                this.addOrUpdateRow(event.side, event.index);
                break;
            case FeaturesEvents.KEYPOINT_UPDATED:
                this.updateCell(event.side, event.index);
                break;
            case FeaturesEvents.KEYPOINT_REMOVED:
                // Full re-render is safest for removals as indices shift
                this.render();
                break;
            case FeaturesEvents.RESET:
                this.tbody.innerHTML = '';
                break;
        }
    }

    render() {
        this.tbody.innerHTML = '';
        this.features.matches.forEach((match, index) => {
            const row = this.createRowElement(match, index);
            this.tbody.appendChild(row);
        });
    }

    createRowElement(match, index) {
        const row = document.createElement('tr');
        row.id = `match-row-${index}`;

        const leftKP = match.leftIdx > -1 ? this.features.keyPoints.left[match.leftIdx] : null;
        const rightKP = match.rightIdx > -1 ? this.features.keyPoints.right[match.rightIdx] : null;

        const lx = leftKP ? leftKP.x.toFixed(1) : '-';
        const ly = leftKP ? leftKP.y.toFixed(1) : '-';
        const rx = rightKP ? rightKP.x.toFixed(1) : '-';
        const ry = rightKP ? rightKP.y.toFixed(1) : '-';

        row.innerHTML = `
            <td>${index}</td>
            <td class="cell-lx">${lx}</td>
            <td class="cell-ly">${ly}</td>
            <td class="cell-rx">${rx}</td>
            <td class="cell-ry">${ry}</td>
        `;

        // Interaction: We just notify the parent, we don't touch OSD here
        row.addEventListener('click', () => {
            if (this.onRowSelected) {
                this.onRowSelected(leftKP, rightKP);
            }
        });

        return row;
    }

    addOrUpdateRow(side, kpIndex) {
        // Logic: Find the match associated with this new keypoint
        const matches = this.features.matches;

        // In manual mode, the active match is usually the last one
        const matchIndex = matches.length - 1;
        const match = matches[matchIndex];

        if (!match) return;

        const existingRow = this.tbody.querySelector(`#match-row-${matchIndex}`);

        if (existingRow) {
            // Update existing row (e.g. adding Right point to existing Left point)
            const newRow = this.createRowElement(match, matchIndex);
            existingRow.replaceWith(newRow);
        } else {
            // Create new row
            const newRow = this.createRowElement(match, matchIndex);
            this.tbody.appendChild(newRow);
            // Auto-scroll
            this.container.scrollTop = this.container.scrollHeight;
        }
    }

    updateCell(side, kpIndex) {
        // Find which match this keypoint belongs to
        // We scan matches because we store match indices, not KP indices directly in DOM
        const matches = this.features.matches;
        let matchIndex = -1;

        if (side === 'left') {
            matchIndex = matches.findIndex(m => m.leftIdx === kpIndex);
        } else {
            matchIndex = matches.findIndex(m => m.rightIdx === kpIndex);
        }

        if (matchIndex === -1) return;

        const row = this.tbody.querySelector(`#match-row-${matchIndex}`);
        if (!row) return;

        const kp = this.features.keyPoints[side][kpIndex];

        // Only update specific text nodes for performance (optional, but good practice)
        if (side === 'left') {
            row.querySelector('.cell-lx').innerText = kp.x.toFixed(1);
            row.querySelector('.cell-ly').innerText = kp.y.toFixed(1);
        } else {
            row.querySelector('.cell-rx').innerText = kp.x.toFixed(1);
            row.querySelector('.cell-ry').innerText = kp.y.toFixed(1);
        }
    }
}