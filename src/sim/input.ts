// Abstract per-player input. Produced by keyboard/gamepad/bots on the client,
// or received over the network on the server. Movement is in world space (XZ).

export interface PlayerInput {
  moveX: number; // -1..1, world +X
  moveZ: number; // -1..1, world +Z
  jump: boolean;
  punch: boolean;
  grab: boolean;
  lift: boolean;
  sprint: boolean;
}

export const emptyInput = (): PlayerInput => ({
  moveX: 0,
  moveZ: 0,
  jump: false,
  punch: false,
  grab: false,
  lift: false,
  sprint: false,
});

export function copyInput(dst: PlayerInput, src: PlayerInput): void {
  dst.moveX = src.moveX;
  dst.moveZ = src.moveZ;
  dst.jump = src.jump;
  dst.punch = src.punch;
  dst.grab = src.grab;
  dst.lift = src.lift;
  dst.sprint = src.sprint;
}
