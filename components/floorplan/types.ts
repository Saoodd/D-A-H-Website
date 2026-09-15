export interface FloorFeature {
  id: string;
  type: string; // FeatureType
  label: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  rotation: number;
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
}

export interface SizeStyle {
  color: string;
  label: string;
}
