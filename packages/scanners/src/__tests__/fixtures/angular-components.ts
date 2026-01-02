export const SIMPLE_BUTTON_ANGULAR = `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-button',
  template: '<button (click)="handleClick()">{{label}}</button>',
  styles: ['button { color: #0066cc; }']
})
export class ButtonComponent {
  @Input() label: string = '';
  @Output() clicked = new EventEmitter<void>();

  handleClick() {
    this.clicked.emit();
  }
}
`;

export const CARD_WITH_INPUTS_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-card',
  template: '<div class="card"><h2>{{title}}</h2><p>{{subtitle}}</p></div>'
})
export class CardComponent {
  @Input() title: string = '';
  @Input() subtitle?: string;
  @Input() isActive: boolean = false;
}
`;

export const DEPRECATED_COMPONENT_ANGULAR = `
import { Component, Input } from '@angular/core';

/**
 * @deprecated Use NewButtonComponent instead
 */
@Component({
  selector: 'app-old-button',
  template: '<button>{{label}}</button>'
})
export class OldButtonComponent {
  @Input() label: string = '';
}
`;

export const SIGNAL_INPUTS_ANGULAR = `
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-modern',
  template: '<div>{{name()}}</div>'
})
export class ModernComponent {
  name = input<string>();
  age = input<number>();
  selected = output<void>();
}
`;

export const MULTIPLE_COMPONENTS_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-header',
  template: '<header>{{title}}</header>'
})
export class HeaderComponent {
  @Input() title: string = '';
}

@Component({
  selector: 'app-footer',
  template: '<footer>{{copyright}}</footer>'
})
export class FooterComponent {
  @Input() copyright: string = '';
}
`;

// Angular component NOT using *.component.ts naming (like Angular Material)
export const NON_STANDARD_NAMING_ANGULAR = `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'mat-tree',
  template: '<div class="tree">{{label}}</div>'
})
export class MatTree {
  @Input() label: string = '';
  @Output() nodeSelect = new EventEmitter<any>();
}
`;

// Input with transform (Angular 16+)
export const INPUT_WITH_TRANSFORM_ANGULAR = `
import { Component, Input, booleanAttribute, numberAttribute } from '@angular/core';

@Component({
  selector: 'app-toggle',
  template: '<div>{{disabled}}</div>'
})
export class ToggleComponent {
  @Input({ transform: booleanAttribute }) disabled: boolean = false;
  @Input({ transform: numberAttribute }) size: number = 16;
  @Input({ required: true }) id!: string;
}
`;

// Input with alias
export const INPUT_WITH_ALIAS_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'mat-tab',
  template: '<div>{{textLabel}}</div>'
})
export class MatTab {
  @Input('label') textLabel: string = '';
  @Input('aria-label') ariaLabel!: string;
  @Input('aria-labelledby') ariaLabelledBy!: string;
}
`;

// Getter/setter inputs (Angular Material pattern)
export const GETTER_SETTER_INPUT_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'cdk-tree',
  template: '<div>{{_dataSource}}</div>'
})
export class CdkTree {
  @Input()
  get dataSource(): any[] {
    return this._dataSource;
  }
  set dataSource(value: any[]) {
    this._dataSource = value;
  }
  private _dataSource: any[] = [];

  @Input()
  get trackBy(): any {
    return this._trackBy;
  }
  set trackBy(value: any) {
    this._trackBy = value;
  }
  private _trackBy: any;
}
`;

// Angular 17+ signal features: required inputs and model
export const ANGULAR_17_SIGNALS = `
import { Component, input, output, model } from '@angular/core';

@Component({
  selector: 'app-advanced',
  template: '<div>{{name()}}</div>'
})
export class AdvancedComponent {
  // Required signal input
  name = input.required<string>();

  // Optional signal input with default
  age = input<number>(0);

  // Two-way binding with model
  count = model<number>(0);

  // Required model
  selected = model.required<boolean>();

  // Signal output
  clicked = output<void>();
}
`;

// Deprecated input property
export const DEPRECATED_PROP_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-deprecated-props',
  template: '<div>{{newProp}}</div>'
})
export class DeprecatedPropsComponent {
  /**
   * @deprecated Use newProp instead
   */
  @Input() oldProp: string = '';

  @Input() newProp: string = '';

