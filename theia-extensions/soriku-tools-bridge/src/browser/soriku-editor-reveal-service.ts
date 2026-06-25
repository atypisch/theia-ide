/********************************************************************************
 * Soriku IDE — open changed files in the editor as the agent writes them
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { pathKind } from '../common/tool-delegation';

export interface RevealFileOptions {
    /** Scroll to this 1-based line after opening. */
    line?: number;
    /** Focus the editor tab (default true). */
    activate?: boolean;
}

@injectable()
export class SorikuEditorRevealService {

  @inject(OpenerService)
  protected readonly openerService: OpenerService;

  @inject(WorkspaceService)
  protected readonly workspaceService: WorkspaceService;

  private lastRevealed = '';

  /**
   * Open a workspace file in the editor. Safe to call repeatedly; skips duplicate
   * reveals of the same path within one agent turn burst.
   */
  async revealPath(path: string, options: RevealFileOptions = {}): Promise<void> {
      const normalized = path.trim();
      if (!normalized) {
          return;
      }
      if (this.lastRevealed === normalized) {
          return;
      }
      try {
          const uri = await this.resolveUri(normalized);
          const opener = await this.openerService.getOpener(uri);
          await opener.open(uri, { mode: options.activate === false ? 'reveal' : 'activate' });
          this.lastRevealed = normalized;
      } catch {
          /* workspace may not contain the path yet */
      }
  }

  resetDedup(): void {
      this.lastRevealed = '';
  }

  protected async resolveUri(path: string): Promise<URI> {
      const roots = await this.workspaceService.roots;
      const root = roots[0]?.resource;
      if (!root) {
          return new URI(path.startsWith('/') ? `file://${path}` : path);
      }
      switch (pathKind(path)) {
          case 'root': return root;
          case 'absolute': return new URI(`file://${path}`);
          default: return root.resolve(path);
      }
  }
}
