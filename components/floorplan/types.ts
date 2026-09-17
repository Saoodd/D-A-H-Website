export interface FloorFeature {
  id: string;
  type: string; // FeatureType
  label: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  rotation: number;
  // Real-world position/size, in millimetres — same dual-field pattern as
  // FloorBooth below (null until an event's physical scale is confirmed
  // and this feature has been placed/created under it).
  xMm?: number | null;
  yMm?: number | null;
  widthMm?: number | null;
  depthMm?: number | null;
}

export interface FloorBooth {
  id: string;
  code: string;
  size: string;
  status: string; // BoothStatus
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  rotation?: number;
  isMine?: boolean;
  colorHex?: string | null;
  priceAedFils?: number | null;
  widthMm?: number | null;
  depthMm?: number | null;
  // Real-world position, in millimetres — null until an event's physical
  // scale is confirmed and this booth has been placed/imported under it.
  // See lib/boothFit.ts isProvablyAdjacent, the only consumer that needs
  // position rather than just size.
  xMm?: number | null;
  yMm?: number | null;
}

export interface SizeStyle {
  color: string;
  label: string;
}
