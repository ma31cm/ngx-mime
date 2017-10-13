import { Rect } from '../models/rect';
import { Service } from '../models/manifest';
export interface TilePositionCriteria {
  tileIndex: number;
  tileSource: Service;
  previousTilePosition?: Rect;
}

export interface CalculateTilePositionStrategy {
  calculateTilePosition(criteria: TilePositionCriteria): Rect;
}
