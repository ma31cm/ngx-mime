import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  Output,
  OnChanges,
  OnDestroy,
  OnInit,
  EventEmitter,
  SimpleChange,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { ObservableMedia } from '@angular/flex-layout';
import { Subscription } from 'rxjs/Subscription';
import { Observable } from 'rxjs/Observable';

import { IiifManifestService } from '../core/iiif-manifest-service/iiif-manifest-service';
import { ContentsDialogService } from '../contents-dialog/contents-dialog.service';
import { AttributionDialogService } from '../attribution-dialog/attribution-dialog.service';
import { ContentSearchDialogService } from '../content-search-dialog/content-search-dialog.service';
import { MimeResizeService } from '../core/mime-resize-service/mime-resize.service';
import { Manifest } from '../core/models/manifest';
import { ModeService } from '../core/mode-service/mode.service';
import { ViewerMode } from '../core/models/viewer-mode';
import { ViewerHeaderComponent } from './viewer-header/viewer-header.component';
import { ViewerFooterComponent } from './viewer-footer/viewer-footer.component';
import { OsdToolbarComponent } from './osd-toolbar/osd-toolbar.component';
import { ViewerService } from '../core/viewer-service/viewer.service';
import { MimeViewerConfig } from '../core/mime-viewer-config';
import { IiifContentSearchService } from './../core/iiif-content-search-service/iiif-content-search.service';
import { SearchResult } from './../core/models/search-result';
import { ViewerOptions } from '../core/models/viewer-options';
import { MimeViewerIntl } from '../core/intl/viewer-intl';
import { ViewerLayout } from '../core/models/viewer-layout';
import { ViewerLayoutService } from '../core/viewer-layout-service/viewer-layout-service';

@Component({
  selector: 'mime-viewer',
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': '[$event]' }
})
export class ViewerComponent implements OnInit, OnDestroy, OnChanges {
  @Input() public manifestUri: string;
  @Input() public q: string;
  @Input() public canvasIndex: number;
  @Input() public config: MimeViewerConfig = new MimeViewerConfig();
  @Output('pageModeChanged') onPageModeChange: EventEmitter<ViewerMode> = new EventEmitter();
  @Output('pageChanged') onPageChange: EventEmitter<number> = new EventEmitter();

  private subscriptions: Array<Subscription> = [];
  private isCanvasPressed = false;
  private currentManifest: Manifest;
  private viewerLayout: ViewerLayout;

  public errorMessage: string = null;

  // Viewchilds
  @ViewChild('mimeHeader') header: ViewerHeaderComponent;
  @ViewChild('mimeFooter') footer: ViewerFooterComponent;
  @ViewChild('mimeOsdToolbar') osdToolbar: OsdToolbarComponent;

  constructor(
    public intl: MimeViewerIntl,
    public media: ObservableMedia,
    private el: ElementRef,
    private iiifManifestService: IiifManifestService,
    private contentsDialogService: ContentsDialogService,
    private attributionDialogService: AttributionDialogService,
    private contentSearchDialogService: ContentSearchDialogService,
    private viewerService: ViewerService,
    private mimeService: MimeResizeService,
    private changeDetectorRef: ChangeDetectorRef,
    private modeService: ModeService,
    private iiifContentSearchService: IiifContentSearchService,
    private viewerLayoutService: ViewerLayoutService,
  ) {
    contentsDialogService.el = el;
    attributionDialogService.el = el;
    contentSearchDialogService.el = el;
    mimeService.el = el;
  }

  ngOnInit(): void {
    this.modeService.initialMode = this.config.initViewerMode;
    this.subscriptions.push(
      this.iiifManifestService.currentManifest
        .subscribe((manifest: Manifest) => {
          if (manifest) {
            this.viewerLayoutService.init(manifest, this.isMobile());
            this.cleanup();
            this.initialize();
            this.currentManifest = manifest;
            this.changeDetectorRef.detectChanges();
            this.viewerService.setUpViewer(manifest);
            if (this.config.attributionDialogEnabled && manifest.attribution) {
              this.attributionDialogService.open(this.config.attributionDialogHideTimeout);
            }

            if (this.q) {
              this.iiifContentSearchService.search(manifest, this.q);
            }
          }
        })
    );

    this.subscriptions.push(
      this.viewerService.onOsdReadyChange.subscribe((state: boolean) => {
        if (state && this.canvasIndex) {
          this.viewerService.goToTile(this.canvasIndex, false);
        }
      })
    );

    this.subscriptions.push(
      this.iiifManifestService.errorMessage.subscribe((error: string) => {
        this.resetCurrentManifest();
        this.errorMessage = error;
        this.changeDetectorRef.detectChanges();
      })
    );

    this.subscriptions.push(
      this.iiifContentSearchService.onChange.subscribe((sr: SearchResult) => {
        this.viewerService.highlight(sr);
      })
    );

    this.subscriptions.push(
      this.viewerService.isCanvasPressed.subscribe((value: boolean) => {
        this.isCanvasPressed = value;
        this.changeDetectorRef.detectChanges();
      })
    );

    this.subscriptions.push(
      this.modeService.onChange.subscribe((mode: ViewerMode) => {
        this.toggleToolbarsState(mode);
        this.onPageModeChange.emit(mode);
      })
    );

    this.subscriptions.push(
      this.viewerService.onPageChange.subscribe((pageNumber: number) => {
        this.onPageChange.emit(pageNumber);
      })
    );

    this.subscriptions.push(
      this.mimeService.onResize.throttle(val => Observable.interval(ViewerOptions.transitions.OSDAnimationTime)).subscribe(() => {
        setTimeout(() => {
          this.viewerService.home();
        }, ViewerOptions.transitions.OSDAnimationTime);
      })
    );

    this.subscriptions.push(this.viewerLayoutService.viewerLayoutState.subscribe((viewerLayout: ViewerLayout) => {
      this.viewerLayout = viewerLayout;
    }));

    this.loadManifest();
  }

