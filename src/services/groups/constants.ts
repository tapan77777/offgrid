// Product limit — not a networking claim. Enforced at the service layer when
// a member joins a group. The Phase-5 target group size for hikes/trips is
// small (see 01-PRD.md), so 50 is a comfortable ceiling that keeps member
// lists and future presence updates cheap.
export const GROUP_MEMBER_LIMIT = 50;

// Join codes are derived from the group UUID (see joinCode.ts). Length is
// fixed so codes can be typed by hand and compared visually. This is a
// convenience mechanism, NOT a cryptographic secret — see 05-SECURITY.md §8.
export const JOIN_CODE_LENGTH = 8;

// Minimum acceptable group name length after trimming.
export const GROUP_NAME_MIN_LENGTH = 1;
export const GROUP_NAME_MAX_LENGTH = 64;
