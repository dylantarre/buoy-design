export const SIMPLE_BUTTON = `
import React from 'react';

export function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick}>{children}</button>;
}
`;

export const ARROW_COMPONENT = `
import React from 'react';

export const Card = ({ title }: { title: string }) => {
  return <div className="card">{title}</div>;
};
`;

export const HARDCODED_STYLES = `
import React from 'react';

export function Badge({ label }: { label: string }) {
  return (
    <span style={{ backgroundColor: '#ff0000', padding: '8px' }}>
      {label}
    </span>
  );
}
`;

export const DEPRECATED_COMPONENT = `
import React from 'react';

/**
 * @deprecated Use NewButton instead
 */
export function OldButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick}>Click</button>;
}
`;

// Mantine polymorphicFactory pattern
export const MANTINE_POLYMORPHIC_FACTORY = `
import { polymorphicFactory } from '@mantine/core';

interface ButtonProps {
  variant?: 'filled' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

interface ButtonFactory {
  props: ButtonProps;
  ref: HTMLButtonElement;
  defaultComponent: 'button';
}

export const Button = polymorphicFactory<ButtonFactory>((_props, ref) => {
  return <button ref={ref}>Click me</button>;
});
`;

// Chakra UI createRecipeContext pattern
export const CHAKRA_RECIPE_CONTEXT = `
import { createRecipeContext } from '@chakra-ui/react';
import { forwardRef } from 'react';

interface ButtonProps {
  variant?: 'solid' | 'ghost';
}

const { withContext, PropsProvider } = createRecipeContext({ key: "button" });

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return <button ref={ref} {...props}>Click</button>;
});
`;

// Chakra UI createSlotRecipeContext pattern
export const CHAKRA_SLOT_RECIPE_CONTEXT = `
import { createSlotRecipeContext } from '@chakra-ui/react';

interface CardProps {
  title: string;
}

const { withContext, withProvider } = createSlotRecipeContext({ key: "card" });

export const Card = withContext<CardProps>((props) => {
  return <div>{props.title}</div>;
});
`;

// shadcn/ui cva pattern - cva is used to define variant styles,
// the actual component is still a forwardRef or arrow function
export const SHADCN_CVA = `
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-input bg-background",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps extends VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return <button ref={ref} className={buttonVariants({ variant, size, className })} {...props} />;
  }
);
`;

// withContext pattern (used in various UI libraries)
export const WITH_CONTEXT_PATTERN = `
import { withContext } from '@some-ui/core';

interface TooltipProps {
  content: string;
}

export const Tooltip = withContext<TooltipProps>((props) => {
  return <div data-tooltip={props.content}>{props.children}</div>;
});
`;

// withProvider pattern
export const WITH_PROVIDER_PATTERN = `
import { withProvider } from '@some-ui/core';

interface ThemeableButtonProps {
  variant: 'primary' | 'secondary';
}

export const ThemeableButton = withProvider<ThemeableButtonProps>((props) => {
  return <button className={props.variant}>{props.children}</button>;
});
`;

// Compound component with Object.assign pattern (HeadlessUI / Primer style)
export const COMPOUND_COMPONENT_OBJECT_ASSIGN = `
import React, { forwardRef } from 'react';

const MenuRoot = forwardRef<HTMLDivElement>((props, ref) => {
  return <div ref={ref} role="menu">{props.children}</div>;
});

const MenuButton = forwardRef<HTMLButtonElement>((props, ref) => {
  return <button ref={ref}>{props.children}</button>;
});

const MenuItem = forwardRef<HTMLDivElement>((props, ref) => {
  return <div ref={ref} role="menuitem">{props.children}</div>;
});

const MenuSeparator = () => {
  return <hr />;
};

export const Menu = Object.assign(MenuRoot, {
  Button: MenuButton,
  Item: MenuItem,
  Separator: MenuSeparator,
});
`;

// Compound component with simple property assignment
export const COMPOUND_COMPONENT_PROPERTY_ASSIGNMENT = `
import React from 'react';

export function Dialog({ children }: { children: React.ReactNode }) {
  return <div role="dialog">{children}</div>;
}

function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h2>{children}</h2>;
}

function DialogContent({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return <footer>{children}</footer>;
}

Dialog.Title = DialogTitle;
Dialog.Content = DialogContent;
Dialog.Footer = DialogFooter;
`;

// React Bootstrap style compound components
export const COMPOUND_COMPONENT_REACT_BOOTSTRAP = `
import React from 'react';
import { forwardRef } from 'react';

const CardRoot = forwardRef<HTMLDivElement>((props, ref) => {
  return <div ref={ref} className="card">{props.children}</div>;
});

const CardHeader = forwardRef<HTMLDivElement>((props, ref) => {
  return <div ref={ref} className="card-header">{props.children}</div>;
});

const CardBody = forwardRef<HTMLDivElement>((props, ref) => {
  return <div ref={ref} className="card-body">{props.children}</div>;
});

const CardFooter = forwardRef<HTMLDivElement>((props, ref) => {
  return <div ref={ref} className="card-footer">{props.children}</div>;
});

CardRoot.displayName = 'Card';

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
`;

// forwardRef with displayName assignment - Primer React pattern
// This pattern: const X = forwardRef(...) as Type; X.displayName = 'X';
export const FORWARD_REF_WITH_DISPLAYNAME = `
import { forwardRef } from 'react';
import type { ForwardRefComponent } from './types';

interface TokenProps {
  text: string;
  size?: 'small' | 'medium' | 'large';
}

const Token = forwardRef((props, forwardedRef) => {
  const { text, size = 'medium', ...rest } = props;
  return (
    <span ref={forwardedRef} data-size={size} {...rest}>
      {text}
    </span>
  );
}) as ForwardRefComponent<'span', TokenProps>;

Token.displayName = 'Token';

export default Token;
`;

// forwardRef with displayName but no type assertion
export const FORWARD_REF_WITH_DISPLAYNAME_NO_ASSERTION = `
import React from 'react';

const IconButton = React.forwardRef<HTMLButtonElement, { icon: string }>(
  ({ icon, ...props }, ref) => {
    return (
      <button ref={ref} {...props}>
        <span className="icon">{icon}</span>
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export default IconButton;
`;

// forwardRef with type assertion inline but displayName after
export const FORWARD_REF_TYPED_WITH_DISPLAYNAME = `
import { forwardRef } from 'react';

interface LinkProps {
  href: string;
  external?: boolean;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(({ href, external, children, ...props }, ref) => {
  return (
    <a
      ref={ref}
      href={href}
      target={external ? '_blank' : undefined}
      {...props}
    >
      {children}
    </a>
  );
});

Link.displayName = 'Link';

export { Link };
`;
