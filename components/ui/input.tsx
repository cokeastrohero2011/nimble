import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'w-full border border-input bg-transparent px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
