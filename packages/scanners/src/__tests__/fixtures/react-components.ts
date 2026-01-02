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

// Chakra UI chakra() styled component factory pattern
// This creates styled components using a factory function
export const CHAKRA_STYLED_FACTORY = `
"use client"

import { type HTMLChakraProps, chakra } from "../../styled-system";

export interface CenterProps extends HTMLChakraProps<"div"> {}

export const Center = chakra("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
});
`;

// Chakra UI chakra() with complex config and variants
export const CHAKRA_STYLED_FACTORY_WITH_VARIANTS = `
"use client"

import { type HTMLChakraProps, chakra } from "../../styled-system";

export interface InputElementProps extends HTMLChakraProps<"div"> {}

export const InputElement = chakra("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    zIndex: 2,
    color: "fg.muted",
    height: "full",
    fontSize: "sm",
    px: "3",
  },
  variants: {
    placement: {
      start: {
        insetInlineStart: "0",
      },
      end: {
        insetInlineEnd: "0",
      },
    },
  },
});
`;

// Mantine factory<Type>() pattern
export const MANTINE_FACTORY = `
import { factory } from '@mantine/core';

interface MonthFactory {
  props: MonthProps;
  ref: HTMLDivElement;
}

interface MonthProps {
  value: Date;
  onChange: (date: Date) => void;
}

export const Month = factory<MonthFactory>((_props, ref) => {
  const props = useProps('Month', null, _props);
  return (
    <div ref={ref}>
      {props.value.toDateString()}
    </div>
  );
});
`;

// Mantine factory with compound components
export const MANTINE_FACTORY_WITH_STATICS = `
import { factory } from '@mantine/core';

interface DatePickerFactory {
  props: DatePickerProps;
  ref: HTMLDivElement;
  staticComponents: {
    Input: typeof DatePickerInput;
  };
}

const DatePickerInput = () => {
  return <input type="date" />;
};

export const DatePicker = factory<DatePickerFactory>((_props, ref) => {
  return <div ref={ref}>Date Picker</div>;
});

DatePicker.Input = DatePickerInput;
`;

// Chakra v3 withProvider/withContext with string arguments pattern
// These create styled components by wrapping an HTML element with context
export const CHAKRA_WITH_PROVIDER_STRING_ARGS = `
"use client"

import {
  type HTMLChakraProps,
  type SlotRecipeProps,
  createSlotRecipeContext,
} from "../../styled-system";

const {
  withProvider,
  withContext,
  useStyles: useCardStyles,
} = createSlotRecipeContext({ key: "card" });

export interface CardRootProps extends HTMLChakraProps<"div", SlotRecipeProps<"card">> {}

export const CardRoot = withProvider<HTMLDivElement, CardRootProps>(
  "div",
  "root",
);

export interface CardBodyProps extends HTMLChakraProps<"div"> {}

export const CardBody = withContext<HTMLDivElement, CardBodyProps>(
  "div",
  "body",
);

export interface CardHeaderProps extends HTMLChakraProps<"div"> {}

export const CardHeader = withContext<HTMLDivElement, CardHeaderProps>(
  "div",
  "header",
);
`;

// React.FC type annotated functional components (Radix pattern)
export const REACT_FC_ANNOTATED_COMPONENT = `
import * as React from 'react';

interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

const TooltipProvider: React.FC<TooltipProviderProps> = (props) => {
  const { children, delayDuration = 700 } = props;
  return (
    <div data-delay={delayDuration}>
      {children}
    </div>
  );
};

TooltipProvider.displayName = 'TooltipProvider';

export { TooltipProvider };
`;

// memo() wrapped forwardRef component
export const MEMO_FORWARD_REF_COMPONENT = `
import React, { forwardRef, memo } from 'react';

interface MemoizedButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const MemoizedButton = memo(
  forwardRef<HTMLButtonElement, MemoizedButtonProps>(
    ({ onClick, children }, ref) => {
      return (
        <button ref={ref} onClick={onClick}>
          {children}
        </button>
      );
    }
  )
);

MemoizedButton.displayName = 'MemoizedButton';
`;

// Named function expression inside forwardRef (Chakra pattern)
export const FORWARD_REF_NAMED_FUNCTION = `
import { forwardRef } from 'react';

interface ButtonProps {
  loading?: boolean;
  children: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(inProps, ref) {
    const { loading, children, ...rest } = inProps;
    return (
      <button ref={ref} disabled={loading} {...rest}>
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
`;

