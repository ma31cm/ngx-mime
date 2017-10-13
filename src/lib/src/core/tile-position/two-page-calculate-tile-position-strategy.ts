import { CalculateTilePositionStrategy, TilePositionCriteria } from './calculate-tile-position-strategy';
import { Rect } from '../models/rect';
import { ViewerOptions } from '../models/viewer-options';

export class TwoPageCalculateTilePositionStrategy implements CalculateTilePositionStrategy {

  calculateTilePosition(criteria: TilePositionCriteria): Rect {

    let x: number;

    if (!criteria.tileIndex) {
      // First page
      x = 0;
    } else if (criteria.tileIndex % 2) {
      // Even page numbers
      x = criteria.previousTilePosition.x
        + criteria.previousTilePosition.width
        + ViewerOptions.overlays.pageMarginDashboardView;
    } else {
      // Odd page numbers
      x = criteria.previousTilePosition.x
        + criteria.previousTilePosition.width;
    }

    return new Rect({
      height: criteria.tileSource.height,
      width: criteria.tileSource.width,
      x: x,
      y: (criteria.tileSource.height / 2) * -1
    });

  }
}
