import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from '@/lib/utils';

export function Button({ className, ...props }: ButtonPrimitive.Props) {
  return (
    <ButtonPrimitive
      className={cn(
        'inline-flex items-center justify-center bg-primary text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}
