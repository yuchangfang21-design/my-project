import coffee from './illustrations/coffee.svg?raw';
import cafe from './illustrations/cafe.svg?raw';
import pour from './illustrations/pour.svg?raw';
import matcha from './illustrations/matcha.svg?raw';
import beans from './illustrations/beans.svg?raw';
import poster from './illustrations/poster.svg?raw';

export const coverImages: Record<string, string> = Object.fromEntries(
  Object.entries({ coffee, cafe, pour, matcha, beans, poster }).map(([key, svg]) => [key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`]),
);
