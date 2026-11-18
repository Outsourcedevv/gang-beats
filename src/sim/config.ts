// Central tuning values for the physics sim. Change feel here, not deep in the code.

export const PHYSICS = {
  /** Fixed simulation rate (Hz). The renderer interpolates between steps. */
  rate: 60,
  gravity: -18, // stronger than real gravity: snappier, more readable falls
  solverIterations: 6,
  killY: -9, // below this a character is eliminated
};

export const BODY = {
  hoverHeight: 0.665, // desired pelvis-centre height above ground
  hoverReach: 1.15, // ground ray length from the pelvis
  hoverStiffness: 140,
  hoverDamping: 16,
  uprightStiffness: 260,
  uprightDamping: 26,
  yawStiffness: 140,
  yawDamping: 18,
  headStiffness: 160,
  headDamping: 14,
  limbStiffness: 260,
  limbDamping: 22,
  /** Fraction of muscle strength kept while knocked out (floppy but not spaghetti). */
  koMuscle: 0.08,
  fallTiltDot: 0.35, // torso-up · world-up below this means we've toppled
  recoverRate: 1.1, // balance regained per second after a stun ends
};

export const MOVE = {
  walkSpeed: 3.6,
  sprintMul: 1.45, // Stage 2 adds stamina cost
  accel: 9,
  maxAccel: 32,
  airControl: 0.22,
  turnRate: 11, // rad/s facing turn speed
  jumpSpeed: 6.4,
  jumpCooldown: 0.45,
};

export const COMBAT = {
  windup: 0.08,
  strike: 0.16,
  recover: 0.16,
  punchHandSpeed: 11,
  minHitSpeed: 2.5,
  knockbackBase: 14,
  knockbackPerSpeed: 2.4,
  dazeHeadBase: 9,
  dazeHeadPerSpeed: 1.4,
  dazeBodyBase: 3,
  dazeBodyPerSpeed: 0.6,
  dazeDecayDelay: 1.4,
  dazeDecay: 14,
  koThreshold: 100,
  koDuration: 3.8,
  suddenKoSpeed: 13, // head hits above this relative speed can KO instantly
  suddenKoChancePerSpeed: 0.07,
  impactHeadThreshold: 7.5, // head delta-v per step that counts as a slam
  impactDazePerSpeed: 6,
  mashReduction: 0.14,
};

export const GRAB = {
  probeExtra: 0.08,
  breakDistance: 0.32,
  regrabCooldown: 0.35,
  liftTime: 0.4,
  holdHeight: 1.15,
  liftAssist: 46,
  liftAssistDamping: 7,
  liftResistFactor: 0.25, // conscious victims are harder to lift...
  liftConsciousGravity: 0.2, // ...and too heavy to hoist fully overhead
  throwForward: 6.2,
  throwUp: 3.6,
  throwConsciousFactor: 0.5,
  throwStun: 0.7,
  /** Struggle: each button press while held adds this much; 1.0 breaks free. */
  escapePerPress: 0.25,
  escapePerSecondMoving: 0.25,
  escapeDecay: 0.25,
};
