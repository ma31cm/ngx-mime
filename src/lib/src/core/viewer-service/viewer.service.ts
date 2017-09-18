import { PanDirection } from '../models/pan-direction';
import { BehaviorSubject, Subject } from 'rxjs/Rx';
import { CustomOptions } from '../models/options-custom';
import { Injectable, NgZone, OnInit } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';
import { Utils } from '../../core/utils';
import { ModeService } from '../../core/mode-service/mode.service';
import { Manifest, Service } from '../models/manifest';
import { Options } from '../models/options';
import { PageService } from '../page-service/page-service';
import { ViewerMode } from '../models/viewer-mode';
import { ClickService } from '../click-service/click.service';
import '../ext/svg-overlay';
import * as d3 from 'd3';

declare const OpenSeadragon: any;

@Injectable()
export class ViewerService implements OnInit {

  private viewer: any;
  private svgNode: any;
  private options: Options;

  private overlays: Array<SVGRectElement>;
  private tileSources: Array<Service>;
  private subscriptions: Array<Subscription> = [];

  public isCurrentPageFittedViewport = false;
  public isCanvasPressed: Subject<boolean> = new Subject<boolean>();
  public isAnimating: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private horizontalPadding = 0;

  // TODO: Move this to config when merging
  private readonly PAN_SENSITIVITY_MARGIN = 40;

  constructor(
    private zone: NgZone,
    private clickService: ClickService,
    private pageService: PageService,
    private modeService: ModeService
  ) { }

  ngOnInit(): void { }

  public getViewer(): any {
    return this.viewer;
  }

  public getTilesources(): Service[] {
    return this.tileSources;
  }

  public getOverlays(): SVGRectElement[] {
    return this.overlays;
  }

  public getZoom(): number {
    return this.shortenDecimals(this.viewer.viewport.getZoom(true), 5);
  }

  public getHomeZoom(): number {
    return this.shortenDecimals(this.viewer.viewport.getHomeZoom(), 5);
  }

  public getMinZoom(): number {
    return this.shortenDecimals(this.viewer.viewport.getMinZoom(), 5);
  }

  public getMaxZoom(): number {
    return this.shortenDecimals(this.viewer.viewport.getMaxZoom(), 5);
  }

  public zoomHome(): void {
    this.zoomTo(this.getHomeZoom());
  }

  public zoomTo(level: number): void {
    this.viewer.viewport.zoomTo(level);
  }

  setUpViewer(manifest: Manifest) {
    if (manifest.tileSource) {
      this.tileSources = manifest.tileSource;
      this.zone.runOutsideAngular(() => {
        this.clearOpenSeadragonTooltips();
        this.options = new Options(manifest.tileSource);
        this.viewer = new OpenSeadragon.Viewer(Object.assign({}, this.options));
        this.pageService.reset();
        this.pageService.numberOfPages = this.tileSources.length;
      });

      this.subscriptions.push(this.modeService.onChange.subscribe((mode: ViewerMode) => {
        this.setSettings(mode);
      }));

      this.addToWindow();
      this.createOverlays();
      this.addEvents();
    }
  }

  nextPage() {
    const newPage = this.pageService.getNextPage();
    this.toggleToPage();
  }

  prevPage() {
    const newPage = this.pageService.getPrevPage();
    this.toggleToPage();
  }


  addToWindow() {
    window.openSeadragonViewer = this.viewer;
  }

  destroy() {
    if (this.viewer != null && this.viewer.isOpen()) {
      this.viewer.destroy();
    }
    this.subscriptions.forEach((subscription: Subscription) => {
      subscription.unsubscribe();
    });
  }

  /**
   * Disables navigation with keyboard.
   * Seems to be no way to set this in options?
   */
  disableKeyboardNavigation() {
    this.viewer.innerTracker.keyHandler = null;
    this.viewer.innerTracker.keyDownHandler = null;
    this.viewer.innerTracker.keyPressHandler = null;
  }

  addEvents(): void {
    this.addOverrides();
    this.disableKeyboardNavigation();
    this.clickService.reset();
    this.clickService.addSingleClickHandler(this.singleClickHandler);
    this.clickService.addDoubleClickHandler(this.dblClickHandler);
    this.viewer.addHandler('animation-start', () => {
      this.isAnimating.next(true);
    });
    this.viewer.addHandler('animation-finish', this.animationsEndCallback);
    this.viewer.addHandler('canvas-click', this.clickService.click);
    this.viewer.addHandler('canvas-double-click', (e: any) => e.preventDefaultAction = true);
    this.viewer.addHandler('canvas-press', () => this.isCanvasPressed.next(true));
    this.viewer.addHandler('canvas-release', () => this.isCanvasPressed.next(false));
    this.viewer.addHandler('canvas-scroll', this.scrollToggleMode);
    this.viewer.addHandler('canvas-pinch', this.pinchToggleMode);

  }

