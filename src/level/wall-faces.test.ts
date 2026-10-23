import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import { Tile } from './types';
import { doorAxis, outerCorners, wallFaces, type WallFace } from './wall-faces';

const grid = (rows: string[]) => Grid.fromRows(rows, 2);
const faceAt = (faces: WallFace[], cx: number, cy: number, nx: number, nz: number) =>
  faces.find((f) => f.cx === cx && f.cy === cy && f.nx === nx && f.nz === nz);

describe('wallFaces', () => {
  it('lists one face per wall/open boundary, none between walls or out of bounds', () => {
    const g = grid(['###', '#.#', '###']);
    const faces = wallFaces(g);
    expect(faces).toHaveLength(4);
    expect(faces.every((f) => f.facing === Tile.Floor && !f.lintel)).toBe(true);
  });

  it('classifies the corners of a room as inner', () => {
    const g = grid(['####', '#..#', '#..#', '####']);
    // North wall cell (1,0), facing south (+z): tangent is −x, so the start (+x side) runs on along the
    // wall and the end (−x side) meets the west wall turning toward the room.
    const f = faceAt(wallFaces(g), 1, 0, 0, 1);
    expect(f?.end).toBe('inner');
    expect(f?.start).toBe('straight');
  });

  it('classifies the ends of a free-standing wall as outer', () => {
    const g = grid(['.....', '.###.', '.....']);
    const faces = wallFaces(g);
    const north = faceAt(faces, 1, 1, 0, -1);
    expect(north?.start === 'outer' || north?.end === 'outer').toBe(true);
    expect(faceAt(faces, 2, 1, 0, -1)).toMatchObject({ start: 'straight', end: 'straight' });
  });

  it('treats a doorway as an opening below the lintel and as wall above it', () => {
    const g = grid(['.....', '##D##', '.....']);
    const faces = wallFaces(g);
    // The wall cell west of the door, facing north: its east end meets the doorway.
    const f = faceAt(faces, 1, 1, 0, -1);
    const doorEnd = f && (f.start === 'outer' ? 'start' : 'end');
    expect(doorEnd).toBeDefined();
    expect(f?.[doorEnd === 'start' ? 'startHigh' : 'endHigh']).toBe('straight');
    // The wall beside the door faces into the doorway.
    expect(faceAt(faces, 1, 1, 1, 0)?.facing).toBe(Tile.Door);
    // Lintel faces toward both openings, none toward the jamb walls.
    const lintels = faces.filter((x) => x.lintel);
    expect(lintels).toHaveLength(2);
    expect(lintels.every((x) => x.nx === 0)).toBe(true);
  });
});

describe('outerCorners', () => {
  it('finds all four corners of a pillar', () => {
    const g = grid(['...', '.#.', '...']);
    const corners = outerCorners(g);
    expect(corners).toHaveLength(4);
    expect(new Set(corners.map((c) => `${c.vx},${c.vy}`))).toEqual(
      new Set(['1,1', '2,1', '1,2', '2,2']),
    );
  });

  it('skips doorway edges and diagonal pinches', () => {
    expect(outerCorners(grid(['.......', '.##D##.', '.......']))).toHaveLength(4);
    expect(outerCorners(grid(['#.', '.#']))).toHaveLength(0);
  });
});

describe('doorAxis', () => {
  it('runs the passage between the jamb walls', () => {
    expect(doorAxis(grid(['...', '#D#', '...']), 1, 1)).toBe('z');
    expect(doorAxis(grid(['.#.', '.D.', '.#.']), 1, 1)).toBe('x');
  });
});
