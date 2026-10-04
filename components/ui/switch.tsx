'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'group relative inline-flex h-6 w-11 items-center rounded-full bg-input outline-none transition-colors data-checked:bg-primary focus-visible:ring-3 focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform group-data-checked:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}
