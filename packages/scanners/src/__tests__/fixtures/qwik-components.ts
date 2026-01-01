// packages/scanners/src/__tests__/fixtures/qwik-components.ts

/**
 * Simple Qwik component with useSignal
 */
export const SIMPLE_COUNTER_QWIK = `import { component$, useSignal } from '@builder.io/qwik';

export const Counter = component$(() => {
  const count = useSignal(0);

  return (
    <button onClick$={() => count.value++}>
      Count: {count.value}
    </button>
  );
});
`;

/**
 * Qwik component with useStore
 */
export const COMPONENT_WITH_STORE_QWIK = `import { component$, useStore } from '@builder.io/qwik';

interface TodoState {
  items: string[];
  filter: 'all' | 'active' | 'done';
}

export const TodoList = component$(() => {
  const state = useStore<TodoState>({
    items: [],
    filter: 'all',
  });

  return (
    <div>
      <ul>
        {state.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
});
`;

/**
 * Qwik component with useTask$ and useVisibleTask$
 */
export const COMPONENT_WITH_TASKS_QWIK = `import { component$, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik';

interface Props {
  userId: string;
}

export const UserProfile = component$<Props>(({ userId }) => {
  const userData = useSignal<{ name: string } | null>(null);
  const isClient = useSignal(false);

  useTask$(async ({ track }) => {
    track(() => userId);
    const response = await fetch(\`/api/users/\${userId}\`);
    userData.value = await response.json();
  });

  useVisibleTask$(() => {
    isClient.value = true;
  });

  return (
    <div>
      {userData.value ? <h1>{userData.value.name}</h1> : <p>Loading...</p>}
      {isClient.value && <p>Client-side rendered</p>}
    </div>
  );
});
`;

/**
 * Qwik component with useComputed$ and useResource$
 */
export const COMPONENT_WITH_COMPUTED_QWIK = `import { component$, useSignal, useComputed$, useResource$, Resource } from '@builder.io/qwik';

export const DataDisplay = component$(() => {
  const count = useSignal(0);
  const doubled = useComputed$(() => count.value * 2);

  const dataResource = useResource$(async ({ track }) => {
    const currentCount = track(() => count.value);
    const response = await fetch(\`/api/data?count=\${currentCount}\`);
    return response.json();
  });

  return (
    <div>
      <p>Count: {count.value}</p>
      <p>Doubled: {doubled.value}</p>
      <Resource
        value={dataResource}
        onPending={() => <p>Loading...</p>}
        onRejected={(error) => <p>Error: {error.message}</p>}
        onResolved={(data) => <pre>{JSON.stringify(data)}</pre>}
      />
    </div>
  );
});
`;

/**
 * Qwik City component with routeLoader$ and routeAction$
 */
export const COMPONENT_WITH_ROUTE_LOADERS_QWIK = `import { component$ } from '@builder.io/qwik';
import { routeLoader$, routeAction$, Form } from '@builder.io/qwik-city';

export const useProductData = routeLoader$(async ({ params }) => {
  const response = await fetch(\`/api/products/\${params.id}\`);
  return response.json();
});

export const useAddToCart = routeAction$(async (data, { redirect }) => {
  await fetch('/api/cart', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  throw redirect(302, '/cart');
});

export default component$(() => {
  const product = useProductData();
  const addToCart = useAddToCart();

  return (
    <div>
      <h1>{product.value.name}</h1>
      <p>{product.value.description}</p>
      <Form action={addToCart}>
        <input type="hidden" name="productId" value={product.value.id} />
        <button type="submit">Add to Cart</button>
      </Form>
    </div>
  );
});
`;

/**
 * Qwik component with slot handling
 */
export const COMPONENT_WITH_SLOTS_QWIK = `import { component$, Slot, useSignal } from '@builder.io/qwik';

interface Props {
  title: string;
  collapsible?: boolean;
}

export const Card = component$<Props>(({ title, collapsible = false }) => {
  const isOpen = useSignal(true);

  return (
    <div class="card">
      <header onClick$={() => collapsible && (isOpen.value = !isOpen.value)}>
        <h2>{title}</h2>
        <Slot name="actions" />
      </header>
      {isOpen.value && (
        <div class="content">
          <Slot />
        </div>
      )}
      <footer>
        <Slot name="footer" />
      </footer>
    </div>
  );
});
`;

/**
 * Deprecated Qwik component
 */
export const DEPRECATED_COMPONENT_QWIK = `import { component$, useSignal } from '@builder.io/qwik';

/**
 * @deprecated Use NewButton instead
 */
export const OldButton = component$(() => {
  const clicked = useSignal(false);

  return (
    <button onClick$={() => clicked.value = true}>
      {clicked.value ? 'Clicked!' : 'Click me'}
    </button>
  );
});
`;

/**
 * Qwik component using $ inline handlers
 */
export const COMPONENT_WITH_INLINE_HANDLERS_QWIK = `import { component$, useSignal, $ } from '@builder.io/qwik';

export const Form = component$(() => {
  const value = useSignal('');
  const submitted = useSignal(false);

  const handleSubmit = $((e: Event) => {
    e.preventDefault();
    submitted.value = true;
  });

  const handleChange = $((newValue: string) => {
    value.value = newValue;
  });

  return (
    <form preventdefault:submit onSubmit$={handleSubmit}>
      <input
        value={value.value}
        onInput$={(e) => handleChange((e.target as HTMLInputElement).value)}
      />
      <button type="submit">Submit</button>
      {submitted.value && <p>Submitted: {value.value}</p>}
    </form>
  );
});
`;
