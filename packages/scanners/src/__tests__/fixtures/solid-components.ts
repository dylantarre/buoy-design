// packages/scanners/src/__tests__/fixtures/solid-components.ts

/**
 * Simple Solid component with createSignal
 */
export const SIMPLE_COUNTER_SOLID = `import { createSignal } from 'solid-js';

function Counter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(c => c + 1)}>Count: {count()}</button>;
}

export default Counter;
`;

/**
 * Solid component with createEffect and createMemo
 */
export const COMPONENT_WITH_EFFECTS_SOLID = `import { createSignal, createEffect, createMemo } from 'solid-js';

interface Props {
  initialValue: number;
}

export function Calculator(props: Props) {
  const [value, setValue] = createSignal(props.initialValue);

  const doubled = createMemo(() => value() * 2);

  createEffect(() => {
    console.log('Value changed:', value());
  });

  return (
    <div>
      <input type="number" value={value()} onInput={(e) => setValue(+e.target.value)} />
      <span>Doubled: {doubled()}</span>
    </div>
  );
}
`;

/**
 * Solid component with createStore
 */
export const COMPONENT_WITH_STORE_SOLID = `import { createStore } from 'solid-js/store';
import { For } from 'solid-js';

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export function TodoList() {
  const [todos, setTodos] = createStore<Todo[]>([]);

  const addTodo = (text: string) => {
    setTodos([...todos, { id: Date.now(), text, done: false }]);
  };

  return (
    <ul>
      <For each={todos}>
        {(todo) => <li class={todo.done ? 'done' : ''}>{todo.text}</li>}
      </For>
    </ul>
  );
}
`;

/**
 * Solid component using control flow components
 */
export const COMPONENT_WITH_CONTROL_FLOW_SOLID = `import { Show, For, Switch, Match, Index } from 'solid-js';
import { createSignal } from 'solid-js';

export function DataDisplay(props: { items: string[]; loading: boolean; error?: string }) {
  return (
    <div>
      <Show when={!props.loading} fallback={<p>Loading...</p>}>
        <Switch fallback={<p>Unknown state</p>}>
          <Match when={props.error}>
            <p class="error">{props.error}</p>
          </Match>
          <Match when={props.items.length > 0}>
            <For each={props.items}>
              {(item, index) => <span>{index()}: {item}</span>}
            </For>
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
`;

/**
 * Solid component with Dynamic
 */
export const COMPONENT_WITH_DYNAMIC_SOLID = `import { Dynamic } from 'solid-js/web';
import { createSignal, Component } from 'solid-js';

interface ButtonProps {
  label: string;
}

const PrimaryButton: Component<ButtonProps> = (props) => (
  <button class="primary">{props.label}</button>
);

const SecondaryButton: Component<ButtonProps> = (props) => (
  <button class="secondary">{props.label}</button>
);

export function DynamicButton(props: { variant: 'primary' | 'secondary'; label: string }) {
  const [component, setComponent] = createSignal(
    props.variant === 'primary' ? PrimaryButton : SecondaryButton
  );

  return <Dynamic component={component()} label={props.label} />;
}
`;

/**
 * Solid component with ErrorBoundary, Suspense, and Portal
 */
export const COMPONENT_WITH_ADVANCED_SOLID = `import { ErrorBoundary, Suspense, Portal } from 'solid-js';
import { createResource } from 'solid-js';

async function fetchData(id: string): Promise<{ name: string }> {
  const response = await fetch(\`/api/data/\${id}\`);
  return response.json();
}

export function DataLoader(props: { id: string }) {
  const [data] = createResource(() => props.id, fetchData);

  return (
    <ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
      <Suspense fallback={<div>Loading...</div>}>
        <div>{data()?.name}</div>
      </Suspense>
      <Portal mount={document.getElementById('modal-root')!}>
        <div class="modal">Modal content</div>
      </Portal>
    </ErrorBoundary>
  );
}
`;

/**
 * Solid component with JSX pragma
 */
export const COMPONENT_WITH_JSX_PRAGMA_SOLID = `/** @jsxImportSource solid-js */
import { createSignal, Component } from 'solid-js';

interface Props {
  title: string;
  children?: any;
}

const Card: Component<Props> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="card">
      <h2 onClick={() => setExpanded(!expanded())}>{props.title}</h2>
      <Show when={expanded()}>
        {props.children}
      </Show>
    </div>
  );
};

export default Card;
`;

/**
 * Deprecated Solid component
 */
export const DEPRECATED_COMPONENT_SOLID = `import { createSignal } from 'solid-js';

/**
 * @deprecated Use NewCounter instead
 */
export function OldCounter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(c => c + 1)}>{count()}</button>;
}
`;
