import { CalculateTilePositionStrategy } from './calculate-tile-position-strategy';
import { OnePageCalculateTilePositionStrategy } from './one-page-calculate-tile-position-strategy';
import { TwoPageCalculateTilePositionStrategy } from './two-page-calculate-tile-position-strategy';
import { ViewerLayout } from '../models/viewer-layout';

export class CalculateTilePositionFactory {

  public static create(viewerLayout: ViewerLayout, paged: boolean): CalculateTilePositionStrategy {
    if (viewerLayout === ViewerLayout.ONE_PAGE || !paged) {
      return new OnePageCalculateTilePositionStrategy();
    } else if (viewerLayout === ViewerLayout.TWO_PAGE) {
      return new TwoPageCalculateTilePositionStrategy();
    }
  }
}
