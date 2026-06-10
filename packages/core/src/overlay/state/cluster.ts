// Pure badge-clustering math, ported verbatim from install.ts:535-578.
// DOM / mouse / open-state are NOT available here; the caller supplies those
// via the `isExpanded` callback so the positioning hook (Task 11) can wire them.

export interface Anchor {
  id: string;
  x: number;
  y: number;
}

export interface Placement {
  id: string;
  clusterX: number;
  clusterY: number;
  ox: number;
  oy: number;
  k: number;
  multi: boolean;
  /** Whether the cluster is currently expanded (multi && isExpanded returned true). */
  expanded: boolean;
}

interface Cluster {
  x: number;
  y: number;
  members: Array<{ id: string; x: number; y: number }>;
}

/**
 * Assign anchors to clusters and compute per-member badge offsets.
 *
 * @param anchors      Ordered list of badge anchor points (one per item).
 * @param isExpanded   Called with `(clusterX, clusterY, anyMemberMulti, memberIds)`.
 *                     Return true when the cluster should expand vertically
 *                     (mouse near OR any card open). The effective expanded
 *                     flag is `multi && isExpanded(...)`.
 */
export function clusterAnchors(
  anchors: Anchor[],
  isExpanded: (
    clusterX: number,
    clusterY: number,
    anyMemberMulti: boolean,
    memberIds: string[],
  ) => boolean,
): Placement[] {
  // 1. Build clusters — port of install.ts:535-549
  const clusters: Cluster[] = [];

  for (const a of anchors) {
    let c: Cluster | null = null;
    for (let i = 0; i < clusters.length; i++) {
      if (Math.abs(clusters[i].x - a.x) <= 18 && Math.abs(clusters[i].y - a.y) <= 18) {
        c = clusters[i];
        break;
      }
    }
    if (!c) {
      c = { x: a.x, y: a.y, members: [] };
      clusters.push(c);
    }
    c.members.push({ id: a.id, x: a.x, y: a.y });
  }

  // 2. Compute placements — port of install.ts:550-578
  const placements: Placement[] = [];

  for (const cl of clusters) {
    const multi = cl.members.length > 1;
    const memberIds = cl.members.map((m) => m.id);
    const expanded = multi && isExpanded(cl.x, cl.y, multi, memberIds);

    cl.members.forEach((m, k) => {
      let ox = 0;
      let oy = 0;
      if (multi) {
        if (expanded) {
          oy = k * 24;
        } else {
          ox = k * 4;
          oy = k * 4;
        }
      }
      placements.push({ id: m.id, clusterX: cl.x, clusterY: cl.y, ox, oy, k, multi, expanded });
    });
  }

  return placements;
}