  ngOnChanges(changes: SimpleChanges): void {
    let manifestUriIsChanged = false;
    let qIsChanged = false;
    let canvasIndexChanged = false;
    if (changes['q']) {
      const qChanges: SimpleChange = changes['q'];
      if (!qChanges.isFirstChange() && qChanges.currentValue !== qChanges.firstChange) {
        this.q = qChanges.currentValue;
        qIsChanged = true;
      }
    }
    if (changes['canvasIndex']) {
      const canvasIndexChanges: SimpleChange = changes['canvasIndex'];
      if (!canvasIndexChanges.isFirstChange() && canvasIndexChanges.currentValue !== canvasIndexChanges.firstChange) {
        this.canvasIndex = canvasIndexChanges.currentValue;
        canvasIndexChanged = true;
      }
    }
    if (changes['manifestUri']) {
      const manifestUriChanges: SimpleChange = changes['manifestUri'];
      if (!manifestUriChanges.isFirstChange() && manifestUriChanges.currentValue !== manifestUriChanges.previousValue) {
        this.modeService.mode = this.config.initViewerMode;
        this.manifestUri = manifestUriChanges.currentValue;
        manifestUriIsChanged = true;
      }
    }

    if (manifestUriIsChanged) {
      this.cleanup();
      this.loadManifest();
    } else {
      if (qIsChanged) {
        this.iiifContentSearchService.search(this.currentManifest, this.q);
      }
      if (canvasIndexChanged) {
        this.viewerService.goToTile(this.canvasIndex, true);
      }
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription: Subscription) => {
      subscription.unsubscribe();
    });
    this.cleanup();
    this.iiifManifestService.destroy();
    this.iiifContentSearchService.destroy();
  }

  // ChangeDetection fix
  onModeChange() {
    /*
    if (this.modeService.mode === ViewerMode.DASHBOARD) {
      this.contentsDialogService.destroy();
      this.contentSearchDialogService.destroy();
    }
    */
  }

  toggleToolbarsState(mode: ViewerMode): void {
    if (this.header && this.footer) {
      switch (mode) {
        case ViewerMode.DASHBOARD:
          this.header.state = this.footer.state = 'show';
          if (this.config.navigationControlEnabled && this.osdToolbar) {
            this.osdToolbar.state = 'hide';
          }
          break;
        case ViewerMode.PAGE:
          this.header.state = this.footer.state = 'hide';
          if (this.config.navigationControlEnabled && this.osdToolbar) {
            this.osdToolbar.state = 'show';
          }
          break;
      }
      this.changeDetectorRef.detectChanges();
    }
  }

  ngAfterViewChecked() {
    this.mimeService.markForCheck();
  }

  private loadManifest() {
    this.iiifManifestService.load(this.manifestUri);
  }

  private initialize() {
    this.attributionDialogService.initialize();
    this.contentsDialogService.initialize();
    this.contentSearchDialogService.initialize();
  }

  private cleanup() {
    this.attributionDialogService.destroy();
    this.contentsDialogService.destroy();
    this.contentSearchDialogService.destroy();
    this.viewerService.destroy();
    this.resetErrorMessage();
  }

  private resetCurrentManifest(): void {
    this.currentManifest = null;
  }

  private resetErrorMessage(): void {
    this.errorMessage = null;
  }

  private isMobile(): boolean {
    return this.media.isActive('lt-md');
  }

  setClasses() {
    return {
      'mode-page': this.modeService.mode === ViewerMode.PAGE,
      'mode-page-zoomed': this.modeService.mode === ViewerMode.PAGE_ZOOMED,
      'mode-dashboard': this.modeService.mode === ViewerMode.DASHBOARD,
      'layout-one-page': this.viewerLayout === ViewerLayout.ONE_PAGE,
      'layout-two-page': this.viewerLayout === ViewerLayout.TWO_PAGE,
      'canvas-pressed': this.isCanvasPressed
    };
  }
}
