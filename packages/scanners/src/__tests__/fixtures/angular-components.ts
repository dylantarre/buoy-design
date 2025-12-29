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
