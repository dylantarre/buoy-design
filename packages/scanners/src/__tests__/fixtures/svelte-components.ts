export const SIMPLE_BUTTON_SVELTE = `
<script lang="ts">
  export let label: string;
  export let onClick: () => void;
</script>

<button on:click={onClick}>{label}</button>

<style>
  button { color: #0066cc; }
</style>
`;

export const CARD_WITH_PROPS_SVELTE = `
<script>
  export let title;
  export let description = 'Default description';
</script>

<div class="card">
  <h2>{title}</h2>
  <p>{description}</p>
</div>
`;

export const SVELTE5_PROPS_COMPONENT = `
<script lang="ts">
  let { label, count = 0 } = $props();
</script>

<div>
  <span>{label}</span>
  <span>{count}</span>
</div>
`;

export const DEPRECATED_COMPONENT_SVELTE = `
<script lang="ts">
  /**
   * @deprecated Use NewButton instead
   */
  export let label: string;
</script>

<button>{label}</button>
`;

export const COMPONENT_WITH_DEPENDENCIES_SVELTE = `
<script>
  import Header from './Header.svelte';
  import Footer from './Footer.svelte';
</script>

<Header />
<main>Content</main>
<Footer />
`;

// Svelte 5 with interface Props and const destructuring (shadcn-svelte pattern)
export const SVELTE5_CONST_PROPS_COMPONENT = `
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
    framework?: string;
    files?: Record<string, string>;
  }

  const { children, framework, files = {} }: Props = $props();
</script>

<div>{@render children?.()}</div>
`;

// Svelte 5 with $bindable() rune
export const SVELTE5_BINDABLE_PROPS_COMPONENT = `
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    variant = "default",
    size = "md",
    class: className,
    ...restProps
  }: HTMLButtonAttributes & {
    variant?: "default" | "outline";
    size?: "sm" | "md" | "lg";
    ref?: HTMLElement | null;
  } = $props();
</script>

<button bind:this={ref} class={className} {...restProps}>
  <slot />
</button>
`;

// Svelte 5 with module script (exports variants outside component)
export const SVELTE5_MODULE_SCRIPT_COMPONENT = `
<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const buttonVariants = tv({
    base: "inline-flex items-center",
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-white",
      },
    },
  });
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    variant,
    size,
    children,
    class: className,
  }: VariantProps<typeof buttonVariants> & {
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<button class={buttonVariants({ variant, size })}>
  {@render children?.()}
</button>
`;

// Real-world Svelte 5 component with complex type intersection (like shadcn-svelte card)
export const SVELTE5_HTML_ATTRIBUTES_COMPONENT = `
<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={className} {...restProps}>
  {@render children?.()}
</div>
`;
