import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { FlexLayoutModule } from '@angular/flex-layout';

import { MimeMaterialModule } from './mime-material.module';
import { SpinnerService } from '../core/spinner-service/spinner.service';

@NgModule({
  imports: [
    CommonModule,
    FlexLayoutModule,
    MimeMaterialModule,
    FormsModule
  ],
  exports: [
    CommonModule,
    FlexLayoutModule,
    MimeMaterialModule,
    FormsModule
  ],
  providers: [
    SpinnerService
  ]
})
export class SharedModule { }
