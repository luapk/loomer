'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/src/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[#111] text-white hover:bg-[#333] focus-visible:ring-[#111] rounded-none [font-family:\'JetBrains_Mono\',monospace] tracking-[0.18em] uppercase text-[10px]',
        secondary:
          'bg-white/60 border border-stone-200 text-stone-700 hover:bg-white/90 backdrop-blur-sm focus-visible:ring-stone-400 rounded-xl',
        ghost:
          'text-stone-600 hover:bg-stone-100/60 hover:text-stone-900 focus-visible:ring-stone-400 rounded-xl',
        destructive:
          'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 focus-visible:ring-red-400 rounded-xl',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