  /**
   * @deprecated since v2.0.0, use styleClass instead
   */
  @Input() containerStyleClass: string = '';
}
`;

// Angular Material-style signal inputs with typed annotations (Angular 17+)
export const ANGULAR_MATERIAL_SIGNALS = `
import {
  Component,
  input,
  output,
  InputSignal,
  InputSignalWithTransform,
  OutputEmitterRef,
  booleanAttribute,
} from '@angular/core';

function parseInterval(value: number | string | null): number | null {
  if (typeof value === 'string') return parseInt(value, 10);
  return value;
}

@Component({
  selector: 'mat-timepicker',
  template: '<div>Timepicker</div>'
})
export class MatTimepicker<D> {
  // InputSignalWithTransform with custom transform
  readonly interval: InputSignalWithTransform<number | null, number | string | null> = input(
    null,
    { transform: parseInterval }
  );

  // InputSignal with generic type
  readonly options: InputSignal<readonly string[] | null> = input<readonly string[] | null>(null);

  // InputSignalWithTransform with booleanAttribute
  readonly disableRipple: InputSignalWithTransform<boolean, unknown> = input(
    false,
    { transform: booleanAttribute }
  );

  // Signal input with alias
  readonly ariaLabel: InputSignal<string | null> = input<string | null>(null, {
    alias: 'aria-label',
  });

  // OutputEmitterRef
  readonly selected: OutputEmitterRef<{ value: D }> = output();
  readonly opened: OutputEmitterRef<void> = output();
  readonly closed: OutputEmitterRef<void> = output();
}
`;

// Signal inputs with complex options including alias and transform
export const SIGNAL_INPUTS_WITH_OPTIONS = `
import { Component, input, output, booleanAttribute, numberAttribute } from '@angular/core';

@Component({
  selector: 'app-settings',
  template: '<div>Settings</div>'
})
export class SettingsComponent {
  // Signal input with transform option
  readonly enabled = input(false, { transform: booleanAttribute });

  // Signal input with both alias and transform
  readonly itemCount = input(0, {
    alias: 'count',
    transform: numberAttribute,
  });

  // Signal input with just alias
  readonly labelText = input<string>('', { alias: 'label' });

  // Required signal input (input.required)
  readonly userId = input.required<string>();

  // Required signal input with options
  readonly itemId = input.required<string>({ alias: 'id' });
}
`;

// Standalone components (Angular 14+)
export const STANDALONE_COMPONENT_ANGULAR = `
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-standalone-card',
  standalone: true,
  imports: [CommonModule],
  template: '<div class="card">{{title}}</div>'
})
export class StandaloneCardComponent {
  @Input() title: string = '';
  @Input() description?: string;
  @Output() cardClick = new EventEmitter<void>();
}
`;

// Simple directive (Angular Material-style)
export const SIMPLE_DIRECTIVE_ANGULAR = `
import { Directive, Input } from '@angular/core';

@Directive({
  selector: '[matTooltip]',
})
export class MatTooltip {
  @Input('matTooltip') message: string = '';
  @Input() matTooltipPosition: 'above' | 'below' | 'left' | 'right' = 'below';
}
`;

// Directive with inputs defined in decorator metadata
export const DIRECTIVE_WITH_METADATA_INPUTS = `
import { Directive } from '@angular/core';
import { CdkTreeNodeToggle } from '@angular/cdk/tree';

@Directive({
  selector: '[matTreeNodeToggle]',
  providers: [{provide: CdkTreeNodeToggle, useExisting: MatTreeNodeToggle}],
  inputs: [{name: 'recursive', alias: 'matTreeNodeToggleRecursive'}],
})
export class MatTreeNodeToggle<T, K = T> extends CdkTreeNodeToggle<T, K> {}
`;

// Directive with hostDirectives (Angular 15+)
export const DIRECTIVE_WITH_HOST_DIRECTIVES = `
import { Directive, Input, input } from '@angular/core';
import { Bind } from 'primeng/bind';
import { BaseComponent, PARENT_INSTANCE } from 'primeng/basecomponent';
import { ButtonStyle } from './style/buttonstyle';

@Directive({
  selector: '[pButton]',
  standalone: true,
  providers: [ButtonStyle, { provide: PARENT_INSTANCE, useExisting: ButtonDirective }],
  host: {
    '[class.p-button-icon-only]': 'isIconOnly()',
  },
  hostDirectives: [Bind],
})
export class ButtonDirective extends BaseComponent {
  @Input() hostName: string = '';
  readonly fluid = input(false);
}
`;

// Complex directive with multiple features
export const COMPLEX_DIRECTIVE_ANGULAR = `
import { Directive, Input, Output, EventEmitter, input, output, booleanAttribute } from '@angular/core';
import { Bind } from 'primeng/bind';

