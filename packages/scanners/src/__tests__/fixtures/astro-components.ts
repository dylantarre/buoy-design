// packages/scanners/src/__tests__/fixtures/astro-components.ts

/**
 * Simple Astro component with no props
 */
export const SIMPLE_BUTTON_ASTRO = `---
---
<button class="btn">Click me</button>

<style>
  .btn {
    padding: 0.5rem 1rem;
    background: blue;
    color: white;
  }
</style>
`;

/**
 * Astro component with TypeScript props interface
 */
export const CARD_WITH_PROPS_ASTRO = `---
interface Props {
  title: string;
  description?: string;
  variant?: 'default' | 'featured';
}

const { title, description = 'No description', variant = 'default' } = Astro.props;
---
<article class:list={['card', variant]}>
  <h2>{title}</h2>
  {description && <p>{description}</p>}
</article>

<style>
  .card {
    padding: 1rem;
    border: 1px solid #ccc;
  }
  .featured {
    border-color: gold;
  }
</style>
`;

/**
 * Astro component with type alias for props
 */
export const COMPONENT_WITH_TYPE_PROPS_ASTRO = `---
type Props = {
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const { size, disabled = false } = Astro.props;
---
<button class={size} disabled={disabled}>
  <slot />
</button>
`;

/**
 * Astro component with inline destructured props
 */
export const INLINE_PROPS_ASTRO = `---
const { href, label, external = false } = Astro.props as { href: string; label: string; external?: boolean };
---
<a href={href} target={external ? '_blank' : undefined}>{label}</a>
`;

/**
 * Deprecated Astro component
 */
export const DEPRECATED_COMPONENT_ASTRO = `---
/**
 * @deprecated Use NewHeader instead
 */
interface Props {
  title: string;
}

const { title } = Astro.props;
---
<header>
  <h1>{title}</h1>
</header>
`;

/**
 * Astro component with imported dependencies
 */
export const COMPONENT_WITH_DEPENDENCIES_ASTRO = `---
import Header from './Header.astro';
import Footer from './Footer.astro';
import { formatDate } from '../utils/date';

interface Props {
  title: string;
}

const { title } = Astro.props;
---
<div class="layout">
  <Header title={title} />
  <main>
    <slot />
  </main>
  <Footer />
</div>
`;

/**
 * Astro layout component
 */
export const LAYOUT_ASTRO = `---
import Navigation from '../components/Navigation.astro';
import Footer from '../components/Footer.astro';
import '../styles/global.css';

interface Props {
  title: string;
  description?: string;
}

const { title, description } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
  </head>
  <body>
    <Navigation />
    <main>
      <slot />
    </main>
    <Footer />
  </body>
</html>
`;

/**
 * Astro component using Astro.slots
 */
export const COMPONENT_WITH_SLOTS_ASTRO = `---
interface Props {
  variant?: 'primary' | 'secondary';
}

const { variant = 'primary' } = Astro.props;
const hasFooter = Astro.slots.has('footer');
---
<div class:list={['container', variant]}>
  <div class="content">
    <slot />
  </div>
  {hasFooter && (
    <footer>
      <slot name="footer" />
    </footer>
  )}
</div>
`;

/**
 * Astro page component (should be detected too)
 */
export const PAGE_COMPONENT_ASTRO = `---
import Layout from '../layouts/Layout.astro';
import Card from '../components/Card.astro';

const posts = await Astro.glob('../content/blog/*.md');
---
<Layout title="Blog">
  <h1>Blog Posts</h1>
  {posts.map(post => (
    <Card title={post.frontmatter.title} description={post.frontmatter.description} />
  ))}
</Layout>
`;

/**
 * Astro recursive component using Astro.self
 */
export const RECURSIVE_COMPONENT_ASTRO = `---
import type { IComment } from '../types.js';
import Show from './Show.astro';
import Toggle from './Toggle.astro';

interface Props {
  comment: IComment;
}

const { comment } = Astro.props;
---
<li>
  <div class="by">
    <a href={\`/users/\${comment.user}\`}>{comment.user}</a>
    {comment.time_ago}
  </div>
  <div class="text" set:html={comment.content} />
  <Show when={comment.comments.length}>
    <Toggle open>
      {comment.comments.map((c: IComment) => <Astro.self comment={c} />)}
    </Toggle>
  </Show>
</li>
`;

/**
 * Astro component with set:html and set:text directives
 */
export const COMPONENT_WITH_DIRECTIVES_ASTRO = `---
interface Props {
  htmlContent: string;
  textContent: string;
  dangerousHtml?: string;
}

const { htmlContent, textContent, dangerousHtml } = Astro.props;
---
<article>
  <div class="html-content" set:html={htmlContent} />
  <div class="text-content" set:text={textContent} />
  {dangerousHtml && <div class="dangerous" set:html={dangerousHtml} />}
</article>
`;

/**
 * Astro component with external type imports
 */
export const COMPONENT_WITH_TYPE_IMPORTS_ASTRO = `---
import type { PageMeta, Author } from '../types.js';
import type { ImageAsset } from '@astro/assets';
import Header from './Header.astro';

interface Props {
  meta: PageMeta;
  author: Author;
  image?: ImageAsset;
}

const { meta, author, image } = Astro.props;
---
<article>
  <Header title={meta.title} />
  {image && <img src={image.src} alt={meta.title} />}
  <footer>By {author.name}</footer>
</article>
`;

/**
 * Astro component with complex multiline Props interface
 */
export const COMPONENT_WITH_COMPLEX_PROPS_ASTRO = `---
interface Props {
  title: string;
  subtitle?: string;
  variant: 'primary' | 'secondary' | 'tertiary';
  size: 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  onClick?: () => void;
  items: Array<{
    id: string;
    label: string;
    icon?: string;
  }>;
  config: {
    showHeader: boolean;
    showFooter: boolean;
    theme: 'light' | 'dark';
  };
}

const {
  title,
  subtitle,
  variant = 'primary',
  size = 'md',
  disabled = false,
  items = [],
  config
} = Astro.props;
---
<div class:list={['component', variant, size, { disabled }]}>
  <h1>{title}</h1>
  {subtitle && <h2>{subtitle}</h2>}
  <ul>
    {items.map(item => (
      <li>
        {item.icon && <span class="icon">{item.icon}</span>}
        {item.label}
      </li>
    ))}
  </ul>
</div>
`;

/**
 * Astro component with named slot fallback pattern
 */
export const COMPONENT_WITH_SLOT_FALLBACK_ASTRO = `---
interface Props {
  url: string;
  title: string;
}

const { url, title } = Astro.props;
---
<div class="story">
  <slot name="content">
    <a href={url}>{title}</a>
  </slot>
  <slot name="fallback">
    <a slot="fallback" href={\`/item/\${title}\`}>{title}</a>
  </slot>
</div>
`;

/**
 * Astro component importing from multiple frameworks
 */
export const COMPONENT_WITH_MULTI_FRAMEWORK_ASTRO = `---
import ReactCounter from './ReactCounter.jsx';
import VueCard from './VueCard.vue';
import SvelteButton from './SvelteButton.svelte';
import SolidToggle from './SolidToggle.tsx';

interface Props {
  count: number;
}

const { count } = Astro.props;
---
<div class="multi-framework">
  <ReactCounter client:load count={count} />
  <VueCard client:visible title="Vue Card" />
  <SvelteButton client:idle label="Svelte Button" />
  <SolidToggle client:only="solid" initial={true} />
</div>
`;
