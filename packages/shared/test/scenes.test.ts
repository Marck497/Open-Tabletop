import { describe, expect, it } from 'vitest';
import { buildSceneTree, folderCycle, type Scene, type SceneFolder } from '../src/index.js';

const folder = (id: string, parentId: string | null, sortOrder = 0): SceneFolder => ({ id, campaignId: 'c', name: id, parentId, sortOrder });
const scene = (id: string, folderId: string | null, sortOrder = 0) => ({ id, name: id, folderId, sortOrder }) as Scene;

describe('carpetas de escenas', () => {
  it('detecta bucles', () => {
    const fs = [folder('a', null), folder('b', 'a'), folder('c', 'b')];
    expect(folderCycle(fs, 'a', 'c')).toBe(true);
    expect(folderCycle(fs, 'a', 'a')).toBe(true);
    expect(folderCycle(fs, 'c', 'a')).toBe(false);
    expect(folderCycle(fs, 'b', null)).toBe(false);
  });

  it('arma el árbol ordenado y manda a la raíz lo huérfano', () => {
    const tree = buildSceneTree(
      [folder('a', null, 1), folder('z', null, 0), folder('b', 'a'), folder('x', 'perdida', 5)],
      [scene('s1', 'b', 2), scene('s2', 'b', 1), scene('s3', null), scene('s4', 'borrada')],
    );
    expect(tree.folders.map((n) => n.folder.id)).toEqual(['z', 'a', 'x']);
    expect(tree.folders[1]!.folders[0]!.scenes.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(tree.scenes.map((s) => s.id)).toEqual(['s3', 's4']);
  });

  it('no se cuelga con carpetas en bucle (copias trucadas o dañadas)', () => {
    const tree = buildSceneTree([folder('a', 'b'), folder('b', 'a'), folder('c', 'c'), folder('d', 'a')], [scene('s1', 'a')]);
    expect(tree.folders.map((n) => n.folder.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(tree.folders.every((n) => n.folders.length === 0)).toBe(true);
    expect(tree.folders.find((n) => n.folder.id === 'a')!.scenes.map((s) => s.id)).toEqual(['s1']);
  });
});