  // Binds to OSD-Toolbar button
  zoomIn(): void {
    // This check could be removed later since OSD-Toolbar isnt visible in DASHBOARD-view
    if (this.modeService.mode === ViewerMode.DASHBOARD) {
      return;
    }
    this.zoomTo(this.getZoom() + CustomOptions.zoom.zoomfactor);
  }

  // Binds to OSD-Toolbar button
  zoomOut(): void {
    // This check could be removed later since OSD-Toolbar isnt visible in DASHBOARD-view
    if (this.modeService.mode === ViewerMode.DASHBOARD) {
      return;
    }
    this.isPageFittedOrSmaller() ? this.toggleToPage() : this.zoomTo(this.getZoom() - CustomOptions.zoom.zoomfactor);
  }


  /**
   * Overrides for default OSD-functions
   */
  addOverrides(): void {
    // Raised when viewer loads first time
    this.viewer.viewport.goHome = () => {
      this.viewer.raiseEvent('home');
      this.modeService.initialMode === ViewerMode.DASHBOARD ? this.toggleToDashboard() : this.toggleToPage();
    };
  }


  /**
   * Set settings for page/dashboard-mode
   * @param mode ViewerMode
   */
  setSettings(mode: ViewerMode) {
    if (mode === ViewerMode.DASHBOARD) {
      this.setDashboardSettings();
    } else if (mode === ViewerMode.PAGE) {
      this.setPageSettings();
    }
  }

  /**
   * Set settings for dashboard-mode
   */
  setDashboardSettings(): void {
    this.viewer.panVertical = false;
    this.viewer.gestureSettingsTouch.pinchToZoom = false;
    this.viewer.gestureSettingsMouse.scrollToZoom = false;
  }

  /**
   * Set settings for page-mode
   */
  setPageSettings(): void {
    // TODO: Allow panning when zoomed in on Page View
    this.viewer.panVertical = true;

    setTimeout(() => {
      this.viewer.gestureSettingsTouch.pinchToZoom = true;
      this.viewer.gestureSettingsMouse.scrollToZoom = true;
    }, 300);
  }

  /**
   * Switches to DASHBOARD-mode and fit bounds to dashboard home
   */
  toggleToDashboard(): void {
    this.modeService.mode = ViewerMode.DASHBOARD;
    this.zoomTo(this.getHomeZoom());
  }

  /**
   * Switches to PAGE-mode and fits bounds to current page
   */
  toggleToPage(): void {
    if (!this.pageService.isCurrentPageValid()) {
      return;
    }
    this.modeService.mode = ViewerMode.PAGE;
    this.fitBounds(this.overlays[this.pageService.currentPage]);
  }

  /**
   * Scroll-toggle-handler
   * Scroll-up dashboard-mode: Toggle page-mode
   * Scroll-down page-mode: Toggle dashboard-mode if page is at min-zoom
   */
  scrollToggleMode = (e: any) => {
    let event = e.originalEvent;
    let delta = (event.wheelDelta) ? event.wheelDelta : -event.deltaY;

    // Scrolling up
    if (delta > 0) {
      if (this.modeService.mode === ViewerMode.DASHBOARD) {
        this.toggleToPage();
      }
      // Scrolling down
    } else if (delta < 0) {
      if (this.modeService.mode === ViewerMode.PAGE && this.isPageFittedOrSmaller()) {
        this.toggleToDashboard();
      }
    }
  }

  /**
   * Pinch-toggle-handler
   * Pinch-out dashboard-mode: Toggles page-mode
   * Pinch-in page-mode: Toggles dashboard-mode if page is at min-zoom
   */
  pinchToggleMode = (event: any) => {

    // Pinch Out
    if (event.distance > event.lastDistance) {
      if (this.modeService.mode === ViewerMode.DASHBOARD) {
        this.toggleToPage();
      }
      // Pinch In
    } else {
      if (this.modeService.mode === ViewerMode.PAGE && this.isPageFittedOrSmaller()) {
        this.toggleToDashboard();
      }
    }
  }

