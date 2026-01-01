// Lit component with @customElement decorator
export const LIT_BASIC_COMPONENT = `
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('my-button')
export class MyButton extends LitElement {
  @property({ type: String })
  label = 'Click me';

  @property({ type: Boolean })
  disabled = false;

  render() {
    return html\`<button ?disabled=\${this.disabled}>\${this.label}</button>\`;
  }
}
`;

// Lit component with @state for internal state
export const LIT_WITH_STATE = `
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('my-counter')
export class MyCounter extends LitElement {
  @property({ type: Number })
  initialValue = 0;

  @state()
  private _count = 0;

  @state()
  protected _active = false;

  render() {
    return html\`<span>\${this._count}</span>\`;
  }
}
`;

// Lit component without decorators (static properties pattern)
export const LIT_STATIC_PROPERTIES = `
import { LitElement, html } from 'lit';

export class MyCard extends LitElement {
  static properties = {
    title: { type: String },
    description: { type: String },
    _expanded: { state: true },
  };

  constructor() {
    super();
    this.title = '';
    this.description = '';
    this._expanded = false;
  }

  render() {
    return html\`<div>\${this.title}</div>\`;
  }
}
customElements.define('my-card', MyCard);
`;

// Lit component with @query decorators
export const LIT_WITH_QUERY = `
import { LitElement, html } from 'lit';
import { customElement, property, query, queryAll, queryAssignedElements } from 'lit/decorators.js';

@customElement('my-dialog')
export class MyDialog extends LitElement {
  @property({ type: Boolean })
  open = false;

  @query('#title')
  _titleEl!: HTMLElement;

  @queryAll('.item')
  _items!: NodeListOf<HTMLElement>;

  @queryAssignedElements({ slot: 'header' })
  _headerSlot!: Array<HTMLElement>;

  render() {
    return html\`
      <div id="title">Title</div>
      <slot name="header"></slot>
    \`;
  }
}
`;

// Lit component extending another LitElement-based class
export const LIT_EXTENDS_CUSTOM_BASE = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { BaseElement } from './base-element';

@customElement('my-special-button')
export class MySpecialButton extends BaseElement {
  @property({ type: String })
  variant = 'primary';

