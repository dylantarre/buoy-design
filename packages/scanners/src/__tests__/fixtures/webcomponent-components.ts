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

// Lit component with SignalWatcher mixin
export const LIT_SIGNAL_WATCHER = `
import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SignalWatcher, signal } from '@lit-labs/signals';
import { LitElement } from 'lit';

const count = signal(0);

@customElement('signal-counter')
export class SignalCounter extends SignalWatcher(LitElement) {
  @property({ type: String })
  label = 'Count';

  render() {
    return html\`<div>\${this.label}: \${count.get()}</div>\`;
  }
}
`;

// Lit component with Context consume/provide decorators
export const LIT_CONTEXT = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { provide, consume, createContext } from '@lit/context';

export const themeContext = createContext<string>('theme');

@customElement('theme-provider')
export class ThemeProvider extends LitElement {
  @provide({ context: themeContext })
  @property({ type: String })
  theme = 'light';

  render() {
    return html\`<slot></slot>\`;
  }
}

@customElement('theme-consumer')
export class ThemeConsumer extends LitElement {
  @consume({ context: themeContext, subscribe: true })
  @property({ type: String })
  theme = '';

  render() {
    return html\`<div class=\${this.theme}>Themed content</div>\`;
  }
}
`;

// Lit component with @localized decorator
export const LIT_LOCALIZED = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { localized, msg } from '@lit/localize';

@localized()
@customElement('localized-greeting')
export class LocalizedGreeting extends LitElement {
  @property({ type: String })
  name = 'World';

  render() {
    return html\`<div>\${msg(\`Hello, \${this.name}!\`)}</div>\`;
  }
}
`;

// Vanilla Web Component (no framework)
export const VANILLA_WEB_COMPONENT = `
class MyVanillaButton extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'disabled'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  get label() {
    return this.getAttribute('label') || 'Click me';
  }

  set label(value: string) {
    this.setAttribute('label', value);
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value: boolean) {
    if (value) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = \`<button \${this.disabled ? 'disabled' : ''}>\${this.label}</button>\`;
    }
  }
}

customElements.define('my-vanilla-button', MyVanillaButton);
`;

// TypeScript 5 standard decorators with accessor keyword
export const LIT_STANDARD_DECORATORS = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('modern-element')
export class ModernElement extends LitElement {
  @property({ type: String })
  accessor title = 'Default Title';

  @property({ type: Number })
  accessor count = 0;

  @property({ type: Boolean })
  accessor active = false;

  render() {
    return html\`<div>\${this.title}: \${this.count}</div>\`;
  }
}
`;

// FAST Element component
export const FAST_ELEMENT_COMPONENT = `
import { FASTElement, customElement, attr, observable, html } from '@microsoft/fast-element';

const template = html<MyFastButton>\`
  <button ?disabled=\${x => x.disabled}>\${x => x.label}</button>
\`;

@customElement({
  name: 'my-fast-button',
  template
})
export class MyFastButton extends FASTElement {
  @attr label: string = 'Click me';
  @attr({ mode: 'boolean' }) disabled: boolean = false;
  @observable count: number = 0;
}
`;

// Stencil with Mixin pattern (Stencil 4.x)
export const STENCIL_WITH_MIXIN = `
import { Component, Prop, State, h, Mixin, MixedInCtor } from '@stencil/core';

// Mixin factory for loading state
function WithLoading<T extends MixedInCtor>(Base: T) {
  return class extends Base {
    @State() loading = false;
    @State() error: string | null = null;
  };
}

// Mixin factory for theming
function WithTheme<T extends MixedInCtor>(Base: T) {
  return class extends Base {
    @Prop() theme: 'light' | 'dark' = 'light';
  };
}

@Component({
  tag: 'my-mixed-component',
  shadow: true,
})
export class MyMixedComponent extends Mixin(WithLoading, WithTheme) {
  @Prop() title: string;

  render() {
    if (this.loading) {
      return <div class={this.theme}>Loading...</div>;
    }
    if (this.error) {
      return <div class="error">{this.error}</div>;
    }
    return <div class={this.theme}>{this.title}</div>;
  }
}
`;

// Stencil functional component
export const STENCIL_FUNCTIONAL = `
import { h, FunctionalComponent } from '@stencil/core';

interface GreetingProps {
  name: string;
  greeting?: string;
}

export const Greeting: FunctionalComponent<GreetingProps> = ({ name, greeting = 'Hello' }) => (
  <div>
    {greeting}, {name}!
  </div>
);
`;

// Lit with eventOptions decorator
export const LIT_EVENT_OPTIONS = `
import { LitElement, html } from 'lit';
import { customElement, eventOptions, property } from 'lit/decorators.js';

@customElement('scroll-listener')
export class ScrollListener extends LitElement {
  @property({ type: Number })
  scrollTop = 0;

  @eventOptions({ passive: true })
  handleScroll(e: Event) {
    this.scrollTop = (e.target as HTMLElement).scrollTop;
  }

  render() {
    return html\`
      <div @scroll=\${this.handleScroll} style="overflow: auto; height: 200px;">
        <slot></slot>
      </div>
    \`;
  }
}
`;

// Lit with queryAsync decorator
export const LIT_QUERY_ASYNC = `
import { LitElement, html } from 'lit';
import { customElement, queryAsync, property } from 'lit/decorators.js';

@customElement('async-dialog')
export class AsyncDialog extends LitElement {
  @property({ type: Boolean })
  open = false;

  @queryAsync('#dialog')
  dialogEl!: Promise<HTMLDialogElement>;

  async showDialog() {
    const dialog = await this.dialogEl;
    dialog.showModal();
  }

  render() {
    return html\`
      <dialog id="dialog">
        <slot></slot>
      </dialog>
    \`;
  }
}
`;

// Stencil component with slots configuration
export const STENCIL_WITH_SLOTS = `
import { Component, Prop, h } from '@stencil/core';

@Component({
  tag: 'my-card',
  shadow: true,
  styleUrl: 'my-card.css',
  assetsDirs: ['assets'],
})
export class MyCard {
  @Prop() heading: string;

  render() {
    return (
      <div class="card">
        <header>
          <slot name="header">{this.heading}</slot>
        </header>
        <main>
          <slot></slot>
        </main>
        <footer>
          <slot name="footer"></slot>
        </footer>
      </div>
    );
  }
}
`;

// FAST Element using compose() pattern (modern FAST)
export const FAST_ELEMENT_COMPOSE = `
import { FASTElement, attr, observable, html, css } from '@microsoft/fast-element';

const template = html<ModernFastButton>\`
  <button class="\${x => x.appearance}" ?disabled="\${x => x.disabled}">
    <slot></slot>
  </button>
\`;

const styles = css\`
  :host {
    display: inline-block;
  }
  button {
    padding: 8px 16px;
  }
\`;

export class ModernFastButton extends FASTElement {
  @attr appearance: 'primary' | 'secondary' = 'primary';
  @attr({ mode: 'boolean' }) disabled: boolean = false;
  @observable loading: boolean = false;
}

ModernFastButton.compose({
  name: 'modern-fast-button',
  template,
  styles,
  shadowOptions: { mode: 'open' },
});
`;

// FAST Element using define() pattern
export const FAST_ELEMENT_DEFINE = `
import { FASTElement, attr, html, css } from '@microsoft/fast-element';

const template = html<FastCard>\`
  <div class="card">
    <slot name="header"></slot>
    <slot></slot>
  </div>
\`;

export class FastCard extends FASTElement {
  @attr title: string = '';
  @attr variant: string = 'default';
}

FASTElement.define(FastCard, {
  name: 'fast-card',
  template,
});
`;

// Lit with multiple inheritance via mixins
export const LIT_WITH_MIXINS = `
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Type for mixin constructor
type Constructor<T = {}> = new (...args: any[]) => T;

// Focusable mixin
function FocusableMixin<T extends Constructor<LitElement>>(Base: T) {
  return class extends Base {
    @property({ type: Boolean, reflect: true })
    focused = false;

    focus() {
      this.focused = true;
    }

    blur() {
      this.focused = false;
    }
  };
}

// Disabled mixin
function DisabledMixin<T extends Constructor<LitElement>>(Base: T) {
  return class extends Base {
    @property({ type: Boolean, reflect: true })
    disabled = false;
  };
}

@customElement('mixed-button')
export class MixedButton extends FocusableMixin(DisabledMixin(LitElement)) {
  @property({ type: String })
  label = 'Click me';

  render() {
    return html\`<button ?disabled=\${this.disabled}>\${this.label}</button>\`;
  }
}
`;

// Stencil with multiple style files
export const STENCIL_MULTI_STYLES = `
import { Component, Prop, h } from '@stencil/core';

@Component({
  tag: 'themed-button',
  styleUrls: {
    ios: 'themed-button.ios.css',
    md: 'themed-button.md.css',
  },
  shadow: true,
})
export class ThemedButton {
  @Prop() variant: 'primary' | 'secondary' = 'primary';

  render() {
    return <button class={this.variant}><slot></slot></button>;
  }
}
`;