// Function declaration component (shadcn v4 style) - not const assignment
export const FUNCTION_DECLARATION_WITH_JSX = `
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
      },
    },
  }
);

function Button({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={buttonVariants({ variant, className })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
`;

// Multiple components in single file with different patterns
export const MULTI_PATTERN_FILE = `
import React, { forwardRef, memo } from 'react';

// React.FC pattern
const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="container">{children}</div>;
};

// Arrow function component
export const Wrapper = ({ children }: { children: React.ReactNode }) => {
  return <section className="wrapper">{children}</section>;
};

// forwardRef with memo
export const Card = memo(
  forwardRef<HTMLDivElement, { title: string }>(({ title }, ref) => {
    return <div ref={ref} className="card">{title}</div>;
  })
);

// Function declaration
function Footer({ copyright }: { copyright: string }) {
  return <footer>{copyright}</footer>;
}

export { Container, Footer };
`;

// Chakra v3 withContext/withProvider with string element as first argument
// This creates styled components that wrap a basic HTML element
export const CHAKRA_V3_WITH_CONTEXT_STRING_ELEMENT = `
"use client"

import {
  type HTMLChakraProps,
  type RecipeProps,
  type UnstyledProp,
  createRecipeContext,
} from "../../styled-system"

const { withContext, PropsProvider } = createRecipeContext({
  key: "kbd",
})

export interface KbdBaseProps extends RecipeProps<"kbd">, UnstyledProp {}

export interface KbdProps extends HTMLChakraProps<"kbd", KbdBaseProps> {}

export const Kbd = withContext<HTMLElement, KbdProps>("kbd")

Kbd.displayName = "Kbd"
`;

// Radix-style named alias exports pattern
// Components are assigned to alias names for convenient API (e.g., Tooltip.Root)
export const RADIX_NAMED_ALIAS_EXPORTS = `
import * as React from 'react';

const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div data-provider>{children}</div>;
};

TooltipProvider.displayName = 'TooltipProvider';

const Tooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div data-tooltip>{children}</div>;
};

Tooltip.displayName = 'Tooltip';

const TooltipTrigger = React.forwardRef<HTMLButtonElement>((props, ref) => {
  return <button ref={ref} {...props} />;
});

TooltipTrigger.displayName = 'TooltipTrigger';

const TooltipContent = React.forwardRef<HTMLDivElement>((props, ref) => {
  return <div ref={ref} {...props} />;
});

TooltipContent.displayName = 'TooltipContent';

// Named aliases for compound component pattern
const Provider = TooltipProvider;
const Root = Tooltip;
const Trigger = TooltipTrigger;
const Content = TooltipContent;

export {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Provider,
  Root,
  Trigger,
  Content,
};
`;

// Ark UI pattern - components wrapping external library components with withProvider/withContext
export const ARK_UI_WRAPPED_COMPONENT_PATTERN = `
"use client"

import type { Assign } from "@ark-ui/react"
import { Accordion as ArkAccordion } from "@ark-ui/react/accordion"
import {
  type HTMLChakraProps,
  type SlotRecipeProps,
  type UnstyledProp,
  createSlotRecipeContext,
} from "../../styled-system"

const {
  withProvider,
  withContext,
  useStyles: useAccordionStyles,
} = createSlotRecipeContext({ key: "accordion" })

export interface AccordionRootProps
  extends HTMLChakraProps<"div", AccordionRootBaseProps> {}

export const AccordionRoot = withProvider<HTMLDivElement, AccordionRootProps>(
  ArkAccordion.Root,
  "root",
  { forwardAsChild: true },
)

export interface AccordionItemProps
  extends HTMLChakraProps<"div", ArkAccordion.ItemBaseProps>,
    UnstyledProp {}

export const AccordionItem = withContext<HTMLDivElement, AccordionItemProps>(
  ArkAccordion.Item,
  "item",
  { forwardAsChild: true },
)

export interface AccordionItemBodyProps
  extends HTMLChakraProps<"div">,
    UnstyledProp {}

export const AccordionItemBody = withContext<
  HTMLDivElement,
  AccordionItemBodyProps
>("div", "itemBody")
`;

