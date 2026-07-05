/********************************************************************************
 * Soriku IDE — registers the Soriku Dark / Soriku Light color themes
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ThemeService } from '@theia/core/lib/browser/theming';

export const SORIKU_DARK_THEME_ID = 'soriku-dark';
export const SORIKU_LIGHT_THEME_ID = 'soriku-light';

@injectable()
export class SorikuThemeContribution implements FrontendApplicationContribution {

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    /**
     * Runs before `ThemeService.init()` resolves the `workbench.colorTheme`
     * preference, so both themes are already registered by the time the
     * configured default ("soriku-dark") is validated against the theme map.
     */
    initialize(): void {
        this.themeService.register(
            {
                id: SORIKU_DARK_THEME_ID,
                type: 'dark',
                label: 'Soriku Dark',
                editorTheme: 'dark-theia',
            },
            {
                id: SORIKU_LIGHT_THEME_ID,
                type: 'light',
                label: 'Soriku Light',
                editorTheme: 'light-theia',
            },
        );
    }

    /**
     * Theia's ColorApplicationContribution only ever adds a `theia-<type>`
     * class to <body> (dark/light/hc/hcLight) — it does not distinguish
     * *which* dark theme is active. Our token overrides in
     * theia-color-overrides.css need a class specific to our own themes (so
     * picking stock "Dark (Theia)" doesn't also pull in Soriku colors), so we
     * maintain `soriku-dark` / `soriku-light` on <body> ourselves.
     */
    onStart(): void {
        const applyBodyClass = (): void => {
            const id = this.themeService.getCurrentTheme().id;
            document.body.classList.toggle(SORIKU_DARK_THEME_ID, id === SORIKU_DARK_THEME_ID);
            document.body.classList.toggle(SORIKU_LIGHT_THEME_ID, id === SORIKU_LIGHT_THEME_ID);
        };
        applyBodyClass();
        this.themeService.onDidColorThemeChange(applyBodyClass);
    }
}
