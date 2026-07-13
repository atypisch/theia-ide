/********************************************************************************
 * Soriku IDE — chat panel maximize sizing (pure, Theia-free, unit-testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** Never shrink the maximized panel below this, even on a narrow window. */
export const MIN_MAXIMIZED_WIDTH = 480;
/** Fraction of the window width kept visible for the main editor area. */
export const MAXIMIZE_KEEP_RATIO = 0.22;
/** Minimum gap (px) left for the main area so it never fully disappears. */
export const MAIN_AREA_MARGIN = 48;

/**
 * The right-panel width (px) to apply when maximizing the chat panel: ~78% of
 * the window, floored at MIN_MAXIMIZED_WIDTH but never exceeding
 * `windowWidth - MAIN_AREA_MARGIN` (the main area must stay visible).
 */
export function maximizedPanelWidth(windowWidth: number): number {
    const target = Math.round(windowWidth * (1 - MAXIMIZE_KEEP_RATIO));
    const withFloor = Math.max(MIN_MAXIMIZED_WIDTH, target);
    return Math.min(withFloor, windowWidth - MAIN_AREA_MARGIN);
}