  /**
   * Adds single-click-handler
   * Single-click toggles between page/dashboard-mode if a page is hit
   */
  singleClickHandler = (event: any) => {
    let target = event.originalEvent.target;
    let requestedPage = this.getOverlayIndexFromClickEvent(target);
    if (this.isPageHit(target)) {
      this.pageService.currentPage = requestedPage;
      this.modeService.toggleMode();
      this.modeService.mode === ViewerMode.PAGE ? this.toggleToPage() : this.toggleToDashboard();
    }
  }

  /**
   * Double-click-handler
   * Double-click dashboard-mode should go to page-mode
   * Double-click page-mode should
   *    a) Zoom in if page is fitted vertically, or
   *    b) Fit vertically if page is already zoomed in
   */
  dblClickHandler = (event: any) => {
    let target = event.originalEvent.target;
    // Page is fitted vertically, so dbl-click zooms in
    if (this.isCurrentPageFittedViewport) {
      this.zoomTo(this.getZoom() * this.options.zoomPerClick);
    } else {
      let requestedPage = this.getOverlayIndexFromClickEvent(target);
      if (requestedPage >= 0) {
        this.pageService.currentPage = requestedPage;
      }
      this.toggleToPage();
    }
  }

  /**
   * Called each time an animation ends
   */
  animationsEndCallback = () => {
    this.isCurrentPageFittedViewport = this.getIsCurrentPageFittedViewport();
    this.isAnimating.next(false);
  }

  /**
   * Checks whether current overlaybounds' width or height is equal to viewport
   * (Note that this function is called after animation is ended for correct calculation)
   */
  getIsCurrentPageFittedViewport(): boolean {
    const pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
    const viewportBounds = this.viewer.viewport.getBounds();
    const widthIsFitted = Utils.numbersAreClose(pageBounds.width, viewportBounds.width, 5);
    const heightIsFitted = Utils.numbersAreClose(pageBounds.height, viewportBounds.height, 5);
    return widthIsFitted || heightIsFitted;
  }

  isPageFittedOrSmaller(): boolean {
    const pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
    const viewportBounds = this.viewer.viewport.getBounds();

    return (Math.round(pageBounds.height) <= Math.round(viewportBounds.height))
      || (Math.round(pageBounds.width) <= Math.round(viewportBounds.width));
  }

  /**
   * Checks if hit element is a <rect>-element
   * @param target
   */
  isPageHit(target: HTMLElement): boolean {
    return target instanceof SVGRectElement;
  }

  /**
   * Iterates tilesources and adds them to viewer
   * Creates svg clickable overlays for each tile
   */
  createOverlays(): void {
    this.overlays = [];
    let svgOverlay = this.viewer.svgOverlay();
    this.svgNode = d3.select(svgOverlay.node());

    let center = new OpenSeadragon.Point(0, 0);
    let currentX = center.x - (this.tileSources[0].width / 2);
    let height = this.tileSources[0].height;


    this.tileSources.forEach((tile, i) => {

      // TODO: Logic for tiles wider and shorter than the viewport
      if (tile.height !== height) {
        let heightChangeRatio = height / tile.height;
        tile.height = height;
        tile.width = heightChangeRatio * tile.width;
      }

      let currentY = center.y - tile.height / 2;
      this.viewer.addTiledImage({
        index: i,
        tileSource: tile,
        height: tile.height,
        x: currentX,
        y: currentY
      });

      // Style overlay to match tile
      this.svgNode.append('rect')
        .attr('x', currentX)
        .attr('y', currentY)
        .attr('width', tile.width)
        .attr('height', tile.height)
        .attr('class', 'tile');
      let currentOverlay: SVGRectElement = this.svgNode.node().childNodes[i];
      this.overlays.push(currentOverlay);
      currentX = currentX + tile.width + CustomOptions.overlays.tilesMargin;
    });
  }

  /**
   * Fit bounds to first page
   */
  fitBoundsToStart(): void {
    // Don't need to fit bounds if pages < 3
    if (this.overlays.length < 3) {
      return;
    }
    let firstpageDashboardBounds = this.viewer.viewport.getBounds();
    firstpageDashboardBounds.x = 0;
    this.viewer.viewport.fitBounds(firstpageDashboardBounds);
  }

  /**
   * Fit viewport bounds to an overlay
   * @param overlay
   */
  fitBounds(overlay: SVGRectElement): void {
    this.viewer.viewport.fitBounds(this.createRectangle(overlay));
  }

  /**
   * Returns an OpenSeadragon.Rectangle instance of an overlay
   * @param overlay
   */
  createRectangle(overlay: SVGRectElement): any {
    return new OpenSeadragon.Rect(
      overlay.x.baseVal.value,
      overlay.y.baseVal.value,
      overlay.width.baseVal.value,
      overlay.height.baseVal.value
    );
  }