// Chakra chakra.element style - using property access on the chakra factory
export const CHAKRA_ELEMENT_STYLE = `
"use client"

import { forwardRef, useMemo } from "react"
import { chakra } from "../../styled-system"

export const Button = forwardRef<HTMLButtonElement>((props, ref) => {
  return (
    <chakra.button ref={ref} type="button" {...props}>
      {props.children}
    </chakra.button>
  )
})

Button.displayName = "Button"
`;

// React.lazy pattern for code splitting
export const REACT_LAZY_COMPONENT = `
import { lazy } from 'react';

// Dynamic import with lazy loading
export const LazyButton = lazy(() => import('./Button'));

// React.lazy shorthand
export const LazyCard = React.lazy(() => import('./Card'));

// Named export with lazy
const LazyModal = lazy(() => import('./Modal').then(m => ({ default: m.Modal })));
export { LazyModal };
`;

// Complex nested HOC patterns - stacking multiple wrappers
export const NESTED_HOC_PATTERN = `
import React, { memo, forwardRef } from 'react';

// memo wrapping forwardRef with type assertion
export const ComplexButton = memo(
  forwardRef<HTMLButtonElement, { label: string }>(
    ({ label, ...props }, ref) => (
      <button ref={ref} {...props}>{label}</button>
    )
  )
) as React.MemoExoticComponent<React.ForwardRefExoticComponent<{ label: string } & React.RefAttributes<HTMLButtonElement>>>;

ComplexButton.displayName = 'ComplexButton';

// React.lazy would be loaded component - but the definition itself is what we detect
const LazyComponent = React.lazy(() => import('./SomeComponent'));

// Higher-order function returning component factory
const withTracking = (Component: React.ComponentType<any>) =>
  forwardRef<HTMLDivElement>((props, ref) => (
    <Component ref={ref} data-tracking {...props} />
  ));

export const TrackedCard = withTracking(
  forwardRef<HTMLDivElement>((props, ref) => (
    <div ref={ref} className="card">{props.children}</div>
  ))
);
`;

// Chakra v3 withRootProvider pattern - wraps external Ark UI components
export const CHAKRA_WITH_ROOT_PROVIDER = `
"use client"

import type { Assign } from "@ark-ui/react"
import { Dialog as ArkDialog } from "@ark-ui/react/dialog"
import {
  type HTMLChakraProps,
  type SlotRecipeProps,
  type UnstyledProp,
  createSlotRecipeContext,
} from "../../styled-system"

const {
  withRootProvider,
  withContext,
  useStyles: useDrawerStyles,
} = createSlotRecipeContext({ key: "drawer" })

export interface DrawerRootProviderProps {
  children: React.ReactNode
}

export const DrawerRootProvider = withRootProvider<DrawerRootProviderProps>(
  ArkDialog.RootProvider,
  {
    defaultProps: { unmountOnExit: true, lazyMount: true },
  },
)

export interface DrawerRootProps {
  children: React.ReactNode
}

export const DrawerRoot = withRootProvider<DrawerRootProps>(ArkDialog.Root, {
  defaultProps: { unmountOnExit: true, lazyMount: true },
})

export interface DrawerTriggerProps extends HTMLChakraProps<"button">, UnstyledProp {}

export const DrawerTrigger = withContext<HTMLButtonElement, DrawerTriggerProps>(
  ArkDialog.Trigger,
  "trigger",
  { forwardAsChild: true },
)
`;

// Inner/local components inside factory functions should NOT be detected
// This pattern is common in Chakra UI's createSlotRecipeContext
export const FACTORY_WITH_INNER_COMPONENTS = `
"use client"

import { forwardRef } from "react"

// Factory function that creates components internally
export const createRecipeContext = (options) => {
  // These are LOCAL components - should NOT be detected as top-level components
  const StyledComponent = (inProps) => {
    return <div {...inProps} />;
  };

  const withProvider = (Component, slot) => {
    // Another inner component - also should NOT be detected
    const ProviderComponent = forwardRef((props, ref) => {
      return <Component ref={ref} {...props} />;
    });

    ProviderComponent.displayName = Component.displayName;
    return ProviderComponent;
  };

  const withContext = (Component, slot) => {
    // Yet another inner component
    const ContextComponent = forwardRef((props, ref) => {
      return <Component ref={ref} {...props} />;
    });

    ContextComponent.displayName = Component.displayName;
    return ContextComponent;
  };

  return { withProvider, withContext };
};

// This IS a real exported component - should be detected
export const Button = forwardRef((props, ref) => {
  return <button ref={ref} {...props} />;
});

Button.displayName = "Button";
`;
