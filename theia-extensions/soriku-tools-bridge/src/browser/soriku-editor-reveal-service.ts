/********************************************************************************
 * Soriku IDE — open changed files in the editor as the agent writes them
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { isPathWithinRoot, pathKind } from '../common/tool-delegation';

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

  /**
   * Resolves an engine-reported path for revealing. Contained to the workspace like every other path the
   * agent can name: an absolute path outside it (or any path with no workspace open) is refused, so an
   * event from the engine can never make the IDE open an arbitrary file.
   */
  protected async resolveUri(path: string): Promise<URI> {
      const roots = await this.workspaceService.roots;
      const root = roots[0]?.resource;
      if (!root) {
          throw new Error('No workspace folder is open.');
      }
      let candidate: URI;
      switch (pathKind(path)) {
          case 'root': return root;
          case 'absolute': candidate = root.withPath(path); break;
          default: candidate = root.resolve(path); break;
      }
      if (!isPathWithinRoot(root.path.toString(), candidate.path.toString())) {
          throw new Error(`Refused: "${path}" is outside the workspace folder.`);
      }
      return candidate;
  }
}