  /**
   * Returns overlay-index for click-event if hit
   * @param target hit <rect>
   */
  getOverlayIndexFromClickEvent(target: any) {
    if (this.isPageHit(target)) {
      let requestedPage = this.overlays.indexOf(target);
      if (requestedPage >= 0) {
        return requestedPage;
      }
    }
    return -1;
  }


  private clearOpenSeadragonTooltips() {
    OpenSeadragon.setString('Tooltips.Home', '');
    OpenSeadragon.setString('Tooltips.ZoomOut', '');
    OpenSeadragon.setString('Tooltips.ZoomIn', '');
    OpenSeadragon.setString('Tooltips.NextPage', '');
    OpenSeadragon.setString('Tooltips.ZoomIn', '');
    OpenSeadragon.setString('Tooltips.FullPage', '');
  }

  private shortenDecimals(zoom: string, precision: number): number {
    const short = Number(zoom).toPrecision(precision);
    return Number(short);
  }



  /**
   * Handler for drag-events
   */
  dragEndHandler = (e: any) => {
    const pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);

    // If zoomed in page mode
    if (this.isZoomedInPageMode()) {
      const dir: PanDirection = this.getPanDirection(pageBounds);
      if (dir !== undefined) {
        // First fit current page
        this.toggleToPage();
        // Then pan to next or previous page
        // Needs timeout because we have to wait for first animation to end

        setTimeout(() => {
          this.panToNextOrPreviousPageFromDirection(dir);
        }, CustomOptions.transitions.OSDAnimationTime);

      }
      // Dash or fitted-page-mode
    } else {
      const page = this.getNewPageFromPanning();
      if (page >= 0) {
        this.pageService.currentPage = page;
        this.panToPage();
      }
    }
  }

  /**
   * Iterates pages
   * Returns index of new page to pan to
   */
  getNewPageFromPanning(): number {
    const viewportBounds = this.viewer.viewport.getBounds();
    const centerX = viewportBounds.x + (viewportBounds.width / 2);
    let foundPage = -1;

    this.tileSources.some((tile, i) => {
      const page = this.viewer.world.getItemAt(i);
      if (!page) {
        return;
      }

      const pageBounds = page.getBounds(true);

      if (pageBounds.x + pageBounds.width > centerX) {
        // Center point is within pagebounds
        if (pageBounds.x < centerX) {
          foundPage = i;
        } else {
          // No use case before first page as OpenSeadragon prevents it by default

          // Centre point is between two tiles
          let previouspageBounds = this.viewer.world.getItemAt(i - 1).getBounds();
          let marginLeft = previouspageBounds.x + previouspageBounds.width;
          let marginCentre = marginLeft + ((pageBounds.x - marginLeft) / 2);

          if (centerX > marginCentre) {
            foundPage = i;

          } else {
            foundPage = i - 1;

          }
        }

        return true;
      }
      // No use case beyond last page as OpenSeadragon prevents it by default

    });

    return foundPage;
  }

  /**
   * Pans to next or previous page depending on direction
   * @param {PanDirection}
   */
  panToNextOrPreviousPageFromDirection(dir: PanDirection) {
    if (dir === PanDirection.LEFT) {
      this.pageService.getNextPage();
    } else if (dir === PanDirection.RIGHT) {
      this.pageService.getPrevPage();
    }
    this.panToPage();
  }

  /**
   * Pans to center of current page
   */
  private panToPage(): void {
    const pageBounds = this.createRectangle(this.overlays[this.pageService.currentPage]);
    const center = new OpenSeadragon.Point(pageBounds.x + (pageBounds.width / 2), pageBounds.y + (pageBounds.height / 2));
    this.viewer.viewport.panTo(center, false);
  }


  private isZoomedInPageMode(): boolean {
    return this.modeService.mode === ViewerMode.PAGE && !this.isPageFittedOrSmaller();
  }


  /**
   * Calculates PanDirection for a page
   * @param page : Overlay for page
   * @returns {PanDirection} undefined if not RIGHT or LEFT
   */
  private getPanDirection(page: any): PanDirection {
    const vpBounds = this.viewer.viewport.getBounds();
    return (
      (vpBounds.x - this.PAN_SENSITIVITY_MARGIN < page.x) ? PanDirection.RIGHT
        : (vpBounds.x + vpBounds.width + this.PAN_SENSITIVITY_MARGIN > page.x + page.width) ? PanDirection.LEFT
          : undefined);
  }


}
