import {
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { ColDef, GridApi, GridOptions } from 'ag-grid-community';
import { TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { Subscription } from 'rxjs';
import { QuickFilterService } from '@components/quick-filter/quick-filter.service';
import { NotificationService } from '@services/notification.service';
import { GlobalVariable } from '@common/variables/global.variable';

export interface SbomRow {
  name: string;
  version: string;
  purl: string;
  licenses: string;
  runtime: boolean;
}

export function cdxToRows(doc: any): SbomRow[] {
  return (doc?.components || []).map(c => ({
    name: c.name || '',
    version: c.version || '',
    purl: c.purl || '',
    licenses: (c.licenses || [])
      .map(l => l.license?.id || l.license?.name || l.expression || '')
      .filter(Boolean)
      .join(', '),
    runtime: (c.properties || []).some(
      p => p.name === 'neuvector:runtime' && p.value === 'true'
    ),
  }));
}

export function sbomFileName(name: string, ext: string): string {
  return `sbom-${name.replace(/[^A-Za-z0-9._-]/g, '_')}.${ext}.json`;
}

@Component({
  standalone: false,
  selector: 'app-sbom-panel',
  templateUrl: './sbom-panel.component.html',
  styleUrls: ['./sbom-panel.component.scss'],
})
export class SbomPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() url!: string;
  @Input() params: Record<string, string> = {};
  @Input() name = '';
  @Input() tableHeight = '300px';
  loading = false;
  error = '';
  downloading = false;
  cdxText = '';
  gridApi?: GridApi;
  private filterText = '';
  gridOptions!: GridOptions;
  private filterSub?: Subscription;
  private fetchSub?: Subscription;
  private spdxSub?: Subscription;

  private columnDefs: ColDef[] = [
    { field: 'name', headerKey: 'sbom.NAME' },
    { field: 'version', headerKey: 'sbom.VERSION' },
    { field: 'purl', headerKey: 'sbom.PURL' },
    { field: 'licenses', headerKey: 'sbom.LICENSES' },
    {
      field: 'runtime',
      headerKey: 'sbom.RUNTIME',
      cellRenderer: p =>
        p.value
          ? `<em class="fa fa-bolt" title="${this.translate.instant('sbom.RUNTIME_HINT')}"></em>`
          : '',
    },
  ].map(c => ({
    sortable: true,
    resizable: true,
    field: c.field,
    cellRenderer: c.cellRenderer,
    headerValueGetter: () => this.translate.instant(c.headerKey),
  }));

  constructor(
    private quickFilterService: QuickFilterService,
    private translate: TranslateService,
    private notificationService: NotificationService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.gridOptions = {
      rowData: [],
      columnDefs: this.columnDefs,
      suppressDragLeaveHidesColumns: true,
      onGridReady: event => {
        this.gridApi = event.api;
        // the grid is re-created after each load: re-apply the current filter
        this.gridApi.setGridOption('quickFilterText', this.filterText);
        this.gridApi.sizeColumnsToFit();
      },
      // also covers tab animation and parent height changes
      onGridSizeChanged: event => event.api.sizeColumnsToFit(),
      overlayNoRowsTemplate: this.translate.instant('general.NO_ROWS'),
    };
    this.filterSub = this.quickFilterService.textInput$.subscribe(value => {
      this.filterText = value;
      this.quickFilterService.onFilterChange(
        value,
        this.gridOptions,
        this.gridApi!
      );
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    const { url, params } = changes;
    // Parents may pass a new object with the same content; refetch only on real change.
    if (
      url?.firstChange ||
      url?.previousValue !== url?.currentValue ||
      JSON.stringify(params?.previousValue) !==
        JSON.stringify(params?.currentValue)
    ) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.filterSub?.unsubscribe();
    this.fetchSub?.unsubscribe();
    this.spdxSub?.unsubscribe();
  }

  downloadCdx(): void {
    saveAs(
      new Blob([this.cdxText], { type: 'application/json' }),
      sbomFileName(this.name, 'cdx')
    );
  }

  downloadSpdx(): void {
    this.downloading = true;
    this.spdxSub = this.get('spdx').subscribe({
      next: text => {
        this.downloading = false;
        this.cd.markForCheck();
        saveAs(
          new Blob([text], { type: 'application/json' }),
          sbomFileName(this.name, 'spdx')
        );
      },
      error: err => {
        this.downloading = false;
        this.cd.markForCheck();
        // getErrorMessage parses the text body and sanitizes it
        this.notificationService.openError(
          err,
          this.translate.instant('sbom.LOAD_ERR')
        );
      },
    });
  }

  onResize(): void {
    this.gridApi?.sizeColumnsToFit();
  }

  private get(format: string) {
    return GlobalVariable.http.get(this.url, {
      params: { ...this.params, format },
      responseType: 'text',
    });
  }

  private load(): void {
    this.fetchSub?.unsubscribe();
    // a pending SPDX download belongs to the previous object
    this.spdxSub?.unsubscribe();
    this.downloading = false;
    this.gridApi = undefined;
    this.loading = true;
    this.error = '';
    this.cdxText = '';
    this.fetchSub = this.get('cyclonedx').subscribe({
      next: text => {
        try {
          const rows = cdxToRows(JSON.parse(text));
          this.cdxText = text;
          this.gridOptions.rowData = rows;
        } catch {
          this.error = 'sbom.LOAD_ERR';
        }
        this.loading = false;
        // parents such as the registry dialog use OnPush
        this.cd.markForCheck();
      },
      error: ({ status }) => {
        this.error = status === 404 ? 'sbom.NOT_FOUND' : 'sbom.LOAD_ERR';
        this.loading = false;
        this.cd.markForCheck();
      },
    });
  }
}
