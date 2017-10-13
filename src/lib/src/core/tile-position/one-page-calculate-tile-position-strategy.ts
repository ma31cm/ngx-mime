import { CalculateTilePositionStrategy, TilePositionCriteria } from './calculate-tile-position-strategy';
import { Rect } from '../models/rect';
import { ViewerOptions } from '../models/viewer-options';

export class OnePageCalculateTilePositionStrategy implements CalculateTilePositionStrategy {

  calculateTilePosition(criteria: TilePositionCriteria): Rect {

    let x: number;

    if (!criteria.tileIndex) {
      x = (criteria.tileSource.width / 2) * -1;
    } else {
      x = criteria.previousTilePosition.x
        + criteria.previousTilePosition.width
        + ViewerOptions.overlays.pageMarginDashboardView;
    }

    return new Rect({
      height: criteria.tileSource.height,
      width: criteria.tileSource.width,
      x: x,
      y: (criteria.tileSource.height / 2) * -1
    });
  }
}