@Directive({
  selector: 'input[matSliderThumb]',
  exportAs: 'matSliderThumb',
  standalone: true,
  host: {
    'class': 'mdc-slider__input',
    'type': 'range',
    '(change)': '_onChange()',
  },
  inputs: ['min', 'max', 'step'],
  hostDirectives: [
    Bind,
    { directive: SomeOtherDirective, inputs: ['someInput'], outputs: ['someOutput'] }
  ],
})
export class MatSliderThumb {
  @Input({ transform: booleanAttribute }) disabled: boolean = false;
  @Output() valueChange = new EventEmitter<number>();
  readonly dragStart = output<void>();
}
`;

// Directive with string inputs in decorator (simple form)
export const DIRECTIVE_WITH_STRING_INPUTS = `
import { Directive } from '@angular/core';

@Directive({
  selector: '[matSort]',
  inputs: ['matSortActive', 'matSortDirection', 'matSortDisableClear'],
  outputs: ['matSortChange'],
})
export class MatSort {
  matSortActive: string = '';
  matSortDirection: 'asc' | 'desc' | '' = '';
  matSortDisableClear: boolean = false;
}
`;

// Component with multiple selectors (PrimeNG pattern)
export const MULTIPLE_SELECTORS_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'p-iconfield, p-iconField, p-icon-field',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class IconField {
  @Input() iconPosition: 'right' | 'left' = 'left';
}
`;

// Angular 17+ viewChild and contentChild signals
export const SIGNAL_QUERIES_ANGULAR = `
import { Component, Input, viewChild, contentChild, ElementRef, computed, signal } from '@angular/core';

@Component({
  selector: 'mat-form-field',
  template: '<div></div>',
})
export class MatFormField {
  @Input() appearance: 'fill' | 'outline' = 'fill';

  // Signal queries (Angular 17+)
  private _labelChild = contentChild(MatLabel);
  private _inputElement = viewChild<ElementRef<HTMLInputElement>>('inputElement');

  // Computed signals
  _hasFloatingLabel = computed(() => !!this._labelChild());
  getLabelId = computed(() => this._hasFloatingLabel() ? 'label-id' : null);
}
`;

// Component extending a base class
export const COMPONENT_WITH_INHERITANCE = `
import { Component, Input, inject } from '@angular/core';
import { BaseComponent } from 'primeng/basecomponent';

@Component({
  selector: 'p-card',
  standalone: true,
  template: '<div class="card">{{title}}</div>',
})
export class Card extends BaseComponent {
  @Input() title: string = '';
  @Input() subtitle?: string;

  // Property from parent class not detected
  _componentStyle = inject(CardStyle);
}
`;

// Component with complex transform functions
export const COMPLEX_TRANSFORM_ANGULAR = `
import { Component, Input, booleanAttribute, numberAttribute } from '@angular/core';

function transformTabIndex(value: unknown): number | undefined {
  return value == null ? undefined : numberAttribute(value);
}

@Component({
  selector: 'mat-button',
  template: '<button></button>',
})
export class MatButton {
  @Input({transform: booleanAttribute}) disabled: boolean = false;
  @Input({transform: booleanAttribute}) disableRipple: boolean = false;
  @Input({transform: booleanAttribute, alias: 'aria-disabled'}) ariaDisabled: boolean | undefined;
  @Input({transform: transformTabIndex}) tabIndex!: number;
  @Input({alias: 'tabindex', transform: transformTabIndex})
  set _tabindex(value: number) {
    this.tabIndex = value;
  }
}
`;

// Component with outputs defined in decorator metadata
export const OUTPUTS_IN_DECORATOR = `
import { Directive, EventEmitter } from '@angular/core';

@Directive({
  selector: '[matSort]',
  inputs: ['matSortActive'],
  outputs: ['matSortChange'],
})
export class MatSort {
  matSortActive: string = '';
  matSortChange = new EventEmitter<void>();
}
`;

// Component with extended deprecation message
export const EXTENDED_DEPRECATION_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'p-icon-field',
  template: '<div></div>',
})
export class IconField {
  /**
   * Position of the icon.
   * @group Props
   */
  @Input() iconPosition: 'right' | 'left' = 'left';

  /**
   * Style class of the component.
   * @deprecated since v20.0.0, use \`class\` instead.
   * @group Props
   */
  @Input() styleClass: string = '';
}
`;