  render() {
    return html\`<button class=\${this.variant}>Click</button>\`;
  }
}
`;

// Lit component with reactive controller pattern
export const LIT_REACTIVE_CONTROLLER = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

class MouseController {
  host: LitElement;
  pos = { x: 0, y: 0 };

  constructor(host: LitElement) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {
    window.addEventListener('mousemove', this._onMouseMove);
  }

  hostDisconnected() {
    window.removeEventListener('mousemove', this._onMouseMove);
  }

  private _onMouseMove = (e: MouseEvent) => {
    this.pos = { x: e.clientX, y: e.clientY };
    this.host.requestUpdate();
  };
}

@customElement('mouse-tracker')
export class MouseTracker extends LitElement {
  private mouseController = new MouseController(this);

  @property({ type: String })
  label = '';

  render() {
    return html\`<div>\${this.mouseController.pos.x}, \${this.mouseController.pos.y}</div>\`;
  }
}
`;

// Lit component with deprecated JSDoc
export const LIT_DEPRECATED = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * @deprecated Use my-new-button instead
 */
@customElement('my-old-button')
export class MyOldButton extends LitElement {
  @property({ type: String })
  label = 'Click';

  render() {
    return html\`<button>\${this.label}</button>\`;
  }
}
`;

// Stencil basic component
export const STENCIL_BASIC_COMPONENT = `
import { Component, Prop, h } from '@stencil/core';

@Component({
  tag: 'my-component',
  styleUrl: 'my-component.css',
  shadow: true,
})
export class MyComponent {
  @Prop() first: string;
  @Prop() last: string;

  render() {
    return <div>Hello, {this.first} {this.last}</div>;
  }
}
`;

// Stencil component with State and Watch
export const STENCIL_WITH_STATE_WATCH = `
import { Component, Prop, State, Watch, h } from '@stencil/core';

@Component({
  tag: 'my-counter',
  shadow: true,
})
export class MyCounter {
  @Prop() initialValue = 0;

  @State() count = 0;
  @State() private _isActive = false;

  @Watch('initialValue')
  initialValueChanged(newValue: number) {
    this.count = newValue;
  }

  @Watch('count')
  countChanged(newValue: number, oldValue: number) {
    console.log('Count changed from', oldValue, 'to', newValue);
  }

  render() {
    return <div>{this.count}</div>;
  }
}
`;

// Stencil component with Event and EventEmitter
export const STENCIL_WITH_EVENTS = `
import { Component, Prop, Event, EventEmitter, h } from '@stencil/core';

@Component({
  tag: 'my-form',
  shadow: true,
})
export class MyForm {
  @Prop() value: string = '';

  @Event() formSubmit: EventEmitter<string>;
  @Event({ eventName: 'form-cancel', bubbles: true, composed: true })
  formCancel: EventEmitter<void>;

  private handleSubmit = () => {
    this.formSubmit.emit(this.value);
  };

  private handleCancel = () => {
    this.formCancel.emit();
  };

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
        <button type="submit">Submit</button>
        <button type="button" onClick={this.handleCancel}>Cancel</button>
      </form>
    );
  }
}
`;

// Stencil component with Method decorator
export const STENCIL_WITH_METHOD = `
import { Component, Prop, Method, h } from '@stencil/core';

@Component({
  tag: 'my-modal',
  shadow: true,
})
export class MyModal {
  @Prop() title: string;

  private isOpen = false;

  @Method()
  async open() {
    this.isOpen = true;
  }

  @Method()
  async close() {
    this.isOpen = false;
  }

  @Method()
  async toggle() {
    this.isOpen = !this.isOpen;
  }

  render() {
    return this.isOpen ? <div class="modal">{this.title}</div> : null;
  }
}
`;

// Stencil component with Element and Listen
export const STENCIL_WITH_ELEMENT_LISTEN = `
import { Component, Element, Listen, Prop, h } from '@stencil/core';

@Component({
  tag: 'my-dropdown',
  shadow: true,
})
export class MyDropdown {
  @Element() el!: HTMLElement;

  @Prop() open = false;

  @Listen('click', { target: 'window' })
  handleWindowClick(event: MouseEvent) {
    if (!this.el.contains(event.target as Node)) {
      this.open = false;
    }
  }

  @Listen('keydown')
  handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.open = false;
    }
  }

  render() {
    return <div class={{ dropdown: true, open: this.open }}>Dropdown</div>;
  }
}
`;

// Stencil component with scoped styles (not shadow)
export const STENCIL_SCOPED = `
import { Component, Prop, h } from '@stencil/core';

@Component({
  tag: 'my-scoped-button',
  styleUrl: 'my-scoped-button.css',
  scoped: true,
})
export class MyScopedButton {
  @Prop() label: string;
  @Prop({ mutable: true }) count = 0;
  @Prop({ reflect: true }) color: string;

  render() {
    return <button onClick={() => this.count++}>{this.label}</button>;
  }
}
`;

// Stencil form-associated component
export const STENCIL_FORM_ASSOCIATED = `
import { Component, Prop, h, AttachInternals } from '@stencil/core';

@Component({
  tag: 'my-input',
  shadow: true,
  formAssociated: true,
})
export class MyInput {
  @AttachInternals() internals!: ElementInternals;

  @Prop() value: string = '';
  @Prop() name: string;
  @Prop() required = false;

  componentWillLoad() {
    this.internals.setFormValue(this.value);
  }

  render() {
    return <input value={this.value} name={this.name} required={this.required} />;
  }
}
`;

// Stencil deprecated component
export const STENCIL_DEPRECATED = `
import { Component, Prop, h } from '@stencil/core';

/**
 * @deprecated Use my-new-component instead
 */
@Component({
  tag: 'my-old-component',
  shadow: true,
})
export class MyOldComponent {
  @Prop() value: string;

  render() {
    return <div>{this.value}</div>;
  }
}
`;

// Lit component with custom hasChanged
export const LIT_CUSTOM_HAS_CHANGED = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('case-insensitive-input')
export class CaseInsensitiveInput extends LitElement {
  @property({
    type: String,
    hasChanged(newVal: string, oldVal: string) {
      return newVal?.toLowerCase() !== oldVal?.toLowerCase();
    }
  })
  value = '';

  render() {
    return html\`<input .value=\${this.value} />\`;
  }
}
`;

// Lit component with attribute configuration
export const LIT_ATTRIBUTE_CONFIG = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('data-viewer')
export class DataViewer extends LitElement {
  @property({ type: String, attribute: 'data-id' })
  dataId = '';

  @property({ attribute: false })
  complexData = {};

  @property({ type: Boolean, reflect: true })
  active = false;

  render() {
    return html\`<div>ID: \${this.dataId}</div>\`;
  }
}
`;
