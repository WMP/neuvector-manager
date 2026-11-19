import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { QuickFilterModule } from '@components/quick-filter/quick-filter.module';
import { LoadingTemplateModule } from '@components/ui/loading-template/loading-template.module';
import { SbomPanelComponent } from './sbom-panel.component';

@NgModule({
  declarations: [SbomPanelComponent],
  imports: [
    CommonModule,
    AgGridAngular,
    MatButtonModule,
    TranslateModule,
    QuickFilterModule,
    LoadingTemplateModule,
  ],
  exports: [SbomPanelComponent],
})
export class SbomPanelModule {}
