/** A key, shown next to the action it triggers (ux.md §2.7). */
export function Kbd({ children }: { children: string }) {
  return <kbd className="kbd">{children}</kbd>;
}
