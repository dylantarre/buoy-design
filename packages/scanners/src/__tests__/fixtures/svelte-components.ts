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
