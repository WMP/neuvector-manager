import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import { TranslateModule } from '@ngx-translate/core';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogModule } from '@components/ui/confirm-dialog/confirm-dialog.module';
import { LoadingTemplateModule } from '@components/ui/loading-template/loading-template.module';
import { SbomStorageComponent } from './sbom-storage.component';

const routes: Routes = [
  { path: '', component: SbomStorageComponent },
  { path: '**', redirectTo: '' },
];

@NgModule({
  declarations: [SbomStorageComponent],
  imports: [
    RouterModule.forChild(routes),
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    AgGridAngular,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    LoadingTemplateModule,
    MatDialogModule,
    ConfirmDialogModule,
  ],
})
export class SbomStorageModule {}
